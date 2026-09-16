import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadLucidNotes, saveLucidNote } from "@/lib/lucid-notes";
import { InMemoryFileStore } from "@/storage/testing/in-memory-file-store";

import { logPathFor } from "../jsonl-log-port";
import { loadRunIndex, saveRunIndex, type RunSummary } from "../run-index";
import { deleteAllRuns, deleteRun, sweepOrphanLogs } from "../run-store";

function run(id: string, startedAt = 1_000): RunSummary {
  return {
    id,
    scriptName: "Early Sleep: MILD Cycles",
    startedAt,
    endedAt: startedAt + 100,
    eventCount: 2,
    reason: "completed",
  };
}

async function seed(store: InMemoryFileStore, ids: string[]) {
  await saveRunIndex(ids.map((id, index) => run(id, 1_000 + index)));
  for (const id of ids) {
    await store.writeText(
      "document",
      logPathFor(id),
      '{"type":"run.start","at":1000,"scriptName":"MILD"}\n',
    );
  }
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("deleteRun", () => {
  it("removes the index entry, the lucid answer and the log file", async () => {
    const store = new InMemoryFileStore();
    await seed(store, ["run-1", "run-2"]);
    await saveLucidNote("run-1", "yes");

    await deleteRun("run-1", store);

    expect((await loadRunIndex()).map((r) => r.id)).toEqual(["run-2"]);
    expect(await loadLucidNotes()).not.toHaveProperty("run-1");
    expect(await store.exists("document", logPathFor("run-1"))).toBe(false);
    // The other night is untouched.
    expect(await store.exists("document", logPathFor("run-2"))).toBe(true);
  });

  it("still removes the night when its log cannot be deleted", async () => {
    const store = new InMemoryFileStore();
    await seed(store, ["run-1"]);
    jest.spyOn(store, "deleteFile").mockRejectedValue(new Error("locked"));

    await expect(deleteRun("run-1", store)).resolves.toBeUndefined();
    expect(await loadRunIndex()).toHaveLength(0);
  });
});

describe("deleteAllRuns", () => {
  it("removes every night, answer and log", async () => {
    const store = new InMemoryFileStore();
    await seed(store, ["run-1", "run-2"]);
    await saveLucidNote("run-2", "unsure");

    await deleteAllRuns(store);

    expect(await loadRunIndex()).toEqual([]);
    expect(await loadLucidNotes()).toEqual({});
    expect(await store.exists("document", logPathFor("run-1"))).toBe(false);
    expect(await store.exists("document", logPathFor("run-2"))).toBe(false);
  });

  it("removes orphaned logs too, not only indexed ones", async () => {
    const store = new InMemoryFileStore();
    await seed(store, ["run-1"]);
    await store.writeText("document", logPathFor("run-orphan"), "{}\n");

    await deleteAllRuns(store);

    expect(await store.listFiles("document", "logs")).toEqual([]);
  });
});

describe("sweepOrphanLogs", () => {
  it("deletes logs no night refers to", async () => {
    const store = new InMemoryFileStore();
    await seed(store, ["run-1"]);
    await store.writeText("document", logPathFor("run-orphan"), "{}\n");

    const removed = await sweepOrphanLogs(store);

    expect(removed).toBe(1);
    expect(await store.exists("document", logPathFor("run-1"))).toBe(true);
    expect(await store.exists("document", logPathFor("run-orphan"))).toBe(
      false,
    );
  });

  it("keeps the log of a night that is still in the index", async () => {
    // A run in progress writes its index entry the moment it starts, so the
    // launch sweep must never take its log out from under it.
    const store = new InMemoryFileStore();
    await saveRunIndex([{ ...run("run-live"), endedAt: undefined }]);
    await store.writeText("document", logPathFor("run-live"), "{}\n");

    expect(await sweepOrphanLogs(store)).toBe(0);
    expect(await store.exists("document", logPathFor("run-live"))).toBe(true);
  });

  it("deletes nothing when the index cannot be read", async () => {
    const store = new InMemoryFileStore();
    await store.writeText("document", logPathFor("run-1"), "{}\n");
    jest
      .spyOn(AsyncStorage, "getItem")
      .mockRejectedValue(new Error("storage unavailable"));

    expect(await sweepOrphanLogs(store)).toBe(0);
    expect(await store.exists("document", logPathFor("run-1"))).toBe(true);
  });

  it("ignores files that are not logs", async () => {
    const store = new InMemoryFileStore();
    await saveRunIndex([]);
    await store.writeText("document", "logs/notes.txt", "hello");

    expect(await sweepOrphanLogs(store)).toBe(0);
    expect(await store.exists("document", "logs/notes.txt")).toBe(true);
  });

  it("does nothing when there are no logs at all", async () => {
    const store = new InMemoryFileStore();
    await saveRunIndex([]);
    expect(await sweepOrphanLogs(store)).toBe(0);
  });
});
