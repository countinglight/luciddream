import { extensionFromUrl } from "./id";
import type { FileRoot, FileStorePort } from "./file-store";
import type { ContentSource } from "./library-types";

export type LibraryKind = "signals" | "scripts";

type Resolvable = Exclude<ContentSource, { type: "bundled" }>;

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
  defaultExt: string,
): Promise<{ root: FileRoot; path: string }> {
  if (source.type === "file") {
    // An imported file's path was trusted without checking. The copy can be
    // gone — restored to a new device, cleared by the OS, removed by a failed
    // write — and a missing file then passed preflight and failed hours later
    // as an unplayable cue in the dark (architectural review A10).
    if (!(await fileStore.exists("document", source.path))) {
      throw new Error(
        "This file is no longer on the phone. Remove it from your Library and add it again.",
      );
    }
    return { root: "document", path: source.path };
  }

  const path = pathFor(kind, id, extensionFromUrl(source.url, defaultExt));
  if (await fileStore.exists("document", path))
    return { root: "document", path };
  if (!(await fileStore.exists("cache", path))) {
    await downloadStaged(source.url, "cache", path, fileStore);
  }
  return { root: "cache", path };
}

/** Suffix a download is written under until it is known to have completed. */
const PARTIAL_SUFFIX = ".part";

/**
 * Downloads to a temporary path and promotes it only once it has finished.
 *
 * Writing straight to the final path meant an interrupted download left a
 * truncated file exactly where the next resolution looks — and resolution
 * treats existence as validity, so a half-downloaded sound would be accepted
 * and played as whatever it managed to fetch (A10).
 */
async function downloadStaged(
  url: string,
  root: FileRoot,
  path: string,
  fileStore: FileStorePort,
): Promise<void> {
  const staging = `${path}${PARTIAL_SUFFIX}`;
  try {
    await fileStore.downloadTo(url, root, staging);
    await fileStore.copy({ root, path: staging }, { root, path });
  } catch (error) {
    // Never leave a partial file where a later run would take it for content.
    try {
      await fileStore.deleteFile(root, path);
    } catch {
      // Nothing more to try.
    }
    throw error;
  } finally {
    try {
      await fileStore.deleteFile(root, staging);
    } catch {
      // A leftover .part file is harmless; it is never resolved.
    }
  }
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
  defaultExt: string,
): Promise<void> {
  if (source.type === "file") return;

  const path = pathFor(kind, id, extensionFromUrl(source.url, defaultExt));
  if (await fileStore.exists("document", path)) return;
  if (await fileStore.exists("cache", path)) {
    await fileStore.copy({ root: "cache", path }, { root: "document", path });
  } else {
    await fileStore.downloadTo(source.url, "document", path);
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
  defaultExt: string,
): Promise<void> {
  if (source.type === "file") return;
  await fileStore.deleteFile(
    "document",
    pathFor(kind, id, extensionFromUrl(source.url, defaultExt)),
  );
}

/**
 * Deletes everything stored for a library item, in both roots.
 *
 * Distinct from removeOfflineCopy, which is the user-facing "Remove local
 * copy" and deliberately keeps the cache. Removing an item from the Library
 * used to call that instead, which does nothing at all for an imported file
 * and leaves the URL cache behind — so deleted content stayed on disk,
 * unreachable and accumulating (architectural review AR-01 / A6).
 */
export async function deleteContent(
  kind: LibraryKind,
  id: string,
  source: ContentSource,
  fileStore: FileStorePort,
  defaultExt: string,
): Promise<void> {
  // Bundled content ships with the app; there is nothing of the user's to
  // remove.
  if (source.type === "bundled") return;

  const paths: { root: FileRoot; path: string }[] =
    source.type === "file"
      ? [{ root: "document", path: source.path }]
      : (() => {
          const path = pathFor(
            kind,
            id,
            extensionFromUrl(source.url, defaultExt),
          );
          return [
            { root: "document", path },
            { root: "cache", path },
          ];
        })();

  for (const target of paths) {
    try {
      await fileStore.deleteFile(target.root, target.path);
    } catch {
      // One unremovable copy must not stop the others, or leave the user
      // unable to remove the item at all.
    }
  }
}

export async function isSavedOffline(
  kind: LibraryKind,
  id: string,
  source: Resolvable,
  fileStore: FileStorePort,
  defaultExt: string,
): Promise<boolean> {
  if (source.type === "file") return true;
  return fileStore.exists(
    "document",
    pathFor(kind, id, extensionFromUrl(source.url, defaultExt)),
  );
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
  ext: string,
): Promise<{ type: "file"; path: string }> {
  const path = pathFor(kind, id, ext);
  await fileStore.copyExternal(externalUri, { root: "document", path });
  return { type: "file", path };
}
