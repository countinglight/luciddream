import type { EngineEvent } from '@/engine';

/** One-line human summary of an event — used for the Run screen's live
 * events strip, the Android notification body, and the Log screen's
 * timeline, so all three read the same way. */
export function describeEvent(event: EngineEvent): string {
  switch (event.type) {
    case 'run.start':
      return `Started "${event.scriptName}"`;
    case 'run.stop':
      return `Stopped (${event.reason})`;
    case 'phase.start':
      return `${event.phase}: started "${event.scriptName}"`;
    case 'phase.stop':
      return `${event.phase}: ${event.reason}`;
    case 'play':
      return `Played ${event.signal}`;
    case 'volume.changed':
      return `Volume → ${Math.round(event.volume * 100)}%`;
    case 'log':
      return event.message;
    case 'context.unavailable':
      return `No ${event.field} reading`;
    case 'error':
      return `Error: ${event.message}`;
  }
}
