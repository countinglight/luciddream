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

export type Settings = {
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
};

export const DEFAULT_SETTINGS: Settings = {
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
};

const STORAGE_KEY = "luciddream.settings.v1";

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      logCategories: {
        ...DEFAULT_SETTINGS.logCategories,
        ...parsed.logCategories,
      },
      simulatedContext: {
        ...DEFAULT_SETTINGS.simulatedContext,
        ...parsed.simulatedContext,
      },
      periodPresets: {
        ...DEFAULT_SETTINGS.periodPresets,
        ...parsed.periodPresets,
      },
      runPhaseScriptIds: {
        ...DEFAULT_SETTINGS.runPhaseScriptIds,
        ...parsed.runPhaseScriptIds,
      },
    };
  } catch {
    // Corrupt or unavailable storage shouldn't crash the app — fall back to defaults.
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
