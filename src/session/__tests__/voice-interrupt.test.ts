import { VoiceInterruptDetector, type VoiceInterruptConfig } from '../voice-interrupt';

const CONFIG: VoiceInterruptConfig = { thresholdDb: -30, sustainMs: 1_000, holdMs: 5_000 };

describe('VoiceInterruptDetector', () => {
  it('stays silent for a single loud sample below the sustain window', () => {
    const detector = new VoiceInterruptDetector(CONFIG);
    expect(detector.feed(-10, 0)).toBeNull();
    expect(detector.feed(-10, 500)).toBeNull();
  });

  it('triggers once the loud level has been sustained for sustainMs', () => {
    const detector = new VoiceInterruptDetector(CONFIG);
    expect(detector.feed(-10, 0)).toBeNull();
    expect(detector.feed(-10, 999)).toBeNull();
    expect(detector.feed(-10, 1_000)).toBe('trigger');
  });

  it('resets the sustain window if the level drops back below threshold before sustainMs', () => {
    const detector = new VoiceInterruptDetector(CONFIG);
    expect(detector.feed(-10, 0)).toBeNull();
    expect(detector.feed(-40, 500)).toBeNull(); // quiet again — resets
    expect(detector.feed(-10, 900)).toBeNull(); // loud again — fresh window starts here
    expect(detector.feed(-10, 1_800)).toBeNull(); // only 900ms into the fresh window
    expect(detector.feed(-10, 1_900)).toBe('trigger'); // a full 1000ms after the reset
  });

  it('emits resume after holdMs, regardless of the current level', () => {
    const detector = new VoiceInterruptDetector(CONFIG);
    detector.feed(-10, 0);
    expect(detector.feed(-10, 1_000)).toBe('trigger');

    expect(detector.feed(-10, 3_000)).toBeNull(); // still within the hold window
    expect(detector.feed(-10, 6_000)).toBe('resume'); // holdMs elapsed
  });

  it('never emits a stop-style event — every trigger is followed only by resume', () => {
    const detector = new VoiceInterruptDetector(CONFIG);
    const events = new Set<string | null>();
    for (let t = 0; t <= 20_000; t += 250) {
      events.add(detector.feed(-5, t));
    }
    expect(events).toEqual(new Set(['trigger', null, 'resume']));
  });

  it('can trigger again after a resume', () => {
    const detector = new VoiceInterruptDetector(CONFIG);
    detector.feed(-10, 0);
    expect(detector.feed(-10, 1_000)).toBe('trigger');
    expect(detector.feed(-10, 6_000)).toBe('resume');

    expect(detector.feed(-10, 6_100)).toBeNull();
    expect(detector.feed(-10, 7_100)).toBe('trigger');
  });
});
