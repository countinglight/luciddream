import type { ContextPort, ContextSnapshot, SleepStage } from '@/engine';

export type ContextValues = {
  hr?: number;
  hrv?: number;
  rem?: boolean;
  sleepStage?: SleepStage;
};

/** Values set by hand from the Settings screen's "Simulated context" panel
 * (spec §3.3/§4.3) — lets a script's conditionals be exercised on a real
 * device with no wearable at all, by moving sliders while a run plays. */
export class ManualContextProvider implements ContextPort {
  private values: ContextValues = {};

  set(values: ContextValues): void {
    this.values = values;
  }

  async snapshot(): Promise<ContextSnapshot> {
    return { at: Date.now(), ...this.values };
  }
}

type TimelineEntry = { at: number; values: ContextValues };

/** A scripted timeline of context values, e.g. "REM from t+95m for 12m" —
 * used for realistic dry runs and automated tests without a wearable.
 * `at` is milliseconds since the provider was constructed, not wall-clock
 * time, so a timeline reads the same regardless of when the run starts. */
export class ScriptedContextProvider implements ContextPort {
  private readonly startedAt: number;
  private timeline: TimelineEntry[] = [];

  constructor(private readonly now: () => number = Date.now) {
    this.startedAt = this.now();
  }

  at(offsetMs: number, values: ContextValues): this {
    this.timeline.push({ at: offsetMs, values });
    this.timeline.sort((a, b) => a.at - b.at);
    return this;
  }

  async snapshot(): Promise<ContextSnapshot> {
    const elapsed = this.now() - this.startedAt;
    let current: ContextValues = {};
    for (const entry of this.timeline) {
      if (entry.at <= elapsed) current = entry.values;
    }
    return { at: this.now(), ...current };
  }
}
