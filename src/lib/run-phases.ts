export const RUN_PHASES = [
  { key: 'preSleepTraining', label: 'Pre-sleep Training' },
  { key: 'earlySleep', label: 'Early Sleep' },
  { key: 'wakeUp', label: 'Wake Up' },
] as const;

export type RunPhaseKey = (typeof RUN_PHASES)[number]['key'];

export type RunPhaseScriptIds = Record<RunPhaseKey, string | null>;

/** A useful first-run plan made only from bundled content. Every slot remains
 * editable and can be set to Empty from the Run screen. */
export const DEFAULT_RUN_PHASE_SCRIPT_IDS: RunPhaseScriptIds = {
  preSleepTraining: null,
  earlySleep: 'bundled-03-mild-cycles',
  wakeUp: 'bundled-01-single-beep',
};

/** Training is optional. Either sleep phase may be empty, but they may not
 * both be empty because that would leave no overnight content to run. */
export function validateRunPhaseScriptIds(ids: RunPhaseScriptIds): string | null {
  if (!ids.earlySleep && !ids.wakeUp) {
    return 'Choose a script for Early Sleep or Wake Up (at least one is required).';
  }
  return null;
}
