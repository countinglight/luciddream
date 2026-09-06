import type { ClockPort } from '@/engine';

/** Longest single `setTimeout` between wall-clock re-reads. Bounds drift and
 * lets a sleep react to Android throttling timers during doze instead of
 * committing to one long, unreactive setTimeout (spec §4.2). */
const MAX_SLICE_MS = 30_000;

/** The real ClockPort used by a live session. Computes an absolute deadline
 * up front and sleeps toward it in bounded slices, re-reading `Date.now()`
 * each time, rather than trusting one `setTimeout(ms)` to fire on schedule
 * over minutes or hours — this is what keeps an 8-hour run's timing from
 * drifting (spec §4.2). */
export class RealClockPort implements ClockPort {
  now(): number {
    return Date.now();
  }

  async sleep(ms: number, signal: AbortSignal): Promise<void> {
    const deadline = Date.now() + ms;
    while (!signal.aborted) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      await sleepOnce(Math.min(remaining, MAX_SLICE_MS), signal);
    }
  }
}

function sleepOnce(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
