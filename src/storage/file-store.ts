/**
 * Low-level file storage, abstracted behind a port the same way the engine
 * abstracts audio/clock/context (see src/engine/ports.ts) — so the actual
 * disk/network operations (ExpoFileSystemStore) can be swapped for an
 * in-memory fake in tests, and the resolution/persistence logic that uses
 * this port stays 100% unit-testable without touching expo-file-system.
 *
 * Two roots, matching spec §4.5:
 *  - "cache": may be cleared by the OS under storage pressure. Used for the
 *    "never depend on the network mid-run" resolution cache (spec §2.4).
 *  - "document": persists across app updates and storage cleanup. Used only
 *    for content the user explicitly saved offline.
 */
export type FileRoot = 'cache' | 'document';

export class FileStoreError extends Error {}

export interface FileStorePort {
  exists(root: FileRoot, path: string): Promise<boolean>;
  ensureDir(root: FileRoot, path: string): Promise<void>;
  writeText(root: FileRoot, path: string, content: string): Promise<void>;
  readText(root: FileRoot, path: string): Promise<string>;
  /** Downloads `url` directly to `root`/`path`, never buffering the whole
   * file in memory. Overwrites an existing file at that path. */
  downloadTo(url: string, root: FileRoot, path: string): Promise<void>;
  /** Copies a file already inside this store from one root/path to
   * another — used to promote a cached signal to a permanently saved one. */
  copy(from: { root: FileRoot; path: string }, to: { root: FileRoot; path: string }): Promise<void>;
  /** Copies a file from outside this store (e.g. a document-picker result,
   * which may be a content:// URI) in. */
  copyExternal(sourceUri: string, to: { root: FileRoot; path: string }): Promise<void>;
  deleteFile(root: FileRoot, path: string): Promise<void>;
  /** A URI usable as an expo-audio source / for reading elsewhere. */
  uriFor(root: FileRoot, path: string): string;
}
