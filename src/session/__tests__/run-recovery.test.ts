import AsyncStorage from "@react-native-async-storage/async-storage";

import { logPathFor } from "@/logging/jsonl-log-port";
import {
  loadRunIndex,
  saveRunIndex,
  type RunSummary,
} from "@/logging/run-index";
import { InMemoryFileStore } from "@/storage/testing/in-memory-file-store";

import {
  clearOpenRun,
  readOpenRun,
  recoverInterruptedRuns,
  writeOpenRun,
} from "../run-recovery";

const NOW = 10_000_000;

function openRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    scriptName: "Early Sleep: MILD Cycles",
    startedAt: 1_000,
    eventCount: 3,
    ...overrides,
  };
}

async function deps(store = new InMemoryFileStore()) {
  return { fileStore: store, now: () => NOW, store };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("recoverInterruptedRuns", () => {
  it("does nothing when the previous process ended cleanly", async () => {
    const { fileStore, now } = await deps();
    await saveRunIndex([openRun({ endedAt: 5_000, reason: "completed" })]);

    const result = await recoverInterruptedRuns({ fileStore, now });

    expect(result.interrupted).toHaveLength(0);
    expect((await loadRunIndex())[0].reason).toBe("completed");
  });

  it("closes a run left open, using the marker's last-seen time", async () => {
    const { fileStore, now } = await deps();
    await saveRunIndex([openRun()]);
    await writeOpenRun({
      id: "run-1",
      name: "Early Sleep: MILD Cycles",
      startedAt: 1_000,
      lastSeenAt: 4_000,
      eventCount: 3,
    });

    const result = await recoverInterruptedRuns({ fileStore, now });

    expect(result.interrupted).toHaveLength(1);
    const stored = (await loadRunIndex())[0];
    expect(stored.reason).toBe("interrupted");
    expect(stored.endedAt).toBe(4_000);
  });

  it("appends an interrupted record naming how the end time was established", async () => {
    const { fileStore, now } = await deps();
    await saveRunIndex([openRun()]);
    await writeOpenRun({
      id: "run-1",
      name: "n",
      startedAt: 1_000,
      lastSeenAt: 4_000,
      eventCount: 3,
    });

    await recoverInterruptedRuns({ fileStore, now });

    const text = await fileStore.readText("document", logPathFor("run-1"));
    const record = JSON.parse(text.trim());
    expect(record).toMatchObject({
      type: "run.interrupted",
      at: 4_000,
      detectedAt: NOW,
      endTimeSource: "marker",
    });
  });

  it("appends to an existing log instead of replacing the night", async () => {
    const { fileStore, now } = await deps();
    await saveRunIndex([openRun()]);
    await fileStore.writeText(
      "document",
      logPathFor("run-1"),
      '{"type":"run.start","at":1000,"scriptName":"MILD"}\n',
    );

    await recoverInterruptedRuns({ fileStore, now });

    const lines = (await fileStore.readText("document", logPathFor("run-1")))
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).type).toBe("run.start");
    expect(JSON.parse(lines[1]).type).toBe("run.interrupted");
  });

  it("falls back to the last recorded event when there is no marker", async () => {
    // Covers a night from before the marker existed, or one whose marker was
    // lost to a storage failure.
    const { fileStore, now } = await deps();
    await saveRunIndex([openRun()]);
    await fileStore.writeText(
      "document",
      logPathFor("run-1"),
      '{"type":"run.start","at":1000,"scriptName":"MILD"}\n' +
        '{"type":"play","at":2500,"signal":"chime","gain":1,"rate":1,"wait":false}\n',
    );

    await recoverInterruptedRuns({ fileStore, now });

    const stored = (await loadRunIndex())[0];
    expect(stored.endedAt).toBe(2_500);
  });

  it("falls back to the start time when nothing else is known", async () => {
    const { fileStore, now } = await deps();
    await saveRunIndex([openRun()]);

    await recoverInterruptedRuns({ fileStore, now });

    const stored = (await loadRunIndex())[0];
    expect(stored.endedAt).toBe(1_000);
    expect(stored.reason).toBe("interrupted");
  });

  it("survives a truncated final line", async () => {
    const { fileStore, now } = await deps();
    await saveRunIndex([openRun()]);
    await fileStore.writeText(
      "document",
      logPathFor("run-1"),
      '{"type":"play","at":2500,"signal":"chime","gain":1,"rate":1,"wait":false}\n' +
        '{"type":"play","at":37',
    );

    await expect(
      recoverInterruptedRuns({ fileStore, now }),
    ).resolves.toBeDefined();
    expect((await loadRunIndex())[0].endedAt).toBe(2_500);
  });

  it("never reports an end before the start", async () => {
    const { fileStore, now } = await deps();
    await saveRunIndex([openRun({ startedAt: 9_000 })]);
    await writeOpenRun({
      id: "run-1",
      name: "n",
      startedAt: 9_000,
      lastSeenAt: 1,
      eventCount: 0,
    });

    await recoverInterruptedRuns({ fileStore, now });

    expect((await loadRunIndex())[0].endedAt).toBe(9_000);
  });

  it("closes every open run, not only the one the marker names", async () => {
    const { fileStore, now } = await deps();
    await saveRunIndex([
      openRun({ id: "run-old", startedAt: 100 }),
      openRun({ id: "run-1", startedAt: 1_000 }),
    ]);
    await writeOpenRun({
      id: "run-1",
      name: "n",
      startedAt: 1_000,
      lastSeenAt: 4_000,
      eventCount: 1,
    });

    const result = await recoverInterruptedRuns({ fileStore, now });

    expect(result.interrupted).toHaveLength(2);
    const stored = await loadRunIndex();
    expect(stored.every((run) => run.reason === "interrupted")).toBe(true);
  });

  it("deletes a temporary recording an interrupted night left behind", async () => {
    const { fileStore, now } = await deps();
    const deleteRecording = jest.fn(async () => {});
    await saveRunIndex([openRun()]);
    await writeOpenRun({
      id: "run-1",
      name: "n",
      startedAt: 1_000,
      lastSeenAt: 4_000,
      eventCount: 1,
      recordingUri: "file:///cache/voice.m4a",
    });

    await recoverInterruptedRuns({ fileStore, now, deleteRecording });

    expect(deleteRecording).toHaveBeenCalledWith("file:///cache/voice.m4a");
  });

  it("clears the marker even when recovery cannot finish", async () => {
    // Otherwise every future launch retries the same broken recovery.
    const { fileStore, now } = await deps();
    await writeOpenRun({
      id: "run-1",
      name: "n",
      startedAt: 1_000,
      lastSeenAt: 4_000,
      eventCount: 1,
    });
    jest
      .spyOn(fileStore, "appendText")
      .mockRejectedValue(new Error("disk full"));
    await saveRunIndex([openRun()]);

    await recoverInterruptedRuns({ fileStore, now });

    expect(await readOpenRun()).toBeNull();
  });

  it("ignores a corrupt marker rather than failing the launch", async () => {
    const { fileStore, now } = await deps();
    await AsyncStorage.setItem("luciddream.openRun.v1", "{not json");

    await expect(recoverInterruptedRuns({ fileStore, now })).resolves.toEqual({
      interrupted: [],
    });
  });

  it("round-trips and clears the marker", async () => {
    await writeOpenRun({
      id: "run-1",
      name: "n",
      startedAt: 1,
      lastSeenAt: 2,
      eventCount: 0,
    });
    expect(await readOpenRun()).toMatchObject({ id: "run-1" });

    await clearOpenRun();
    expect(await readOpenRun()).toBeNull();
  });
});
