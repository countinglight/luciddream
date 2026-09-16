import { DEFAULT_DURATION_PRESETS, parseScript } from "@/engine";

import { BUNDLED_SCRIPT_TEXT } from "./bundled-scripts";
import { ensureResolved } from "./library-content";
import type { FileStorePort } from "./file-store";
import type { LibraryScript } from "./library-types";

/** Returns a script's YAML text, downloading/reading it via `fileStore` if
 * it isn't bundled. Mirrors audio/resolve.ts's shape for signals — the two
 * are kept separate because a script's "resolved form" is text to hand to
 * the engine's parser, not an AudioSourceRef. */
export async function resolveScriptText(
  item: LibraryScript,
  fileStore: FileStorePort,
): Promise<string> {
  if (item.source.type === "bundled") {
    const text = BUNDLED_SCRIPT_TEXT[item.source.assetId];
    if (text === undefined)
      throw new Error(`Unknown bundled script "${item.source.assetId}".`);
    return text;
  }
  const { root, path } = await ensureResolved(
    "scripts",
    item.id,
    item.source,
    fileStore,
    "yaml",
  );
  return fileStore.readText(root, path);
}

/** How a script problem is worded wherever the user meets it: when adding a
 * script, and again at bedtime if a stored one has since become unreadable.
 * One wording, so the same fault never reads two different ways. */
export function describeScriptProblem(name: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `"${name}" could not be read: ${detail}`;
}

/**
 * Checks a script is valid before it joins the Library.
 *
 * A bad script used to be accepted silently and only fail when the night
 * began, which is the worst moment to learn about it. Validating on add puts
 * the error in front of the user while they are still looking at the thing
 * they just added (owner decision C2). Bundled scripts are not checked here;
 * the fixtures in src/engine/__tests__/examples.test.ts cover them.
 *
 * Parses against the default period presets. Settings always carries the
 * same three preset names, so a script that parses here parses at bedtime.
 */
export function validateScriptText(name: string, text: string): void {
  try {
    parseScript(text, { durationPresets: DEFAULT_DURATION_PRESETS });
  } catch (error) {
    throw new Error(describeScriptProblem(name, error));
  }
}

/** Fetches (or reads) a library script and validates it. For a URL script this
 * downloads it into the cache, which the first night would have done anyway. */
export async function validateLibraryScript(
  item: LibraryScript,
  fileStore: FileStorePort,
): Promise<void> {
  let text: string;
  try {
    text = await resolveScriptText(item, fileStore);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`"${item.name}" could not be downloaded: ${detail}`);
  }
  validateScriptText(item.name, text);
}
