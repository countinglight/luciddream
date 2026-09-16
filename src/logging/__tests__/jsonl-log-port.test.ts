import { InMemoryFileStore } from "@/storage/testing/in-memory-file-store";

import { JsonlLogPort, logPathFor } from "../jsonl-log-port";

describe("JsonlLogPort", () => {
  it("writes one JSON line per event, in order", async () => {
    const store = new InMemoryFileStore();
    const port = new JsonlLogPort("run-1", store);

    port.log({ type: "run.start", at: 0, scriptName: "Test" });
    port.log({
      type: "play",
      at: 10,
      signal: "chime",
      gain: 1,
      rate: 1,
      wait: false,
    });
    port.log({ type: "run.stop", at: 20, reason: "completed" });

    await port.drain();

    const content = await store.readText("document", logPathFor("run-1"));
    const lines = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: "run.start", at: 0, scriptName: "Test" },
      { type: "play", at: 10, signal: "chime", gain: 1, rate: 1, wait: false },
      { type: "run.stop", at: 20, reason: "completed" },
    ]);
  });

  it("appends instead of rewriting, so an existing log is never replaced", async () => {
    // Recovery records are appended to a log a previous process wrote; a
    // rewriting port would have destroyed the night it was recording.
    const store = new InMemoryFileStore();
    await store.writeText(
      "document",
      logPathFor("run-1"),
      '{"type":"run.start","at":0,"scriptName":"Earlier"}\n',
    );

    const port = new JsonlLogPort("run-1", store);
    port.log({ type: "run.stop", at: 99, reason: "completed" });
    await port.drain();

    const lines = (await store.readText("document", logPathFor("run-1")))
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).scriptName).toBe("Earlier");
    expect(JSON.parse(lines[1]).at).toBe(99);
  });

  it("writes a burst of events as one append, still in order", async () => {
    const store = new InMemoryFileStore();
    const appendText = jest.spyOn(store, "appendText");
    const port = new JsonlLogPort("run-burst", store);

    for (let i = 0; i < 50; i += 1) {
      port.log({ type: "log", at: i, message: `event ${i}` });
    }
    await port.drain();

    const lines = (await store.readText("document", logPathFor("run-burst")))
      .trim()
      .split("\n");
    expect(lines).toHaveLength(50);
    expect(JSON.parse(lines[0]).at).toBe(0);
    expect(JSON.parse(lines[49]).at).toBe(49);
    // Batched: nowhere near one append per event.
    expect(appendText.mock.calls.length).toBeLessThan(50);
  });

  it("never throws even if the underlying file store rejects", async () => {
    const store = new InMemoryFileStore();
    jest.spyOn(store, "appendText").mockRejectedValue(new Error("disk full"));
    const port = new JsonlLogPort("run-1", store);

    expect(() =>
      port.log({ type: "run.start", at: 0, scriptName: "Test" }),
    ).not.toThrow();
    await expect(port.drain()).resolves.toBeUndefined();
  });

  it("counts lost records rather than reporting a complete night", async () => {
    const store = new InMemoryFileStore();
    jest.spyOn(store, "appendText").mockRejectedValue(new Error("disk full"));
    const port = new JsonlLogPort("run-1", store);

    port.log({ type: "run.start", at: 0, scriptName: "Test" });
    await port.drain();

    expect(port.writeFailures).toBe(1);
  });

  it("keeps recording after a transient write failure", async () => {
    const store = new InMemoryFileStore();
    const append = jest.spyOn(store, "appendText");
    append.mockRejectedValueOnce(new Error("transient"));

    const port = new JsonlLogPort("run-1", store);
    port.log({ type: "run.start", at: 0, scriptName: "Test" });
    await port.drain();

    port.log({ type: "run.stop", at: 1, reason: "completed" });
    await port.drain();

    expect(port.writeFailures).toBe(1);
    const content = await store.readText("document", logPathFor("run-1"));
    expect(content.trim().split("\n")).toHaveLength(1);
  });

  it("drain resolves when every queued write has settled", async () => {
    const store = new InMemoryFileStore();
    const port = new JsonlLogPort("run-3", store);

    port.log({ type: "run.start", at: 0, scriptName: "Test" });
    port.log({ type: "run.stop", at: 5, reason: "completed" });
    await port.drain();

    const content = await store.readText("document", logPathFor("run-3"));
    expect(content.trim().split("\n")).toHaveLength(2);
  });
});
