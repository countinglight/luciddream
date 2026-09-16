import type { EngineEvent } from "@/engine";

import { redactMessage } from "./redact";
import { type RunEndReason, type RunInfo, type RunPhaseInfo } from "./types";

/** Folds a run's engine events into the few numbers diagnostics report.
 * Pure: no storage, no clock of its own. */
export class RunTracker {
  playCount = 0;
  eventCount = 0;
  errorCount = 0;
  lastErrorMessage: string | undefined;
  lastEventAt: number;

  constructor(
    readonly runId: string,
    readonly startedAt: number,
    readonly phases: RunPhaseInfo[],
  ) {
    this.lastEventAt = startedAt;
  }

  observe(event: EngineEvent): void {
    this.eventCount += 1;
    this.lastEventAt = Math.max(this.lastEventAt, event.at);
    if (event.type === "play") this.playCount += 1;
    if (event.type === "error") {
      this.errorCount += 1;
      // Engine errors routinely embed a file path or the URL a user typed.
      this.lastErrorMessage = redactMessage(event.message);
    }
  }

  snapshot(lastSeenAt: number): RunInfo {
    return {
      id: this.runId,
      startedAt: this.startedAt,
      lastSeenAt: Math.max(lastSeenAt, this.lastEventAt),
      phases: this.phases,
      playCount: this.playCount,
      eventCount: this.eventCount,
      errorCount: this.errorCount,
      ...(this.lastErrorMessage ? { errorMessage: this.lastErrorMessage } : {}),
    };
  }

  ended(endedAt: number, reason: RunEndReason): RunInfo {
    return {
      ...this.snapshot(endedAt),
      endedAt,
      durationMs: Math.max(0, endedAt - this.startedAt),
      endReason: reason,
    };
  }
}
