import { FileRoot, FileStoreError, FileStorePort } from "./file-store";

/** expo-file-system's Directory/File classes are stubbed out on web (see
 * ExpoFileSystem.web.ts — every method just console.warns and no-ops),
 * so ExpoFileSystemStore crashes there. This is a real IndexedDB-backed
 * FileStorePort for the web build, storing text as strings and audio as
 * Blobs, keyed the same way InMemoryFileStore is for tests. */

type StoredValue =
  | { kind: "text"; text: string }
  | { kind: "blob"; blob: Blob };

const DB_NAME = "luciddream-files";
const STORE_NAME = "files";

function key(root: FileRoot, path: string): string {
  return `${root}:${path}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new FileStoreError("Failed to open IndexedDB"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new FileStoreError("IndexedDB request failed"));
  });
}

export class WebFileStore implements FileStorePort {
  /** Opened lazily on first real use, not in the constructor — this class
   * is instantiated at module scope, and Expo web's SSR render pass runs
   * that module code in Node, where `indexedDB` doesn't exist. */
  private dbPromise: Promise<IDBDatabase> | null = null;
  /** Object URLs are created lazily and cached here, since uriFor() must
   * return synchronously — every path that returns `true` from exists()
   * is guaranteed to have its object URL cached first. */
  private objectUrls = new Map<string, string>();

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    if (!this.dbPromise) this.dbPromise = openDb();
    const db = await this.dbPromise;
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  private async get(k: string): Promise<StoredValue | undefined> {
    const store = await this.store("readonly");
    return requestToPromise(store.get(k));
  }

  private async put(k: string, value: StoredValue): Promise<void> {
    const store = await this.store("readwrite");
    await requestToPromise(store.put(value, k));
    if (value.kind === "blob") this.cacheObjectUrl(k, value.blob);
  }

  private cacheObjectUrl(k: string, blob: Blob): void {
    const existing = this.objectUrls.get(k);
    if (existing) URL.revokeObjectURL(existing);
    this.objectUrls.set(k, URL.createObjectURL(blob));
  }

  async exists(root: FileRoot, path: string): Promise<boolean> {
    const k = key(root, path);
    const value = await this.get(k);
    if (value?.kind === "blob" && !this.objectUrls.has(k))
      this.cacheObjectUrl(k, value.blob);
    return value !== undefined;
  }

  async ensureDir(): Promise<void> {
    // IndexedDB is a flat key-value store — no real directories to create.
  }

  async writeText(
    root: FileRoot,
    path: string,
    content: string,
  ): Promise<void> {
    await this.put(key(root, path), { kind: "text", text: content });
  }

  async readText(root: FileRoot, path: string): Promise<string> {
    const value = await this.get(key(root, path));
    if (value === undefined)
      throw new FileStoreError(`WebFileStore: no file at ${root}:${path}`);
    // copyExternal always stores blobs (it doesn't know the content type),
    // so an imported script's text arrives here as a blob, not "text".
    return value.kind === "text" ? value.text : await value.blob.text();
  }

  async downloadTo(url: string, root: FileRoot, path: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok)
      throw new FileStoreError(`Failed to download ${url}: ${response.status}`);
    await this.put(key(root, path), {
      kind: "blob",
      blob: await response.blob(),
    });
  }

  async copy(
    from: { root: FileRoot; path: string },
    to: { root: FileRoot; path: string },
  ): Promise<void> {
    const value = await this.get(key(from.root, from.path));
    if (value === undefined)
      throw new FileStoreError(
        `WebFileStore: no file at ${from.root}:${from.path}`,
      );
    await this.put(key(to.root, to.path), value);
  }

  async copyExternal(
    sourceUri: string,
    to: { root: FileRoot; path: string },
  ): Promise<void> {
    const response = await fetch(sourceUri);
    if (!response.ok)
      throw new FileStoreError(
        `Failed to read ${sourceUri}: ${response.status}`,
      );
    await this.put(key(to.root, to.path), {
      kind: "blob",
      blob: await response.blob(),
    });
  }

  async deleteFile(root: FileRoot, path: string): Promise<void> {
    const k = key(root, path);
    const store = await this.store("readwrite");
    await requestToPromise(store.delete(k));
    const url = this.objectUrls.get(k);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(k);
    }
  }

  uriFor(root: FileRoot, path: string): string {
    return this.objectUrls.get(key(root, path)) ?? "";
  }
}
