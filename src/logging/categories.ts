import type { EngineEvent, LogPort } from '@/engine';
import type { LogCategory } from '@/lib/settings';

/** Maps every EngineEvent to one of the Settings screen's four logging
 * toggles (spec §2.3: "per-category logging toggles (playback / context /
 * engine / errors)"). */
export function eventCategory(event: EngineEvent): LogCategory {
  switch (event.type) {
    case 'play':
    case 'volume.changed':
      return 'playback';
    case 'context.unavailable':
      return 'context';
    case 'error':
      return 'errors';
    case 'run.start':
    case 'run.stop':
    case 'phase.start':
    case 'phase.stop':
    case 'log':
      return 'engine';
  }
}

/** Wraps another LogPort, dropping events whose category is switched off.
 * Run and phase boundaries always pass through regardless of the `engine`
 * toggle — a log without lifecycle boundaries would be useless even if the
 * user only wanted, say, playback events. */
export class FilteringLogPort implements LogPort {
  constructor(
    private readonly inner: LogPort,
    private readonly enabled: Record<LogCategory, boolean>,
  ) {}

  log(event: EngineEvent): void {
    if (
      event.type === 'run.start' ||
      event.type === 'run.stop' ||
      event.type === 'phase.start' ||
      event.type === 'phase.stop' ||
      this.enabled[eventCategory(event)]
    ) {
      this.inner.log(event);
    }
  }
}

/** Sends every event to more than one LogPort — a run needs both the
 * durable JSONL file (JsonlLogPort) and the Run screen's live in-memory
 * state, and neither should know about the other. */
export class FanOutLogPort implements LogPort {
  constructor(private readonly sinks: LogPort[]) {}

  log(event: EngineEvent): void {
    for (const sink of this.sinks) sink.log(event);
  }
}
