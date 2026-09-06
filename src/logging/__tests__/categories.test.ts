import type { EngineEvent } from '@/engine';

import { eventCategory, FanOutLogPort, FilteringLogPort } from '../categories';

describe('eventCategory', () => {
  it.each<[EngineEvent['type'], EngineEvent, ReturnType<typeof eventCategory>]>([
    ['play', { type: 'play', at: 0, signal: 'chime', gain: 1, rate: 1, wait: false }, 'playback'],
    ['volume.changed', { type: 'volume.changed', at: 0, volume: 0.5 }, 'playback'],
    ['context.unavailable', { type: 'context.unavailable', at: 0, field: 'hr' }, 'context'],
    ['error', { type: 'error', at: 0, message: 'boom' }, 'errors'],
    ['run.start', { type: 'run.start', at: 0, scriptName: 'x' }, 'engine'],
    ['run.stop', { type: 'run.stop', at: 0, reason: 'completed' }, 'engine'],
    [
      'phase.start',
      { type: 'phase.start', at: 0, phaseIndex: 0, phase: 'Early Sleep', scriptName: 'x' },
      'engine',
    ],
    [
      'phase.stop',
      {
        type: 'phase.stop',
        at: 1,
        phaseIndex: 0,
        phase: 'Early Sleep',
        scriptName: 'x',
        reason: 'completed',
      },
      'engine',
    ],
    ['log', { type: 'log', at: 0, message: 'note' }, 'engine'],
  ])('maps %s to %s', (_type, event, expected) => {
    expect(eventCategory(event)).toBe(expected);
  });
});

describe('FilteringLogPort', () => {
  it('drops events whose category is disabled', () => {
    const received: EngineEvent[] = [];
    const port = new FilteringLogPort(
      { log: (e) => received.push(e) },
      { playback: false, context: true, engine: true, errors: true },
    );

    port.log({ type: 'play', at: 0, signal: 'chime', gain: 1, rate: 1, wait: false });
    port.log({ type: 'context.unavailable', at: 0, field: 'hr' });

    expect(received).toEqual([{ type: 'context.unavailable', at: 0, field: 'hr' }]);
  });

  it('always passes run and phase boundaries through, even with "engine" disabled', () => {
    const received: EngineEvent[] = [];
    const port = new FilteringLogPort(
      { log: (e) => received.push(e) },
      { playback: false, context: false, engine: false, errors: false },
    );

    port.log({ type: 'run.start', at: 0, scriptName: 'x' });
    port.log({ type: 'phase.start', at: 0, phaseIndex: 0, phase: 'Early Sleep', scriptName: 'x' });
    port.log({ type: 'log', at: 0, message: 'dropped' });
    port.log({
      type: 'phase.stop',
      at: 1,
      phaseIndex: 0,
      phase: 'Early Sleep',
      scriptName: 'x',
      reason: 'completed',
    });
    port.log({ type: 'run.stop', at: 1, reason: 'completed' });

    expect(received).toEqual([
      { type: 'run.start', at: 0, scriptName: 'x' },
      { type: 'phase.start', at: 0, phaseIndex: 0, phase: 'Early Sleep', scriptName: 'x' },
      {
        type: 'phase.stop',
        at: 1,
        phaseIndex: 0,
        phase: 'Early Sleep',
        scriptName: 'x',
        reason: 'completed',
      },
      { type: 'run.stop', at: 1, reason: 'completed' },
    ]);
  });
});

describe('FanOutLogPort', () => {
  it('sends every event to every sink', () => {
    const a: EngineEvent[] = [];
    const b: EngineEvent[] = [];
    const port = new FanOutLogPort([{ log: (e) => a.push(e) }, { log: (e) => b.push(e) }]);

    const event: EngineEvent = { type: 'log', at: 0, message: 'hi' };
    port.log(event);

    expect(a).toEqual([event]);
    expect(b).toEqual([event]);
  });
});
