import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, TextInput } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { previewSignal } from "@/audio";
import { Button } from "@/components/button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  BottomTabInset,
  MaxContentWidth,
  Spacing,
  TopTabInset,
} from "@/constants/theme";
import { getLibraryFileStore, useLibrary } from "@/context/library-context";
import { useTheme } from "@/hooks/use-theme";
import {
  loadLibraryManifest,
  type LibraryManifest,
} from "@/storage/library-manifest";
import type {
  LibraryItem,
  LibraryScript,
  LibrarySignal,
} from "@/storage/library-types";
import { resolveScriptText } from "@/storage/scripts";

function sourceBadge(item: LibraryItem): string {
  return item.manifestUrl ? "manifest" : item.source.type;
}

function manifestHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function SignalRow({ item }: { item: LibrarySignal }) {
  const { removeItem, setSavedOffline } = useLibrary();
  const isBundled = item.source.type === "bundled";
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const toggleOffline = async () => {
    setBusy(true);
    try {
      await setSavedOffline(item, !item.savedOffline);
    } finally {
      setBusy(false);
    }
  };

  const play = async () => {
    setPlaying(true);
    setPlayError(null);
    try {
      await previewSignal(item, getLibraryFileStore());
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlaying(false);
    }
  };

  return (
    <ThemedView style={styles.row}>
      <ThemedView style={styles.rowMain}>
        <ThemedText type="smallBold">{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sourceBadge(item)} ·{" "}
          {item.savedOffline ? "saved offline" : "not saved offline"}
        </ThemedText>
        {playError && (
          <ThemedText type="small" themeColor="danger">
            {playError}
          </ThemedText>
        )}
      </ThemedView>
      <ThemedView style={styles.rowActions}>
        <Button
          label={playing ? "Playing…" : "Play"}
          onPress={play}
          loading={playing}
          size="small"
        />
        {!isBundled && item.source.type === "url" && (
          <Button
            label={item.savedOffline ? "Remove offline" : "Save offline"}
            onPress={toggleOffline}
            disabled={busy}
            size="small"
          />
        )}
        {!isBundled && (
          <Button
            label="Remove"
            onPress={() => removeItem(item)}
            variant="danger"
            size="small"
          />
        )}
      </ThemedView>
    </ThemedView>
  );
}

function ScriptRow({
  item,
  onView,
}: {
  item: LibraryScript;
  onView: (item: LibraryScript) => void;
}) {
  const { removeItem, setSavedOffline } = useLibrary();
  const isBundled = item.source.type === "bundled";
  const [busy, setBusy] = useState(false);

  const toggleOffline = async () => {
    setBusy(true);
    try {
      await setSavedOffline(item, !item.savedOffline);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.row}>
      <ThemedView style={styles.rowMain}>
        <ThemedText type="smallBold">{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sourceBadge(item)} ·{" "}
          {item.savedOffline ? "saved offline" : "not saved offline"}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.rowActions}>
        <Button label="View" onPress={() => onView(item)} size="small" />
        {!isBundled && item.source.type === "url" && (
          <Button
            label={item.savedOffline ? "Remove offline" : "Save offline"}
            onPress={toggleOffline}
            disabled={busy}
            size="small"
          />
        )}
        {!isBundled && (
          <Button
            label="Remove"
            onPress={() => removeItem(item)}
            variant="danger"
            size="small"
          />
        )}
      </ThemedView>
    </ThemedView>
  );
}

function ScriptViewer({
  item,
  onClose,
}: {
  item: LibraryScript;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveScriptText(item, getLibraryFileStore())
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <ThemedView style={styles.overlay}>
      <SafeAreaView style={styles.overlaySafeArea}>
        <ThemedView type="backgroundElement" style={styles.overlayCard}>
          <ThemedView style={styles.overlayHeader}>
            <ThemedText
              type="subtitle"
              style={styles.overlayTitle}
              numberOfLines={1}
            >
              {item.name}
            </ThemedText>
            <Button label="Close" onPress={onClose} size="small" />
          </ThemedView>
          <ScrollView
            style={styles.overlayScroll}
            contentContainerStyle={styles.overlayScrollContent}
          >
            {error ? (
              <ThemedText themeColor="danger">{error}</ThemedText>
            ) : text === null ? (
              <ThemedText themeColor="textSecondary">Loading…</ThemedText>
            ) : (
              <ThemedText type="code" selectable>
                {text}
              </ThemedText>
            )}
          </ScrollView>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ImportItemPrompt({
  kind,
  name,
  onNameChange,
  onAddFromUrl,
  onAddFromFile,
  onClose,
}: {
  kind: "signal" | "script";
  name: string;
  onNameChange: (name: string) => void;
  onAddFromUrl: (url: string, name: string) => Promise<void>;
  onAddFromFile: () => Promise<boolean>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFromUrl = async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAddFromUrl(url.trim(), name.trim());
      onNameChange("");
      setUrl("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const importFromFile = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await onAddFromFile()) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ThemedView
        style={[styles.overlay, styles.manifestPromptOverlay]}
        onStartShouldSetResponder={(event) =>
          event.target === event.currentTarget
        }
        onResponderRelease={onClose}
      >
        <SafeAreaView style={styles.manifestReviewSafeArea}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.manifestReview,
              styles.itemImportSurface,
              { borderColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="subtitle">Import new {kind}</ThemedText>
            <TextInput
              value={name}
              onChangeText={onNameChange}
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder={
                kind === "signal"
                  ? "https://…/signal.mp3"
                  : "https://…/script.yaml"
              }
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
            {error && (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            )}
            <ThemedView style={styles.manifestReviewActions}>
              <Button
                label="Import from file"
                onPress={importFromFile}
                disabled={busy}
                style={styles.promptAction}
              />
              <Button
                label="Import from URL"
                onPress={importFromUrl}
                variant="primary"
                disabled={!name.trim() || !url.trim()}
                loading={busy}
                style={styles.promptAction}
              />
            </ThemedView>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

function ManifestReview({
  manifest,
  conflicts,
  busy,
  error,
  onImport,
  onClose,
}: {
  manifest: LibraryManifest;
  conflicts: number;
  busy: boolean;
  error: string | null;
  onImport: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const itemCount = manifest.signals.length + manifest.scripts.length;
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ThemedView style={styles.overlay}>
        <SafeAreaView style={styles.manifestReviewSafeArea}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.manifestReview,
              styles.itemImportSurface,
              { borderColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="subtitle">Import this library?</ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
            >
              {manifest.url}
            </ThemedText>
            <ThemedView style={styles.manifestSummary}>
              <ThemedView
                type="backgroundSelected"
                style={styles.manifestSummaryCell}
              >
                <ThemedText type="subtitle">
                  {manifest.signals.length}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  signals
                </ThemedText>
              </ThemedView>
              <ThemedView
                type="backgroundSelected"
                style={styles.manifestSummaryCell}
              >
                <ThemedText type="subtitle">
                  {manifest.scripts.length}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  scripts
                </ThemedText>
              </ThemedView>
            </ThemedView>
            {conflicts > 0 ? (
              <ThemedText type="small" themeColor="danger">
                {conflicts} item name
                {conflicts === 1 ? " conflicts" : "s conflict"}
                {
                  " with your current library. Remove or rename the existing item first."
                }
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Existing items with the same source URL will be updated, not
                duplicated.
              </ThemedText>
            )}
            {error && (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            )}
            <ThemedView style={styles.manifestReviewActions}>
              <Button label="Cancel" onPress={onClose} />
              <Button
                label={`Import ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                onPress={onImport}
                variant="primary"
                disabled={conflicts > 0 || itemCount === 0}
                loading={busy}
              />
            </ThemedView>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

function ManifestUrlPrompt({
  url,
  busy,
  error,
  onUrlChange,
  onReview,
  onClose,
}: {
  url: string;
  busy: boolean;
  error: string | null;
  onUrlChange: (url: string) => void;
  onReview: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ThemedView
        style={styles.overlay}
        onStartShouldSetResponder={(event) =>
          event.target === event.currentTarget
        }
        onResponderRelease={onClose}
      >
        <SafeAreaView style={styles.manifestReviewSafeArea}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.manifestReview,
              styles.itemImportSurface,
              { borderColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="subtitle">Import extension</ThemedText>
            <TextInput
              value={url}
              onChangeText={onUrlChange}
              placeholder="https://…/manifest.json"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
            {error && (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            )}
            <ThemedView style={styles.manifestReviewActions}>
              <Button label="Cancel" onPress={onClose} />
              <Button
                label="Review"
                onPress={onReview}
                variant="primary"
                disabled={!url.trim()}
                loading={busy}
              />
            </ThemedView>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

export default function LibraryScreen() {
  const theme = useTheme();
  const {
    isLoaded,
    signals,
    scripts,
    addSignalFromUrl,
    addScriptFromUrl,
    addSignalFromFile,
    addScriptFromFile,
    importManifest,
  } = useLibrary();
  const [viewingScript, setViewingScript] = useState<LibraryScript | null>(
    null,
  );
  const [signalName, setSignalName] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestPreview, setManifestPreview] =
    useState<LibraryManifest | null>(null);
  const [manifestBusy, setManifestBusy] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [showManifestUrlPrompt, setShowManifestUrlPrompt] = useState(false);
  const [showSignalImport, setShowSignalImport] = useState(false);
  const [showScriptImport, setShowScriptImport] = useState(false);

  const manifestSources = useMemo(() => {
    const sources = new Map<string, number>();
    for (const item of [...signals, ...scripts]) {
      if (item.manifestUrl) {
        sources.set(item.manifestUrl, (sources.get(item.manifestUrl) ?? 0) + 1);
      }
    }
    return [...sources].map(([url, count]) => ({ url, count }));
  }, [scripts, signals]);

  const manifestConflicts = useMemo(() => {
    if (!manifestPreview) return 0;
    const conflictsWith = (
      entry: LibraryManifest["signals"][number],
      items: LibraryItem[],
    ) =>
      items.some(
        (item) =>
          item.name === entry.name &&
          item.manifestUrl !== manifestPreview.url &&
          (item.source.type !== "url" || item.source.url !== entry.url),
      );
    return (
      manifestPreview.signals.filter((entry) => conflictsWith(entry, signals))
        .length +
      manifestPreview.scripts.filter((entry) => conflictsWith(entry, scripts))
        .length
    );
  }, [manifestPreview, scripts, signals]);

  const reviewManifest = async (url = manifestUrl) => {
    if (!url.trim()) return;
    setManifestBusy(true);
    setManifestError(null);
    try {
      const manifest = await loadLibraryManifest(url);
      setManifestUrl(manifest.url);
      setShowManifestUrlPrompt(false);
      setManifestPreview(manifest);
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : String(err));
    } finally {
      setManifestBusy(false);
    }
  };

  const confirmManifestImport = async () => {
    if (!manifestPreview || manifestConflicts > 0) return;
    setManifestBusy(true);
    setManifestError(null);
    try {
      await importManifest(manifestPreview);
      setManifestPreview(null);
      setManifestUrl("");
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : String(err));
    } finally {
      setManifestBusy(false);
    }
  };

  const pickSignalFile = async (): Promise<boolean> => {
    const result = await DocumentPicker.getDocumentAsync({ type: "audio/*" });
    if (result.canceled || !result.assets[0]) return false;
    const asset = result.assets[0];
    await addSignalFromFile(
      asset.uri,
      asset.name,
      signalName.trim() || asset.name,
    );
    setSignalName("");
    return true;
  };

  const pickScriptFile = async (): Promise<boolean> => {
    const result = await DocumentPicker.getDocumentAsync({
      // Windows' file-open dialog filters by extension, not MIME type, and
      // .yaml/.yml aren't registered to any of these MIME types there — so
      // without the extensions listed, the default filter shows nothing.
      type: [
        ".yaml",
        ".yml",
        "text/yaml",
        "text/x-yaml",
        "text/*",
        "application/x-yaml",
        "*/*",
      ],
    });
    if (result.canceled || !result.assets[0]) return false;
    const asset = result.assets[0];
    await addScriptFromFile(
      asset.uri,
      asset.name,
      scriptName.trim() || asset.name,
    );
    setScriptName("");
    return true;
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {!isLoaded ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : (
            <>
              <ThemedView
                type="backgroundElement"
                style={[styles.card, styles.extensionsCard]}
              >
                <ThemedText style={styles.sectionHeading}>
                  Library Extensions
                </ThemedText>
                {manifestSources.map((source) => (
                  <ThemedView
                    key={source.url}
                    style={[
                      styles.manifestSourceRow,
                      { borderColor: theme.backgroundSelected },
                    ]}
                  >
                    <ThemedView style={styles.rowMain}>
                      <ThemedText type="smallBold">
                        {manifestHost(source.url)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {source.count} item{source.count === 1 ? "" : "s"}
                      </ThemedText>
                    </ThemedView>
                    <Button
                      label="Refresh"
                      onPress={() => {
                        setManifestUrl(source.url);
                        setShowManifestUrlPrompt(true);
                        void reviewManifest(source.url);
                      }}
                      size="small"
                    />
                  </ThemedView>
                ))}
                <Button
                  label="Import extension"
                  onPress={() => {
                    setManifestError(null);
                    setManifestUrl("");
                    setShowManifestUrlPrompt(true);
                  }}
                  style={styles.addButton}
                />
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText style={styles.sectionHeading}>Signals</ThemedText>
                {signals.map((item) => (
                  <SignalRow key={item.id} item={item} />
                ))}
                <Button
                  label="Import new signal"
                  onPress={() => setShowSignalImport(true)}
                  style={styles.addButton}
                />
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText style={styles.sectionHeading}>Scripts</ThemedText>
                {scripts.map((item) => (
                  <ScriptRow
                    key={item.id}
                    item={item}
                    onView={setViewingScript}
                  />
                ))}
                <Button
                  label="Import new script"
                  onPress={() => setShowScriptImport(true)}
                  style={styles.addButton}
                />
              </ThemedView>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {viewingScript && (
        <ScriptViewer
          item={viewingScript}
          onClose={() => setViewingScript(null)}
        />
      )}
      {manifestPreview && (
        <ManifestReview
          manifest={manifestPreview}
          conflicts={manifestConflicts}
          busy={manifestBusy}
          error={manifestError}
          onImport={confirmManifestImport}
          onClose={() => setManifestPreview(null)}
        />
      )}
      {showManifestUrlPrompt && (
        <ManifestUrlPrompt
          url={manifestUrl}
          busy={manifestBusy}
          error={manifestError}
          onUrlChange={setManifestUrl}
          onReview={() => reviewManifest()}
          onClose={() => setShowManifestUrlPrompt(false)}
        />
      )}
      {showSignalImport && (
        <ImportItemPrompt
          kind="signal"
          name={signalName}
          onNameChange={setSignalName}
          onAddFromUrl={addSignalFromUrl}
          onAddFromFile={pickSignalFile}
          onClose={() => setShowSignalImport(false)}
        />
      )}
      {showScriptImport && (
        <ImportItemPrompt
          kind="script"
          name={scriptName}
          onNameChange={setScriptName}
          onAddFromUrl={addScriptFromUrl}
          onAddFromFile={pickScriptFile}
          onClose={() => setShowScriptImport(false)}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    flexDirection: "row",
  },
  safeArea: {
    flex: 1,
    alignItems: "stretch",
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingTop: TopTabInset + Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },

  card: {
    gap: Spacing.two,
    alignSelf: "stretch",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  sectionHeading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    marginBottom: Spacing.one,
  },
  extensionsCard: {
    paddingVertical: Spacing.three,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowMain: {
    gap: 2,
    flexShrink: 1,
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  manifestSourceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  addButton: {
    alignSelf: "flex-start",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlaySafeArea: {
    width: "100%",
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  manifestReviewSafeArea: {
    width: "100%",
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  manifestPromptOverlay: {
    justifyContent: "flex-start",
  },
  manifestReview: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  manifestSummary: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  manifestSummaryCell: {
    flex: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  manifestReviewActions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.two,
    backgroundColor: "transparent",
  },
  promptAction: {
    flex: 1,
  },
  itemImportSurface: {
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  overlayCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    maxHeight: "80%",
    gap: Spacing.two,
  },
  overlayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "transparent",
  },
  overlayTitle: {
    flexShrink: 1,
  },
  overlayScroll: {
    flexGrow: 0,
  },
  overlayScrollContent: {
    paddingVertical: Spacing.two,
  },
});
