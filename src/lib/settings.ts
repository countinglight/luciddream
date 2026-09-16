import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SleepStage } from "@/engine";

import {
  DEFAULT_RUN_PHASE_SCRIPT_IDS,
  type RunPhaseScriptIds,
} from "./run-phases";

export type LogCategory = "playback" | "context" | "engine" | "errors";

export type SimulatedContextSettings = {
  hr?: number;
  hrv?: number;
  rem: boolean;
  sleepStage: SleepStage | "none";
};

export type ThemePreference = "system" | "light" | "dark";

export type Settings = {
  /** Spec §2.3 theme setting; "system" follows the device. */
  themePreference: ThemePreference;
  /** Seeds the Run screen's volume slider on first load (spec §2.3). */
  masterDefaultVolume: number;
  logCategories: Record<LogCategory, boolean>;
  /** duck: expo-audio's `duckOthers` (alarms still cut through). exclusive:
   * `doNotMix` (spec §4.4 default is duck). */
  audioFocus: "duck" | "exclusive";
  /** v1 only ever performs the "gentle" action (spec §4.6) — a threshold
   * can't distinguish "stop" from snoring, so there's no "stop" option. */
  voiceInterrupt: "off" | "gentle";
  /** Settings screen's "Simulated context" panel (spec §2.3/§4.3) — drives
   * ManualContextProvider live, including mid-run. */
  simulatedContext: SimulatedContextSettings;
  /** Period presets (spec §3.2) — T-shirt-sized period values scripts refer
   * to as `$short` / `$medium` / `$long`, in milliseconds. */
  periodPresets: {
    short: number;
    medium: number;
    long: number;
  };
  /** Last-used three-phase plan on the Run screen. Null means that phase is
   * intentionally empty, not that settings have failed to load. */
  runPhaseScriptIds: RunPhaseScriptIds;
  /** Opt-in beta diagnostics (doc/plans/luciddream-beta-telemetry.md). Only
   * shown, and only effective, in builds that carry a telemetry endpoint. */
  diagnostics: {
    enabled: boolean;
    /** Optional name the tester chooses, so reports can be told apart. */
    testerLabel: string;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  themePreference: "system",
  masterDefaultVolume: 0.6,
  logCategories: {
    playback: true,
    context: true,
    engine: true,
    errors: true,
  },
  audioFocus: "duck",
  voiceInterrupt: "off",
  simulatedContext: {
    rem: false,
    sleepStage: "none",
  },
  periodPresets: {
    short: 5_000,
    medium: 20_000,
    long: 5 * 60_000,
  },
  runPhaseScriptIds: DEFAULT_RUN_PHASE_SCRIPT_IDS,
  diagnostics: {
    enabled: false,
    testerLabel: "",
  },
};

const STORAGE_KEY = "luciddream.settings.v1";

/**
 * Reads persisted settings, treating what it finds as untrusted.
 *
 * The stored blob used to be spread straight over the defaults, so anything
 * that had ended up in it — a value of the wrong type, a number where a
 * string belongs, an array instead of an object — flowed on into the engine
 * and the UI. Storage can be corrupted by a partial write, a downgrade, or a
 * future version writing a shape this build does not know. A bad value must
 * cost the user that one setting, never the app.
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    // Corrupt or unavailable storage shouldn't crash the app — fall back to defaults.
    return DEFAULT_SETTINGS;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function number(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Out of range is treated as invalid, not clamped. Clamping suits a volume,
 * where 900 clearly means "loudest"; it is wrong for a period, where a stored
 * 0 would become 1ms and turn every wait into a busy loop. */
function numberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value >= min && value <= max ? value : fallback;
}

/** An optional reading: absent stays absent, nonsense becomes absent. */
function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

const HOUR_MS = 3_600_000;

export function sanitizeSettings(parsed: unknown): Settings {
  if (!isRecord(parsed)) return DEFAULT_SETTINGS;

  const categories = isRecord(parsed.logCategories) ? parsed.logCategories : {};
  const simulated = isRecord(parsed.simulatedContext)
    ? parsed.simulatedContext
    : {};
  const presets = isRecord(parsed.periodPresets) ? parsed.periodPresets : {};
  const phases = isRecord(parsed.runPhaseScriptIds)
    ? parsed.runPhaseScriptIds
    : {};
  const diagnostics = isRecord(parsed.diagnostics) ? parsed.diagnostics : {};

  return {
    themePreference: oneOf(
      parsed.themePreference,
      ["system", "light", "dark"],
      DEFAULT_SETTINGS.themePreference,
    ),
    masterDefaultVolume: number(
      parsed.masterDefaultVolume,
      DEFAULT_SETTINGS.masterDefaultVolume,
      0,
      1,
    ),
    logCategories: {
      playback: boolean(categories.playback, true),
      context: boolean(categories.context, true),
      engine: boolean(categories.engine, true),
      errors: boolean(categories.errors, true),
    },
    audioFocus: oneOf(
      parsed.audioFocus,
      ["duck", "exclusive"],
      DEFAULT_SETTINGS.audioFocus,
    ),
    voiceInterrupt: oneOf(
      parsed.voiceInterrupt,
      ["off", "gentle"],
      DEFAULT_SETTINGS.voiceInterrupt,
    ),
    simulatedContext: {
      hr: optionalNumber(simulated.hr),
      hrv: optionalNumber(simulated.hrv),
      rem: boolean(simulated.rem, DEFAULT_SETTINGS.simulatedContext.rem),
      sleepStage: oneOf(
        simulated.sleepStage,
        ["none", "awake", "light", "deep", "rem"],
        "none",
      ),
    },
    periodPresets: {
      // A preset of zero, or a negative one, would turn every `$short` wait
      // into a busy loop; one of days would silently never fire.
      short: numberInRange(
        presets.short,
        DEFAULT_SETTINGS.periodPresets.short,
        1,
        24 * HOUR_MS,
      ),
      medium: numberInRange(
        presets.medium,
        DEFAULT_SETTINGS.periodPresets.medium,
        1,
        24 * HOUR_MS,
      ),
      long: numberInRange(
        presets.long,
        DEFAULT_SETTINGS.periodPresets.long,
        1,
        24 * HOUR_MS,
      ),
    },
    runPhaseScriptIds: {
      preSleepTraining: scriptId(
        phases,
        "preSleepTraining",
        DEFAULT_SETTINGS.runPhaseScriptIds.preSleepTraining,
      ),
      earlySleep: scriptId(
        phases,
        "earlySleep",
        DEFAULT_SETTINGS.runPhaseScriptIds.earlySleep,
      ),
      wakeUp: scriptId(
        phases,
        "wakeUp",
        DEFAULT_SETTINGS.runPhaseScriptIds.wakeUp,
      ),
    },
    diagnostics: {
      enabled: boolean(diagnostics.enabled, false),
      testerLabel:
        typeof diagnostics.testerLabel === "string"
          ? diagnostics.testerLabel.slice(0, 200)
          : "",
    },
  };
}

/**
 * A chosen script id, or null for "this phase is deliberately empty".
 *
 * The three cases are genuinely different. An explicit null is a choice and is
 * kept. A missing key means this install predates the field, so the default
 * plan applies — flattening that to null would silently empty a working plan.
 * Anything else is corrupt, and the default is more useful than leaving the
 * user with nothing to play.
 */
function scriptId(
  phases: Record<string, unknown>,
  key: string,
  fallback: string | null,
): string | null {
  if (!(key in phases)) return fallback;
  const value = phases[key];
  if (value === null) return null;
  if (typeof value === "string" && value.length > 0) return value;
  return fallback;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
