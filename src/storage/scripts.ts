import { BUNDLED_SCRIPT_TEXT } from './bundled-scripts';
import { ensureResolved } from './library-content';
import type { FileStorePort } from './file-store';
import type { LibraryScript } from './library-types';

/** Returns a script's YAML text, downloading/reading it via `fileStore` if
 * it isn't bundled. Mirrors audio/resolve.ts's shape for signals — the two
 * are kept separate because a script's "resolved form" is text to hand to
 * the engine's parser, not an AudioSourceRef. */
export async function resolveScriptText(item: LibraryScript, fileStore: FileStorePort): Promise<string> {
  if (item.source.type === 'bundled') {
    const text = BUNDLED_SCRIPT_TEXT[item.source.assetId];
    if (text === undefined) throw new Error(`Unknown bundled script "${item.source.assetId}".`);
    return text;
  }
  const { root, path } = await ensureResolved('scripts', item.id, item.source, fileStore, 'yaml');
  return fileStore.readText(root, path);
}
