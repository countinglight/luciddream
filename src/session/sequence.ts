import { runScript, type LogPort, type RunController, type RunDeps, type Script } from '@/engine';

export type SessionPhase = {
  /** Index in the fixed three-slot plan, retained even when earlier slots are empty. */
  index: number;
  label: string;
  script: Script;
};

/** Executes independently parsed scripts in order while presenting one run
 * lifecycle to the rest of the app. Each interpreter gets fresh elapsed-time,
 * loop, rate, and volume state; shared ports keep audio and context continuous. */
export function runScriptSequence(name: string, phases: SessionPhase[], deps: RunDeps): RunController {
  let active: RunController | null = null;
  let stoppedByCaller = false;

  deps.log.log({ type: 'run.start', at: deps.clock.now(), scriptName: name });

  const done = (async () => {
    let sequenceReason: 'completed' | 'stopped' | 'error' = 'completed';

    try {
      for (const phase of phases) {
        if (stoppedByCaller) {
          sequenceReason = 'stopped';
          break;
        }

        let phaseReason: 'completed' | 'stopped' | 'error' = 'completed';
        deps.log.log({
          type: 'phase.start',
          at: deps.clock.now(),
          phaseIndex: phase.index,
          phase: phase.label,
          scriptName: phase.script.name,
        });

        const phaseLog: LogPort = {
          log(event) {
            if (event.type === 'run.start') return;
            if (event.type === 'run.stop') {
              phaseReason = event.reason;
              return;
            }
            deps.log.log(event);
          },
        };

        active = runScript(phase.script, { ...deps, log: phaseLog });
        await active.done;
        active = null;

        deps.log.log({
          type: 'phase.stop',
          at: deps.clock.now(),
          phaseIndex: phase.index,
          phase: phase.label,
          scriptName: phase.script.name,
          reason: phaseReason,
        });

        if (phaseReason !== 'completed') {
          sequenceReason = phaseReason;
          break;
        }
      }
    } catch (error) {
      sequenceReason = 'error';
      deps.log.log({
        type: 'error',
        at: deps.clock.now(),
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (stoppedByCaller) sequenceReason = 'stopped';
    deps.log.log({ type: 'run.stop', at: deps.clock.now(), reason: sequenceReason });
  })();

  return {
    stop() {
      stoppedByCaller = true;
      active?.stop();
    },
    done,
  };
}
