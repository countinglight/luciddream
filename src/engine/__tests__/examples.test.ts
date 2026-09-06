import fs from 'node:fs';
import path from 'node:path';

import { runScript } from '../interpreter';
import { parseScript } from '../parse';
import { RecordingAudioPort, RecordingLogPort, FakeContextProvider } from '../testing/fakes';
import { VirtualClock } from '../testing/virtual-clock';

/**
 * Fixture tests over the scripts actually bundled in the app (spec §3.5).
 * These read the real YAML files from disk, so an edit to a bundled example
 * that changes its behavior fails a test right here — not silently in
 * someone's Library screen.
 */
function loadExample(fileName: string): string {
  const examplesDir = path.join(__dirname, '..', '..', '..', 'assets', 'scripts');
  return fs.readFileSync(path.join(examplesDir, fileName), 'utf8');
}

function makeDeps(clock: VirtualClock) {
  const audio = new RecordingAudioPort();
  const log = new RecordingLogPort();
  const context = new FakeContextProvider(() => clock.now());
  return { audio, log, context, clock };
}

describe('bundled example scripts', () => {
  it('01-single-beep.yaml: logs, plays once, and completes — all at t=0', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript(loadExample('01-single-beep.yaml'));

    await runScript(script, deps).done;

    expect(deps.log.events).toEqual([
      { type: 'run.start', at: 0, scriptName: 'Single Beep' },
      { type: 'log', at: 0, message: 'single beep test' },
      { type: 'play', at: 0, signal: 'chime', gain: 0.5, rate: 1, wait: false },
      { type: 'run.stop', at: 0, reason: 'completed' },
    ]);
  });

  it('02-interval-chime.yaml: plays three times, 90s apart, then completes', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript(loadExample('02-interval-chime.yaml'));

    const controller = runScript(script, deps);
    await clock.runToCompletion(() => deps.log.events.some((e) => e.type === 'run.stop'));
    await controller.done;

    expect(deps.log.events).toEqual([
      { type: 'run.start', at: 0, scriptName: 'Interval Chime' },
      { type: 'play', at: 0, signal: 'chime', gain: 0.6, rate: 1, wait: false },
      { type: 'play', at: 90_000, signal: 'chime', gain: 0.6, rate: 1, wait: false },
      { type: 'play', at: 180_000, signal: 'chime', gain: 0.6, rate: 1, wait: false },
      { type: 'run.stop', at: 270_000, reason: 'completed' },
    ]);
  });

  it('03-mild-cycles.yaml: runs six chime/bell cycles at the scoped gain, then completes', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript(loadExample('03-mild-cycles.yaml'));

    const controller = runScript(script, deps);
    await clock.runToCompletion(() => deps.log.events.some((e) => e.type === 'run.stop'));
    await controller.done;

    expect(deps.audio.calls).toHaveLength(12);
    for (const call of deps.audio.calls) {
      expect(call.opts).toEqual({ gain: 0.4 * 0.6, rate: 1 });
    }
    expect(deps.audio.calls.map((c) => c.signal)).toEqual(
      Array.from({ length: 6 }, () => ['chime', 'bell']).flat()
    );

    const expectedTotalMs = 90 * 60_000 + 6 * (10_000 + 20 * 60_000);
    expect(deps.log.events[0]).toEqual({ type: 'run.start', at: 0, scriptName: 'MILD Cycles' });
    expect(deps.log.events.at(-1)).toEqual({ type: 'run.stop', at: expectedTotalMs, reason: 'completed' });
  });

  it('04-rem-conditional.yaml: branches on rem/hr/hrv, logging context.unavailable when hr is missing', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript(loadExample('04-rem-conditional.yaml'));

    // t=0: REM with a low HR -> the "then" branch (two chimes, 3s apart).
    deps.context.set({ rem: true, hr: 55 });
    // From t=3000: no more HR reading at all, but a high HRV -> the
    // "else / then" branch (a bell, then a 5-minute wait) — twice.
    deps.context.scheduleAt(3_000, { rem: false, hrv: 60 });
    // From just after the second bell's wait completes: HRV drops too ->
    // the "else / else" branch (just a 5-minute wait, no play).
    deps.context.scheduleAt(303_001, { rem: false, hrv: 10 });

    const controller = runScript(script, deps);

    await clock.advanceBy(3_000); // through the first (then) iteration
    await clock.advanceBy(300_000); // through the first bell iteration
    await clock.advanceBy(300_000); // through the second bell iteration, into the else/else wait
    controller.stop(); // an unattended run only ever ends this way in practice
    await controller.done;

    expect(deps.audio.calls).toEqual([
      { signal: 'chime', opts: { gain: 0.4, rate: 1 } },
      { signal: 'chime', opts: { gain: 0.5, rate: 1 } },
      { signal: 'bell', opts: { gain: 0.5, rate: 1 } },
      { signal: 'bell', opts: { gain: 0.5, rate: 1 } },
    ]);

    const unavailable = deps.log.events.filter((e) => e.type === 'context.unavailable');
    expect(unavailable).toEqual([
      { type: 'context.unavailable', at: 3_000, field: 'hr' },
      { type: 'context.unavailable', at: 303_000, field: 'hr' },
      { type: 'context.unavailable', at: 603_000, field: 'hr' },
    ]);
    expect(deps.log.events.at(-1)).toEqual({ type: 'run.stop', at: 603_000, reason: 'stopped' });
  });

  it('05-effects-demo.yaml: applies set/with/play gain and rate composition exactly, all at t=0', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript(loadExample('05-effects-demo.yaml'));

    await runScript(script, deps).done;

    expect(deps.log.events).toEqual([
      { type: 'run.start', at: 0, scriptName: 'Effects Demo' },
      { type: 'volume.changed', at: 0, volume: 0.5 },
      { type: 'play', at: 0, signal: 'chime', gain: 0.5, rate: 1, wait: false },
      { type: 'play', at: 0, signal: 'bell', gain: 0.25, rate: 1.2, wait: false },
      { type: 'play', at: 0, signal: 'alert', gain: 0.05, rate: 1.08, wait: false },
      { type: 'play', at: 0, signal: 'chime', gain: 0.5, rate: 1, wait: false },
      { type: 'run.stop', at: 0, reason: 'completed' },
    ]);
  });
});
