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
