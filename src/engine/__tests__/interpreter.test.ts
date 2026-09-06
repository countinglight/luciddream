import { runScript } from '../interpreter';
import { parseScript } from '../parse';
import { RecordingAudioPort, RecordingLogPort, FakeContextProvider } from '../testing/fakes';
import { VirtualClock } from '../testing/virtual-clock';

function makeDeps(clock: VirtualClock) {
  const audio = new RecordingAudioPort();
  const log = new RecordingLogPort();
  const context = new FakeContextProvider(() => clock.now());
  return { audio, log, context, clock };
}

describe('runScript', () => {
  it('logs run.start and run.stop(completed) around a simple script', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript('name: Simple\nbody:\n  - play: chime\n');

    const controller = runScript(script, deps);
    await controller.done;

    expect(deps.log.events).toEqual([
      { type: 'run.start', at: 0, scriptName: 'Simple' },
      { type: 'play', at: 0, signal: 'chime', gain: 1, rate: 1, wait: false },
      { type: 'run.stop', at: 0, reason: 'completed' },
    ]);
  });

  it('does not await a fire-and-forget play, but does await wait: true', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const release = deps.audio.holdNextFinish();

    const script = parseScript('name: Wait\nbody:\n  - play: { signal: chime, wait: true }\n  - log: "after"\n');
    const controller = runScript(script, deps);

    // Give the microtask queue a turn; the run should be blocked on
    // handle.finished and must not have logged "after" yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.log.events.map((e) => e.type)).not.toContain('log');

    release();
    await controller.done;

    expect(deps.log.events.map((e) => e.type)).toEqual(['run.start', 'play', 'log', 'run.stop']);
  });

  it('advances through wait statements only when the virtual clock is advanced', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript('name: Waits\nbody:\n  - play: chime\n  - wait: 10s\n  - play: bell\n');

    const controller = runScript(script, deps);
    await Promise.resolve();
    expect(deps.audio.calls.map((c) => c.signal)).toEqual(['chime']);

    await clock.advanceBy(10_000);
    await controller.done;

    expect(deps.audio.calls.map((c) => c.signal)).toEqual(['chime', 'bell']);
    expect(deps.log.events.find((e) => e.type === 'play' && e.signal === 'bell')).toMatchObject({ at: 10_000 });
  });

  it('multiplies gain and rate across nested with-scopes and per-play overrides', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript(`
name: Effects
volume: 1
body:
  - set: { volume: 0.5 }
  - play: chime
  - with: { gain: 0.5, rate: 1.2 }
    body:
      - play: bell
      - with: { gain: 0.5 }
        body:
          - play: { signal: alert, gain: 0.4, rate: 0.9 }
  - play: chime
`);

    const controller = runScript(script, deps);
    await controller.done;

    expect(deps.audio.calls).toEqual([
      { signal: 'chime', opts: { gain: 0.5, rate: 1 } },
      { signal: 'bell', opts: { gain: 0.25, rate: 1.2 } },
      { signal: 'alert', opts: { gain: 0.05, rate: 1.08 } },
      { signal: 'chime', opts: { gain: 0.5, rate: 1 } },
    ]);
  });

  it('runs a finite repeat the exact number of times', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript('name: Repeat\nbody:\n  - repeat: 3\n    body:\n      - play: chime\n');

    const controller = runScript(script, deps);
    await clock.runToCompletion(() => deps.log.events.some((e) => e.type === 'run.stop'));
    await controller.done;

    expect(deps.audio.calls).toHaveLength(3);
  });

  it('stops an infinite repeat once its until condition becomes true', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript(`
name: Infinite
body:
  - repeat: infinite
    until: { elapsed: { gte: 25s } }
    body:
      - play: chime
      - wait: 10s
`);

    const controller = runScript(script, deps);
    await clock.runToCompletion(() => deps.log.events.some((e) => e.type === 'run.stop'));
    await controller.done;

    // Elapsed at each until-check: 0, 10s, 20s, 30s -> stops once >= 25s, so
    // the body ran at 0, 10s and 20s: three plays.
    expect(deps.audio.calls).toHaveLength(3);
    expect(deps.log.events.at(-1)).toMatchObject({ type: 'run.stop', reason: 'completed' });
  });

  it('branches on context, and logs context.unavailable for missing fields', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    deps.context.set({ rem: true, hr: 55 });

    const script = parseScript(`
name: Branch
body:
  - if: { all: [ { rem: true }, { hr: { lt: 60 } } ] }
    then:
      - play: chime
    else:
      - play: bell
  - if: { hrv: { gt: 50 } }
    then:
      - play: chime
    else:
      - play: bell
`);

    const controller = runScript(script, deps);
    await controller.done;

    expect(deps.audio.calls.map((c) => c.signal)).toEqual(['chime', 'bell']);
    expect(deps.log.events).toContainEqual({ type: 'context.unavailable', at: 0, field: 'hrv' });
  });

  it('ends the run when a stop statement executes, without running later statements', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript('name: Stop\nbody:\n  - play: chime\n  - stop:\n  - play: bell\n');

    const controller = runScript(script, deps);
    await controller.done;

    expect(deps.audio.calls.map((c) => c.signal)).toEqual(['chime']);
    expect(deps.log.events.at(-1)).toEqual({ type: 'run.stop', at: 0, reason: 'stopped' });
  });

  it('lets an external stop() abort a long wait immediately', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const script = parseScript('name: LongWait\nbody:\n  - wait: 8h\n  - play: chime\n');

    const controller = runScript(script, deps);
    await Promise.resolve();
    controller.stop();
    await controller.done;

    expect(deps.audio.calls).toHaveLength(0);
    expect(deps.log.events.at(-1)).toEqual({ type: 'run.stop', at: 0, reason: 'stopped' });
  });

  it('reports a runtime error as an error event and ends the run instead of throwing', async () => {
    const clock = new VirtualClock();
    const deps = makeDeps(clock);
    const boom = new Error('audio backend exploded');
    jest.spyOn(deps.audio, 'play').mockRejectedValueOnce(boom);
    const script = parseScript('name: Boom\nbody:\n  - play: chime\n');

    const controller = runScript(script, deps);
    await expect(controller.done).resolves.toBeUndefined();

    expect(deps.log.events).toContainEqual({ type: 'error', at: 0, message: 'audio backend exploded' });
    expect(deps.log.events.at(-1)).toEqual({ type: 'run.stop', at: 0, reason: 'error' });
  });
});
