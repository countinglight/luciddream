import { SOUND_IDS } from '@/lib/sounds';

import { BUNDLED_SCRIPT_TEXT } from './bundled-scripts';
import type { LibraryScript, LibrarySignal } from './library-types';

/** Display names for the bundled example scripts — kept here rather than
 * parsed out of BUNDLED_SCRIPT_TEXT at runtime, since a script's own
 * `name:` field is a detail of its content, not something the Library
 * screen should have to parse YAML to show. The bundled-scripts sync-guard
 * test (bundled-scripts.test.ts) already catches drift in the content
 * itself. */
const BUNDLED_SCRIPT_NAMES: Record<string, string> = {
  '01-single-beep': 'Single Beep',
  '02-interval-chime': 'Interval Chime',
  '03-mild-cycles': 'MILD Cycles',
  '04-rem-conditional': 'REM Conditional',
  '05-effects-demo': 'Effects Demo',
};

/** The signals and scripts that ship in the app, synthesized as LibraryItems
 * so the Library screen can render them the same way as anything the user
 * added — bundled items just aren't persisted or removable (spec §2.3).
 *
 * A signal's `name` is the moniker a script's `play:` refers to (spec §2),
 * so it must match the bundled scripts' lowercase `play: chime` exactly —
 * not `SOUNDS[id].label`'s capitalized display form. */
export const BUNDLED_SIGNALS: LibrarySignal[] = SOUND_IDS.map((id) => ({
  id: `bundled-${id}`,
  kind: 'signal',
  name: id,
  source: { type: 'bundled', assetId: id },
  savedOffline: true,
  addedAt: 0,
}));

export const BUNDLED_SCRIPTS: LibraryScript[] = Object.keys(BUNDLED_SCRIPT_TEXT).map((id) => ({
  id: `bundled-${id}`,
  kind: 'script',
  name: BUNDLED_SCRIPT_NAMES[id] ?? id,
  source: { type: 'bundled', assetId: id },
  savedOffline: true,
  addedAt: 0,
}));
