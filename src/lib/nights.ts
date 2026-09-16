import type { RunRecord } from "@/logging/records";
import type { RunSummary } from "@/logging/run-index";

import type { LucidAnswer } from "./lucid-notes";

const HOUR = 3_600_000;
const pad2 = (value: number) => String(value).padStart(2, "0");

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** A night belongs to the evening it started on: a start before noon counts
 * as the previous night, so a 1 AM start is still "Friday night". */
export function nightDate(timestamp: number): Date {
  const shifted = new Date(timestamp - 12 * HOUR);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

export function nightKey(timestamp: number): string {
  return dateKey(nightDate(timestamp));
}

export type PhaseSlot = { label: string; scriptName: string | null };

/** Splits the run name `useSession` builds ("Pre-sleep Training: Empty · Early
 * Sleep: MILD Cycles · …") back into its phases. */
export function parseRunName(runName: string | null | undefined): PhaseSlot[] {
  if (!runName) return [];
  return runName.split(" · ").map((part) => {
    const separator = part.indexOf(": ");
    if (separator === -1) return { label: part.trim(), scriptName: null };
    const scriptName = part.slice(separator + 2).trim();
    return {
      label: part.slice(0, separator).trim(),
      scriptName: scriptName === "Empty" ? null : scriptName,
    };
  });
}

/** "MILD Cycles → Single Beep"; falls back to the raw name for runs recorded
 * before the three-phase format. */
export function scriptChain(runName: string | null | undefined): string {
  const names = parseRunName(runName)
    .map((slot) => slot.scriptName)
    .filter((name): name is string => name !== null);
  return names.length > 0 ? names.join(" → ") : (runName ?? "");
}

export type NightState =
  "none" | "error" | "stopped" | "interrupted" | "running" | "completed";

export function runState(run: RunSummary): NightState {
  if (run.endedAt === undefined) return "running";
  return run.reason ?? "completed";
}

// Several runs on one night collapse to the best outcome. Interrupted sits
// above error but below a night the user deliberately stopped: losing the
// process is a worse result than choosing to end early, but it is not the
// engine failing.
const STATE_RANK: Record<NightState, number> = {
  none: 0,
  error: 1,
  interrupted: 2,
  stopped: 3,
  running: 4,
  completed: 5,
};

export type WeekDay = {
  key: string;
  weekday: string;
  state: NightState;
  lucid: boolean;
  isTonight: boolean;
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Monday-to-Sunday strip for the week containing tonight. Several runs on one
 * night collapse to the best outcome; any "yes" answer marks the night lucid. */
export function buildWeek(
  runs: RunSummary[],
  lucid: Record<string, LucidAnswer>,
  now: number,
): WeekDay[] {
  const tonight = nightDate(now);
  const monday = new Date(
    tonight.getFullYear(),
    tonight.getMonth(),
    tonight.getDate() - ((tonight.getDay() + 6) % 7),
  );

  const nights = new Map<string, { state: NightState; lucid: boolean }>();
  for (const run of runs) {
    const key = nightKey(run.startedAt);
    const state = runState(run);
    const previous = nights.get(key);
    nights.set(key, {
      state:
        previous && STATE_RANK[previous.state] > STATE_RANK[state]
          ? previous.state
          : state,
      lucid: (previous?.lucid ?? false) || lucid[run.id] === "yes",
    });
  }

  return WEEKDAYS.map((weekday, offset) => {
    const key = dateKey(
      new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + offset,
      ),
    );
    const night = nights.get(key);
    return {
      key,
      weekday,
      state: night?.state ?? "none",
      lucid: night?.lucid ?? false,
      isTonight: key === dateKey(tonight),
    };
  });
}

export type PhaseSegment = { phaseIndex: number; durationMs: number };

/** How long each phase actually ran, from its phase.start/phase.stop events. A
 * phase with no stop (log cut short) runs to the last recorded event. */
export function phaseSegments(events: RunRecord[]): PhaseSegment[] {
  const openPhases = new Map<number, number>();
  const segments: PhaseSegment[] = [];
  let lastAt = 0;
  for (const event of events) {
    lastAt = Math.max(lastAt, event.at);
    if (event.type === "phase.start")
      openPhases.set(event.phaseIndex, event.at);
    if (event.type === "phase.stop") {
      const startedAt = openPhases.get(event.phaseIndex);
      if (startedAt === undefined) continue;
      segments.push({
        phaseIndex: event.phaseIndex,
        durationMs: Math.max(0, event.at - startedAt),
      });
      openPhases.delete(event.phaseIndex);
    }
  }
  for (const [phaseIndex, startedAt] of openPhases) {
    segments.push({ phaseIndex, durationMs: Math.max(0, lastAt - startedAt) });
  }
  return segments.sort((a, b) => a.phaseIndex - b.phaseIndex);
}

export function countPlays(events: RunRecord[]): number {
  return events.filter((event) => event.type === "play").length;
}

/** Parses a stored run log. Unreadable lines are skipped rather than
 * throwing: a process killed mid-append leaves a partial final line, and a
 * log from a newer build can hold record types this one has never seen.
 * Neither may stop a night being read. */
export function parseLogText(text: string): RunRecord[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          typeof (parsed as { type?: unknown }).type !== "string"
        ) {
          return [];
        }
        return [parsed as RunRecord];
      } catch {
        return [];
      }
    });
}
