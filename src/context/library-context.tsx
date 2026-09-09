import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";

import { ExpoFileSystemStore } from "@/storage/expo-file-store";
import { extensionFromUrl, idForFile, idForUrl } from "@/storage/id";
import {
  importExternalFile,
  isSavedOffline,
  removeOfflineCopy,
  saveOffline,
} from "@/storage/library-content";
import { BUNDLED_SCRIPTS, BUNDLED_SIGNALS } from "@/storage/library-registry";
import {
  loadLibraryItems,
  removeItem as removeFromIndex,
  saveLibraryItems,
  upsertItem,
} from "@/storage/library-store";
import type { LibraryManifest } from "@/storage/library-manifest";
import type {
  LibraryItem,
  LibraryScript,
  LibrarySignal,
} from "@/storage/library-types";
import { WebFileStore } from "@/storage/web-file-store";

// expo-file-system's Directory/File classes are unimplemented on web, so
// the web build needs its own IndexedDB-backed FileStorePort instead.
const fileStore =
  Platform.OS === "web" ? new WebFileStore() : new ExpoFileSystemStore();

type LibraryContextValue = {
  isLoaded: boolean;
  signals: LibrarySignal[];
  scripts: LibraryScript[];
  addSignalFromUrl: (url: string, name: string) => Promise<void>;
  addScriptFromUrl: (url: string, name: string) => Promise<void>;
  addSignalFromFile: (
    fileUri: string,
    fileName: string,
    name: string,
  ) => Promise<void>;
  addScriptFromFile: (
    fileUri: string,
    fileName: string,
    name: string,
  ) => Promise<void>;
  importManifest: (manifest: LibraryManifest) => Promise<void>;
  removeItem: (item: LibraryItem) => Promise<void>;
  setSavedOffline: (item: LibraryItem, saved: boolean) => Promise<void>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: PropsWithChildren) {
  const [persisted, setPersisted] = useState<LibraryItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLibraryItems().then((items) => {
      if (cancelled) return;
      setPersisted(items);
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistedSignals = useMemo(
    () =>
      persisted.filter((item): item is LibrarySignal => item.kind === "signal"),
    [persisted],
  );
  const persistedScripts = useMemo(
    () =>
      persisted.filter((item): item is LibraryScript => item.kind === "script"),
    [persisted],
  );

  const signals = useMemo(
    () => [...BUNDLED_SIGNALS, ...persistedSignals],
    [persistedSignals],
  );
  const scripts = useMemo(
    () => [...BUNDLED_SCRIPTS, ...persistedScripts],
    [persistedScripts],
  );

  const persist = useCallback((next: LibraryItem[]) => {
    setPersisted(next);
    void saveLibraryItems(next);
  }, []);

  const addSignalFromUrl = useCallback(
    async (url: string, name: string) => {
      const item: LibrarySignal = {
        id: idForUrl(url),
        kind: "signal",
        name,
        source: { type: "url", url },
        savedOffline: false,
        addedAt: Date.now(),
      };
      persist(upsertItem(persisted, item));
    },
    [persist, persisted],
  );

  const addScriptFromUrl = useCallback(
    async (url: string, name: string) => {
      const item: LibraryScript = {
        id: idForUrl(url),
        kind: "script",
        name,
        source: { type: "url", url },
        savedOffline: false,
        addedAt: Date.now(),
      };
      persist(upsertItem(persisted, item));
    },
    [persist, persisted],
  );

  const addSignalFromFile = useCallback(
    async (fileUri: string, fileName: string, name: string) => {
      const id = idForFile();
      const source = await importExternalFile(
        "signals",
        id,
        fileUri,
        fileStore,
        extensionFromUrl(fileName, "audio"),
      );
      const item: LibrarySignal = {
        id,
        kind: "signal",
        name,
        source,
        savedOffline: true,
        addedAt: Date.now(),
      };
      persist(upsertItem(persisted, item));
    },
    [persist, persisted],
  );

  const addScriptFromFile = useCallback(
    async (fileUri: string, fileName: string, name: string) => {
      const id = idForFile();
      const source = await importExternalFile(
        "scripts",
        id,
        fileUri,
        fileStore,
        extensionFromUrl(fileName, "yaml"),
      );
      const item: LibraryScript = {
        id,
        kind: "script",
        name,
        source,
        savedOffline: true,
        addedAt: Date.now(),
      };
      persist(upsertItem(persisted, item));
    },
    [persist, persisted],
  );

  const importManifest = useCallback(
    async (manifest: LibraryManifest) => {
      const importedAt = Date.now();
      const incomingIds = new Set(
        [...manifest.signals, ...manifest.scripts].map((entry) =>
          idForUrl(entry.url),
        ),
      );
      const staleItems = persisted.filter(
        (item) =>
          item.manifestUrl === manifest.url && !incomingIds.has(item.id),
      );
      await Promise.all(
        staleItems.map((item) => {
          if (item.source.type === "bundled") return Promise.resolve();
          return removeOfflineCopy(
            item.kind === "signal" ? "signals" : "scripts",
            item.id,
            item.source,
            fileStore,
            item.kind === "signal" ? "audio" : "yaml",
          );
        }),
      );

      let next = persisted.filter(
        (item) => item.manifestUrl !== manifest.url || incomingIds.has(item.id),
      );
      const importEntry = (
        kind: "signal" | "script",
        entry: LibraryManifest["signals"][number],
      ) => {
        const id = idForUrl(entry.url);
        const existing = next.find((item) => item.id === id);
        const item: LibraryItem = {
          id,
          kind,
          name: entry.name,
          source: { type: "url", url: entry.url },
          savedOffline: existing?.savedOffline ?? false,
          addedAt: existing?.addedAt ?? importedAt,
          manifestUrl: manifest.url,
        };
        next = upsertItem(next, item);
      };
      manifest.signals.forEach((entry) => importEntry("signal", entry));
      manifest.scripts.forEach((entry) => importEntry("script", entry));
      persist(next);
    },
    [persist, persisted],
  );

  const removeItem = useCallback(
    async (item: LibraryItem) => {
      const kind = item.kind === "signal" ? "signals" : "scripts";
      const defaultExt = item.kind === "signal" ? "audio" : "yaml";
      if (item.source.type !== "bundled") {
        await removeOfflineCopy(
          kind,
          item.id,
          item.source,
          fileStore,
          defaultExt,
        );
      }
      persist(removeFromIndex(persisted, item.id));
    },
    [persist, persisted],
  );

  const setSavedOffline = useCallback(
    async (item: LibraryItem, saved: boolean) => {
      if (item.source.type === "bundled") return; // always offline; nothing to toggle
      const kind = item.kind === "signal" ? "signals" : "scripts";
      const defaultExt = item.kind === "signal" ? "audio" : "yaml";
      if (saved) {
        await saveOffline(kind, item.id, item.source, fileStore, defaultExt);
      } else {
        await removeOfflineCopy(
          kind,
          item.id,
          item.source,
          fileStore,
          defaultExt,
        );
      }
      const nowSaved = await isSavedOffline(
        kind,
        item.id,
        item.source,
        fileStore,
        defaultExt,
      );
      persist(
        upsertItem(persisted, {
          ...item,
          savedOffline: nowSaved,
        } as LibraryItem),
      );
    },
    [persist, persisted],
  );

  return (
    <LibraryContext.Provider
      value={{
        isLoaded,
        signals,
        scripts,
        addSignalFromUrl,
        addScriptFromUrl,
        addSignalFromFile,
        addScriptFromFile,
        importManifest,
        removeItem,
        setSavedOffline,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within a LibraryProvider");
  return ctx;
}

/** Exposed for the Run screen, which needs the same file store to resolve
 * signals and script text before starting a run. */
export function getLibraryFileStore() {
  return fileStore;
}
