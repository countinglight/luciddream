/** A small, fast, deterministic (non-cryptographic) string hash — enough to
 * turn an arbitrary URL into a stable, filesystem-safe id without pulling
 * in a real crypto dependency for something that isn't security sensitive.
 * FNV-1a, 32-bit. */
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Same URL added twice yields the same id — added-from-URL items are
 * naturally deduplicated rather than accumulating copies. */
export function idForUrl(url: string): string {
  return `url-${hashString(url)}`;
}

/** File-picker URIs aren't stable across picks the way a URL is, so a file
 * import always gets a fresh id instead of trying to dedupe. */
export function idForFile(): string {
  return `file-${hashString(`${Date.now()}-${Math.random()}`)}`;
}

/** Pulls a lowercase extension (no dot) off a URL or filename, ignoring any
 * query string or fragment. Falls back to `fallback` when there isn't a
 * recognizable one. */
export function extensionFromUrl(url: string, fallback: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:[?#]|$)/.exec(url);
  return match ? match[1].toLowerCase() : fallback;
}
