import { extensionFromUrl } from './id';
import type { FileRoot, FileStorePort } from './file-store';
import type { ContentSource } from './library-types';

export type LibraryKind = 'signals' | 'scripts';

type Resolvable = Exclude<ContentSource, { type: 'bundled' }>;

function pathFor(kind: LibraryKind, id: string, ext: string): string {
  return `${kind}/${id}.${ext}`;
}

/** Ensures a `url`/`file` item has a local copy available and says where —
 * downloading it if this is the first time, and never re-downloading a
 * copy that's already there (spec §2.4: a run must not depend on the
 * network once resolved). A permanently saved copy (document root) is
 * always preferred over the ephemeral cache. */
export async function ensureResolved(
  kind: LibraryKind,
  id: string,
  source: Resolvable,
  fileStore: FileStorePort,
  defaultExt: string
): Promise<{ root: FileRoot; path: string }> {
  if (source.type === 'file') return { root: 'document', path: source.path };

  const path = pathFor(kind, id, extensionFromUrl(source.url, defaultExt));
  if (await fileStore.exists('document', path)) return { root: 'document', path };
  if (!(await fileStore.exists('cache', path))) {
    await fileStore.downloadTo(source.url, 'cache', path);
  }
  return { root: 'cache', path };
}

/** The "Save offline" action (spec §4.5): promotes whatever's cached to
 * permanent document storage, downloading fresh only if nothing was cached
 * yet. A no-op for `file` sources, which are already permanent — they were
 * copied into document storage the moment they were added. */
export async function saveOffline(
  kind: LibraryKind,
  id: string,
  source: Resolvable,
  fileStore: FileStorePort,
  defaultExt: string
): Promise<void> {
  if (source.type === 'file') return;

  const path = pathFor(kind, id, extensionFromUrl(source.url, defaultExt));
  if (await fileStore.exists('document', path)) return;
  if (await fileStore.exists('cache', path)) {
    await fileStore.copy({ root: 'cache', path }, { root: 'document', path });
  } else {
    await fileStore.downloadTo(source.url, 'document', path);
  }
}

/** "Remove local copy" — deletes only the permanent document-root copy.
 * The ephemeral cache, if any, is left alone: there's no eviction policy in
 * v1 (spec §4.5), and removing it here would just mean the next run
 * re-downloads it, which is not what the user asked for. */
export async function removeOfflineCopy(
  kind: LibraryKind,
  id: string,
  source: Resolvable,
  fileStore: FileStorePort,
  defaultExt: string
): Promise<void> {
  if (source.type === 'file') return;
  await fileStore.deleteFile('document', pathFor(kind, id, extensionFromUrl(source.url, defaultExt)));
}

export async function isSavedOffline(
  kind: LibraryKind,
  id: string,
  source: Resolvable,
  fileStore: FileStorePort,
  defaultExt: string
): Promise<boolean> {
  if (source.type === 'file') return true;
  return fileStore.exists('document', pathFor(kind, id, extensionFromUrl(source.url, defaultExt)));
}

/** "Add from file": copies a document-picker result into our own document
 * storage immediately, since an external URI (e.g. Android's `content://`)
 * isn't guaranteed to remain accessible later. From then on the item is a
 * `file` source pointing at our own copy. */
export async function importExternalFile(
  kind: LibraryKind,
  id: string,
  externalUri: string,
  fileStore: FileStorePort,
  ext: string
): Promise<{ type: 'file'; path: string }> {
  const path = pathFor(kind, id, ext);
  await fileStore.copyExternal(externalUri, { root: 'document', path });
  return { type: 'file', path };
}
