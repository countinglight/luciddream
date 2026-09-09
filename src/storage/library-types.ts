/** Where an item's content actually lives. Shared by signals and scripts —
 * the two behave identically for resolution/caching purposes (see
 * library-content.ts); only what "bundled" resolves to differs. */
export type ContentSource =
  | { type: "bundled"; assetId: string }
  | { type: "url"; url: string }
  /** `path` is relative to the document root — set once, when the file is
   * copied in at add-time (see library-content.ts's importExternalFile).
   * The original external URI (e.g. Android's content://) isn't kept; once
   * copied in, it's ours and the external one may stop being valid. */
  | { type: "file"; path: string };

type LibraryItemBase = {
  id: string;
  /** Display name (Library screen) and, for signals, the moniker scripts
   * refer to in `play:`. */
  name: string;
  source: ContentSource;
  /** Only meaningful for `url` sources — `bundled` and `file` are always
   * available offline by construction. Tracked explicitly here (rather
   * than re-derived by checking the filesystem every render) so the
   * Library screen can show it without an async check per row. */
  savedOffline: boolean;
  addedAt: number;
  /** Present when this item was added in bulk from a manifest. Retaining the
   * source lets the Library screen group and explicitly refresh that import. */
  manifestUrl?: string;
};

export type LibrarySignal = LibraryItemBase & { kind: "signal" };
export type LibraryScript = LibraryItemBase & { kind: "script" };
export type LibraryItem = LibrarySignal | LibraryScript;
