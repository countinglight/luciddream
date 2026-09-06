import type { Script, Statement } from '@/engine';
import { SOUNDS, SoundId } from '@/lib/sounds';
import { ensureResolved } from '@/storage/library-content';
import type { FileStorePort } from '@/storage/file-store';
import type { LibrarySignal } from '@/storage/library-types';

import type { AudioSourceRef } from './types';

/** Every signal moniker a script's body refers to, anywhere in its
 * (possibly nested) statements — what "resolve every signal at Start"
 * (spec §3.2) needs to know before it can call resolveSignalMap. */
export function collectSignalNames(script: Script): Set<string> {
  const names = new Set<string>();
  const visit = (statements: Statement[]) => {
    for (const statement of statements) {
      switch (statement.kind) {
        case 'play':
          names.add(statement.signal);
          break;
        case 'repeat':
        case 'with':
          visit(statement.body);
          break;
        case 'if':
          visit(statement.then);
          if (statement.else) visit(statement.else);
          break;
        default:
          break;
      }
    }
  };
  visit(script.body);
  return names;
}

/** The first `play:` signal a script's body would reach, in execution
 * order — what the Run screen's "Test" button (spec §2.2 step 2) plays at
 * the chosen volume without running the whole script. `undefined` for a
 * script with no `play` statements at all. */
export function firstSignalName(script: Script): string | undefined {
  const visit = (statements: Statement[]): string | undefined => {
    for (const statement of statements) {
      switch (statement.kind) {
        case 'play':
          return statement.signal;
        case 'repeat':
        case 'with': {
          const found = visit(statement.body);
          if (found) return found;
          break;
        }
        case 'if': {
          const found = visit(statement.then) ?? (statement.else ? visit(statement.else) : undefined);
          if (found) return found;
          break;
        }
        default:
          break;
      }
    }
    return undefined;
  };
  return visit(script.body);
}

function isKnownSoundId(id: string): id is SoundId {
  return id in SOUNDS;
}

/** Resolves a signal to a source expo-audio can play, downloading/caching
 * it first if it isn't bundled. This is where a script's moniker meets an
 * actual file — the engine itself (src/engine) never deals with URLs or
 * file paths, only the names a script uses in `play:` (spec §5.1). */
export async function resolveSignal(item: LibrarySignal, fileStore: FileStorePort): Promise<AudioSourceRef> {
  if (item.source.type === 'bundled') {
    if (!isKnownSoundId(item.source.assetId)) {
      throw new Error(`Unknown bundled signal "${item.source.assetId}".`);
    }
    return SOUNDS[item.source.assetId].source;
  }
  const { root, path } = await ensureResolved('signals', item.id, item.source, fileStore, 'audio');
  return { uri: fileStore.uriFor(root, path) };
}

/** Resolves every signal a script's `body` refers to, up front — spec
 * §2.2/§3.2: "Start" validates and resolves every signal before playback
 * begins, so a run never depends on the network mid-night. Throws (naming
 * the missing moniker) if a script refers to a signal not in the library,
 * which the caller should treat as a validation failure, same as a bad
 * script (§2.4). */
export async function resolveSignalMap(
  monikers: Iterable<string>,
  library: LibrarySignal[],
  fileStore: FileStorePort
): Promise<Record<string, AudioSourceRef>> {
  const byName = new Map(library.map((item) => [item.name, item]));
  const result: Record<string, AudioSourceRef> = {};
  for (const moniker of monikers) {
    const item = byName.get(moniker);
    if (!item) throw new Error(`Script refers to unknown signal "${moniker}" — add it in the Library first.`);
    result[moniker] = await resolveSignal(item, fileStore);
  }
  return result;
}
