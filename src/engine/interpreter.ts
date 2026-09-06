import type { Condition, Script, Statement } from './ast';
import { evaluateCondition, type ConditionContext } from './conditions';
import type { RunDeps } from './ports';

export type RunController = {
  /** Requests a clean stop. Idempotent — safe to call more than once, and
   * safe to call after the run has already finished on its own. */
  stop(): void;
  /** Resolves when the run ends, for any reason. Never rejects — a runtime
   * error ends the run and is reported as an `error` log event instead
   * (spec §2.4: a malformed or misbehaving script must never crash). */
  done: Promise<void>;
};

type ExecState = {
  deps: RunDeps;
  startedAt: number;
  abort: AbortController;
  /** Multiplicative gain scopes; index 0 is the script's own base volume and
   * is what `set: { volume }` rewrites. */
  gainStack: number[];
  rateStack: number[];
  /** Innermost enclosing `repeat`'s 0-based iteration, for the `iteration`
   * condition field. Undefined outside any loop. */
  iterationStack: number[];
};

function product(stack: number[]): number {
  return stack.reduce((acc, v) => acc * v, 1);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Starts executing `script` against `deps`, returning a controller rather
 * than a bare promise so a caller (the Run screen, or a test) can request
 * cancellation while it's mid-flight. */
export function runScript(script: Script, deps: RunDeps): RunController {
  const state: ExecState = {
    deps,
    startedAt: deps.clock.now(),
    abort: new AbortController(),
    gainStack: [script.volume],
    rateStack: [1],
    iterationStack: [],
  };

  deps.log.log({ type: 'run.start', at: state.startedAt, scriptName: script.name });

  let stoppedByCaller = false;

  const done = (async () => {
    let reason: 'completed' | 'stopped' | 'error' = 'completed';
    try {
      await execBody(script.body, state);
      if (state.abort.signal.aborted) reason = 'stopped';
    } catch (err) {
      reason = 'error';
      deps.log.log({
        type: 'error',
        at: deps.clock.now(),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (stoppedByCaller) reason = 'stopped';
    deps.log.log({ type: 'run.stop', at: deps.clock.now(), reason });
  })();

  return {
    stop() {
      stoppedByCaller = true;
      state.abort.abort();
    },
    done,
  };
}

function isStopped(state: ExecState): boolean {
  return state.abort.signal.aborted;
}

async function execBody(statements: Statement[], state: ExecState): Promise<void> {
  for (const statement of statements) {
    if (isStopped(state)) return;
    await execStatement(statement, state);
  }
}

async function execStatement(statement: Statement, state: ExecState): Promise<void> {
  switch (statement.kind) {
    case 'play':
      return execPlay(statement, state);
    case 'wait':
      return execWait(statement, state);
    case 'repeat':
      return execRepeat(statement, state);
    case 'if':
      return execIf(statement, state);
    case 'with':
      return execWith(statement, state);
    case 'set':
      return execSet(statement, state);
    case 'log':
      state.deps.log.log({ type: 'log', at: state.deps.clock.now(), message: statement.message });
      return;
    case 'stop':
      state.abort.abort();
      return;
  }
}

async function execPlay(statement: Extract<Statement, { kind: 'play' }>, state: ExecState): Promise<void> {
  const gain = clamp01(product(state.gainStack) * (statement.gain ?? 1));
  const rate = product(state.rateStack) * (statement.rate ?? 1);
  const wait = statement.wait ?? false;

  const handle = await state.deps.audio.play(statement.signal, { gain, rate });
  state.deps.log.log({
    type: 'play',
    at: state.deps.clock.now(),
    signal: statement.signal,
    gain,
    rate,
    wait,
  });
  if (wait) {
    await handle.finished;
  }
}

async function execWait(statement: Extract<Statement, { kind: 'wait' }>, state: ExecState): Promise<void> {
  await state.deps.clock.sleep(statement.duration, state.abort.signal);
}

async function execRepeat(statement: Extract<Statement, { kind: 'repeat' }>, state: ExecState): Promise<void> {
  const max = statement.count === 'infinite' ? Infinity : statement.count;
  for (let i = 0; i < max; i++) {
    if (isStopped(state)) return;
    if (statement.until) {
      state.iterationStack.push(i);
      const { value: shouldStop } = await evalCondition(statement.until, state);
      state.iterationStack.pop();
      if (shouldStop) return;
    }
    state.iterationStack.push(i);
    try {
      await execBody(statement.body, state);
    } finally {
      state.iterationStack.pop();
    }
  }
}

async function execIf(statement: Extract<Statement, { kind: 'if' }>, state: ExecState): Promise<void> {
  const { value } = await evalCondition(statement.condition, state);
  const branch = value ? statement.then : statement.else;
  if (branch) await execBody(branch, state);
}

async function execWith(statement: Extract<Statement, { kind: 'with' }>, state: ExecState): Promise<void> {
  state.gainStack.push(statement.gain ?? 1);
  state.rateStack.push(statement.rate ?? 1);
  try {
    await execBody(statement.body, state);
  } finally {
    state.gainStack.pop();
    state.rateStack.pop();
  }
}

async function execSet(statement: Extract<Statement, { kind: 'set' }>, state: ExecState): Promise<void> {
  if (statement.volume === undefined) return;
  state.gainStack[0] = statement.volume;
  state.deps.log.log({ type: 'volume.changed', at: state.deps.clock.now(), volume: statement.volume });
}

function formatClock(epochMs: number): string {
  const date = new Date(epochMs);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function evalCondition(condition: Condition, state: ExecState) {
  const snapshot = await state.deps.context.snapshot();
  const ctx: ConditionContext = {
    elapsed: state.deps.clock.now() - state.startedAt,
    clock: formatClock(state.deps.clock.now()),
    iteration: state.iterationStack.at(-1),
    hr: snapshot.hr,
    hrv: snapshot.hrv,
    rem: snapshot.rem,
    sleepStage: snapshot.sleepStage,
  };
  const result = evaluateCondition(condition, ctx);
  for (const field of result.missingFields) {
    state.deps.log.log({ type: 'context.unavailable', at: state.deps.clock.now(), field });
  }
  return result;
}
