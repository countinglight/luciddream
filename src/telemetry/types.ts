/**
 * Beta diagnostics wire format (doc/plans/luciddream-beta-telemetry.md §4).
 * One event per interesting moment of a night — never the run log itself,
 * never audio, never library content beyond script display names.
 */

export const TELEMETRY_SCHEMA_VERSION = 1;

export type RunEndReason =
  | "completed"
  | "stopped"
  | "error"
  /** The process disappeared mid-run (OS kill, native crash, battery died);
   * detected on the next launch from the open-run marker. */
  | "interrupted"
  /** A fatal JavaScript error was recorded before the process died. */
  | "crashed";

export type DeviceInfo = {
  platform: string;
  osVersion: string | null;
  /** e.g. "iPhone 15 Pro", "Pixel 8". */
  model: string | null;
  manufacturer: string | null;
};

export type AppInfo = {
  version: string | null;
  build: string | null;
  updateId: string | null;
  channel: string | null;
};

export type RunPhaseInfo = { label: string; script: string };

export type RunInfo = {
  id: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  endReason?: RunEndReason;
  /** Last moment the app is known to have been alive during the run. For an
   * interrupted run this is the best available end time. */
  lastSeenAt?: number;
  phases?: RunPhaseInfo[];
  playCount?: number;
  eventCount?: number;
  errorCount?: number;
  errorMessage?: string;
};

export type TelemetryEventType = "run.start" | "run.end" | "app.crash";

export type TelemetryEvent = {
  v: typeof TELEMETRY_SCHEMA_VERSION;
  /** Unique per event; the backend ignores duplicates, so retries are safe. */
  id: string;
  type: TelemetryEventType;
  at: number;
  /** Random per installation; not derived from any device identifier. */
  installId: string;
  /** Optional name the tester typed in Settings. */
  testerLabel?: string;
  device: DeviceInfo;
  app: AppInfo;
  run?: RunInfo;
  error?: { message: string; fatal: boolean };
};

/** The subset of AsyncStorage the telemetry modules use, so tests can pass an
 * in-memory map. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const MAX_TEXT = 200;
export const MAX_MESSAGE = 500;

export function truncate(text: string, max: number = MAX_TEXT): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
