import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../settings";

describe("settings persistence", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns the defaults when nothing has been saved yet", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a saved value", async () => {
    const next = {
      ...DEFAULT_SETTINGS,
      masterDefaultVolume: 0.8,
      audioFocus: "exclusive" as const,
      voiceInterrupt: "gentle" as const,
    };
    await saveSettings(next);

    expect(await loadSettings()).toEqual(next);
  });

  it("keeps beta diagnostics off, and merges a partial diagnostics object", async () => {
    expect(DEFAULT_SETTINGS.diagnostics).toEqual({
      enabled: false,
      testerLabel: "",
    });
    await AsyncStorage.setItem(
      "luciddream.settings.v1",
      JSON.stringify({ diagnostics: { enabled: true } }),
    );

    expect((await loadSettings()).diagnostics).toEqual({
      enabled: true,
      testerLabel: "",
    });
  });

  it("fills in defaults for fields missing from an older saved shape", async () => {
    await AsyncStorage.setItem(
      "luciddream.settings.v1",
      JSON.stringify({ masterDefaultVolume: 0.9 }),
    );

    expect(await loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      masterDefaultVolume: 0.9,
    });
  });

  it("merges a partial periodPresets object from an older saved shape", async () => {
    await AsyncStorage.setItem(
      "luciddream.settings.v1",
      JSON.stringify({ periodPresets: { short: 60_000 } }),
    );

    const loaded = await loadSettings();
    expect(loaded.periodPresets).toEqual({
      ...DEFAULT_SETTINGS.periodPresets,
      short: 60_000,
    });
  });

  it("falls back to defaults if storage holds corrupt JSON", async () => {
    await AsyncStorage.setItem("luciddream.settings.v1", "not-json");

    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("settings are treated as untrusted", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  async function storedAs(value: unknown) {
    await AsyncStorage.setItem("luciddream.settings.v1", JSON.stringify(value));
    return loadSettings();
  }

  it("falls back to defaults when the stored value is not an object", async () => {
    expect(await storedAs("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(await storedAs([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
    expect(await storedAs(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("survives outright corrupt JSON", async () => {
    await AsyncStorage.setItem("luciddream.settings.v1", "{not json");
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("replaces a value of the wrong type rather than passing it on", async () => {
    const settings = await storedAs({
      masterDefaultVolume: "loud",
      audioFocus: "sideways",
      voiceInterrupt: 7,
      themePreference: null,
    });

    expect(settings.masterDefaultVolume).toBe(
      DEFAULT_SETTINGS.masterDefaultVolume,
    );
    expect(settings.audioFocus).toBe(DEFAULT_SETTINGS.audioFocus);
    expect(settings.voiceInterrupt).toBe(DEFAULT_SETTINGS.voiceInterrupt);
    expect(settings.themePreference).toBe(DEFAULT_SETTINGS.themePreference);
  });

  it("clamps a volume that is out of range", async () => {
    expect(
      (await storedAs({ masterDefaultVolume: 900 })).masterDefaultVolume,
    ).toBe(1);
    expect(
      (await storedAs({ masterDefaultVolume: -5 })).masterDefaultVolume,
    ).toBe(0);
  });

  it("refuses a period preset that would turn a wait into a busy loop", async () => {
    // Zero or negative would make every `$short` wait return immediately.
    const settings = await storedAs({
      periodPresets: { short: 0, medium: -1, long: "ages" },
    });
    expect(settings.periodPresets).toEqual(DEFAULT_SETTINGS.periodPresets);
  });

  it("keeps a valid preset while replacing its broken neighbour", async () => {
    const settings = await storedAs({
      periodPresets: { short: 90_000, medium: Infinity },
    });
    expect(settings.periodPresets.short).toBe(90_000);
    expect(settings.periodPresets.medium).toBe(
      DEFAULT_SETTINGS.periodPresets.medium,
    );
  });

  it("drops a nonsensical simulated reading instead of feeding it to the engine", async () => {
    const settings = await storedAs({
      simulatedContext: { hr: "fast", rem: "yes", sleepStage: "dreaming" },
    });
    expect(settings.simulatedContext.hr).toBeUndefined();
    expect(settings.simulatedContext.rem).toBe(false);
    expect(settings.simulatedContext.sleepStage).toBe("none");
  });

  it("falls back to the default plan for a corrupt phase script id", async () => {
    // Better a working plan than a night with nothing to play.
    const settings = await storedAs({
      runPhaseScriptIds: { earlySleep: 12, wakeUp: "", preSleepTraining: {} },
    });
    expect(settings.runPhaseScriptIds).toEqual(
      DEFAULT_SETTINGS.runPhaseScriptIds,
    );
  });

  it("keeps a phase the user deliberately emptied", async () => {
    // An explicit null is a choice, not corruption, and must survive.
    const settings = await storedAs({
      runPhaseScriptIds: {
        preSleepTraining: null,
        earlySleep: null,
        wakeUp: "bundled-01-single-beep",
      },
    });
    expect(settings.runPhaseScriptIds.earlySleep).toBeNull();
    expect(settings.runPhaseScriptIds.wakeUp).toBe("bundled-01-single-beep");
  });

  it("keeps the default plan when the field predates this build", async () => {
    const settings = await storedAs({ masterDefaultVolume: 0.5 });
    expect(settings.runPhaseScriptIds).toEqual(
      DEFAULT_SETTINGS.runPhaseScriptIds,
    );
  });

  it("keeps good values alongside bad ones", async () => {
    const settings = await storedAs({
      masterDefaultVolume: 0.42,
      audioFocus: "exclusive",
      diagnostics: { enabled: "yes please", testerLabel: "Vlad" },
    });
    expect(settings.masterDefaultVolume).toBe(0.42);
    expect(settings.audioFocus).toBe("exclusive");
    expect(settings.diagnostics.enabled).toBe(false);
    expect(settings.diagnostics.testerLabel).toBe("Vlad");
  });
});
