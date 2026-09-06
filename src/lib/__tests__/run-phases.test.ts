import { DEFAULT_RUN_PHASE_SCRIPT_IDS, validateRunPhaseScriptIds } from '../run-phases';

describe('three-phase run selection', () => {
  it('ships with a valid first-run selection', () => {
    expect(validateRunPhaseScriptIds(DEFAULT_RUN_PHASE_SCRIPT_IDS)).toBeNull();
  });

  it('allows training and either one of the sleep phases to be empty', () => {
    expect(
      validateRunPhaseScriptIds({ preSleepTraining: null, earlySleep: 'early', wakeUp: null }),
    ).toBeNull();
    expect(
      validateRunPhaseScriptIds({ preSleepTraining: null, earlySleep: null, wakeUp: 'wake' }),
    ).toBeNull();
  });

  it('rejects a plan with both sleep phases empty', () => {
    expect(
      validateRunPhaseScriptIds({ preSleepTraining: 'training', earlySleep: null, wakeUp: null }),
    ).toMatch(/at least one/i);
  });
});
