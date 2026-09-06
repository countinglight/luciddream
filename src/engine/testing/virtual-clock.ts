import type { ClockPort } from '../ports';

type PendingTimer = {
  at: number;
  resolve: () => void;
};

/** A ClockPort with no relationship to real time. `sleep()` returns a
 * promise that only resolves once the test explicitly advances the clock
 * past its deadline — so an eight-hour script runs in milliseconds of real
 * test time, deterministically, per spec §4.2. */
export class VirtualClock implements ClockPort {
  private currentMs: number;
  private timers: PendingTimer[] = [];

  constructor(startMs = 0) {
    this.currentMs = startMs;
  }

  now(): number {
    return this.currentMs;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer: PendingTimer = { at: this.currentMs + ms, resolve };
      this.timers.push(timer);
      signal?.addEventListener('abort', () => {
        const index = this.timers.indexOf(timer);
        if (index !== -1) {
          this.timers.splice(index, 1);
          resolve();
        }
      });
    });
  }

  /** Advances time to `targetMs`, firing every timer due along the way.
   *
   * Flushes microtasks *before* each check for a due timer, not only after
   * firing one — code between two `wait`s (e.g. a play's own await chain,
   * however many microtask hops that takes once Babel's async transform is
   * involved) needs to be given the chance to run and register its own
   * timer before we conclude nothing is due. Skipping that first flush lets
   * `advanceTo` race ahead of the interpreter, decide nothing is pending
   * yet, and jump `currentMs` forward — after which a timer that registers
   * a moment later computes its deadline from the wrong "now" and never
   * gets advanced to, hanging the test. */
  async advanceTo(targetMs: number): Promise<void> {
    for (;;) {
      await flushMicrotasks();
      const due = this.timers.filter((t) => t.at <= targetMs).sort((a, b) => a.at - b.at);
      if (due.length === 0) break;
      const next = due[0];
      this.currentMs = next.at;
      this.timers = this.timers.filter((t) => t !== next);
      next.resolve();
    }
    this.currentMs = Math.max(this.currentMs, targetMs);
  }

  async advanceBy(ms: number): Promise<void> {
    await this.advanceTo(this.currentMs + ms);
  }

  /** Jumps straight from one pending timer to the next until `isDone()`
   * returns true (the run finished) or no timer remains pending, or `maxMs`
   * of virtual time has passed — a safety net against a script that never
   * finishes hanging a test forever. */
  async runToCompletion(isDone: () => boolean, maxMs = 24 * 3_600_000): Promise<void> {
    while (!isDone() && this.currentMs < maxMs) {
      if (this.timers.length === 0) {
        await flushMicrotasks();
        if (this.timers.length === 0) break;
        continue;
      }
      const nextDue = Math.min(...this.timers.map((t) => t.at));
      await this.advanceTo(nextDue);
    }
  }
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
