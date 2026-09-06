import type { Script } from '@/engine';
import { FakeContextProvider, RecordingAudioPort, RecordingLogPort } from '@/engine/testing/fakes';
import { VirtualClock } from '@/engine/testing/virtual-clock';

import { runScriptSequence } from '../sequence';

function script(name: string, body: Script['body']): Script {
  return { name, version: 1, volume: 0.5, body };
}

function deps() {
  const clock = new VirtualClock();
  return {
    audio: new RecordingAudioPort(),
    clock,
    context: new FakeContextProvider(() => clock.now()),
    log: new RecordingLogPort(),
  };
}

describe('runScriptSequence', () => {
  it('runs phases in order with one overall run boundary', async () => {
    const ports = deps();
    const controller = runScriptSequence(
      'Night plan',
      [
        { index: 0, label: 'Pre-sleep Training', script: script('Training', [{ kind: 'play', signal: 'bell' }]) },
        { index: 1, label: 'Early Sleep', script: script('Sleep', [{ kind: 'play', signal: 'chime' }]) },
      ],
      ports,
    );
    await controller.done;

    expect(ports.audio.calls.map((call) => call.signal)).toEqual(['bell', 'chime']);
    expect(ports.log.events.map((event) => event.type)).toEqual([
      'run.start',
      'phase.start',
      'play',
      'phase.stop',
      'phase.start',
      'play',
      'phase.stop',
      'run.stop',
    ]);
    expect(ports.log.events.at(-1)).toMatchObject({ type: 'run.stop', reason: 'completed' });
  });

  it('treats a script stop statement as termination of the whole night', async () => {
    const ports = deps();
    const controller = runScriptSequence(
      'Night plan',
      [
        { index: 1, label: 'Early Sleep', script: script('Stop here', [{ kind: 'stop' }]) },
        { index: 2, label: 'Wake Up', script: script('Never runs', [{ kind: 'play', signal: 'bell' }]) },
      ],
      ports,
    );
    await controller.done;

    expect(ports.audio.calls).toHaveLength(0);
    expect(ports.log.events.filter((event) => event.type === 'phase.start')).toEqual([
      expect.objectContaining({ phaseIndex: 1, phase: 'Early Sleep' }),
    ]);
    expect(ports.log.events.at(-1)).toMatchObject({ type: 'run.stop', reason: 'stopped' });
  });

  it('resets interpreter volume state for each phase', async () => {
    const ports = deps();
    const controller = runScriptSequence(
      'Night plan',
      [
        {
          index: 1,
          label: 'Early Sleep',
          script: script('Changes volume', [
            { kind: 'set', volume: 0.1 },
            { kind: 'play', signal: 'bell' },
          ]),
        },
        { index: 2, label: 'Wake Up', script: script('Fresh volume', [{ kind: 'play', signal: 'chime' }]) },
      ],
      ports,
    );
    await controller.done;

    expect(ports.audio.calls.map((call) => call.opts.gain)).toEqual([0.1, 0.5]);
  });
});
