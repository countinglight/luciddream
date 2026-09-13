import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearLucidNotes, loadLucidNotes, saveLucidNote } from "../lucid-notes";

describe("lucid notes", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("starts empty", async () => {
    expect(await loadLucidNotes()).toEqual({});
  });

  it("saves, replaces and clears an answer per run", async () => {
    await saveLucidNote("run-a", "yes");
    await saveLucidNote("run-b", "unsure");
    await saveLucidNote("run-a", "no");
    expect(await loadLucidNotes()).toEqual({
      "run-a": "no",
      "run-b": "unsure",
    });

    await saveLucidNote("run-b", null);
    expect(await loadLucidNotes()).toEqual({ "run-a": "no" });

    await clearLucidNotes();
    expect(await loadLucidNotes()).toEqual({});
  });

  it("ignores corrupt or unknown stored values", async () => {
    await AsyncStorage.setItem(
      "luciddream.lucid.v1",
      JSON.stringify({ good: "yes", bad: "maybe" }),
    );
    expect(await loadLucidNotes()).toEqual({ good: "yes" });

    await AsyncStorage.setItem("luciddream.lucid.v1", "{not json");
    expect(await loadLucidNotes()).toEqual({});
  });
});
