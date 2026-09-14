import type { DeliveryResult } from "../outbox";
import { MemoryStore } from "../testing/memory-store";
import { Telemetry, type TelemetryDeps } from "../telemetry";
import type { TelemetryEvent } from "../types";

const device = {
  platform: "ios",
  osVersion: "19.1",
  model: "iPhone 15",
  manufacturer: "Apple",
};
const app = {
  version: "0.5.1",
  build: "501012",
  updateId: null,
  channel: "testflight",
};

function setup(options: { transport?: boolean; result?: DeliveryResult } = {}) {
  const store = new MemoryStore();
  const sent: TelemetryEvent[][] = [];
  let clock = 1_000_000;
  let counter = 0;
  const deps: TelemetryDeps = {
    store,
    transport:
      options.transport === false
        ? null
        : async (events) => {
            sent.push(events);
            return options.result ?? "sent";
          },
    readDevice: () => device,
    readApp: () => app,
    now: () => clock,
    newId: () => `id-${++counter}`,
  };
  const telemetry = new Telemetry(deps);
  return {
    store,
    sent,
    telemetry,
    deps,
    advance: (ms: number) => {
      clock += ms;
    },
    at: () => clock,
  };
}

const phases = [{ label: "Early Sleep", script: "MILD cycles" }];

describe("Telemetry", () => {
  it("does nothing while disabled", async () => {
    const { telemetry, sent, store } = setup();
    telemetry.configure({ enabled: false, testerLabel: "" });
    telemetry.runStarted({ id: "run-1", startedAt: 1, phases });
    telemetry.runEnded(2, "completed");
    await telemetry.recoverAfterLaunch();
    await telemetry.idle();
    expect(sent).toEqual([]);
    expect(store.map.size).toBe(0);
  });

  it("does nothing when the build has no endpoint", async () => {
    const { telemetry, store } = setup({ transport: false });
    telemetry.configure({ enabled: true, testerLabel: "Tester" });
    expect(telemetry.available).toBe(false);
    telemetry.runStarted({ id: "run-1", startedAt: 1, phases });
    await telemetry.idle();
    expect(store.map.size).toBe(0);
  });

  it("reports the start and the end of a run with its counts", async () => {
    const { telemetry, sent, store, at, advance } = setup();
    telemetry.configure({ enabled: true, testerLabel: "  Tester 1 " });
    const startedAt = at();
    telemetry.runStarted({ id: "run-1", startedAt, phases });
    telemetry.observe({ type: "run.start", at: startedAt, scriptName: "x" });
    telemetry.observe({
      type: "play",
      at: startedAt + 10,
      signal: "chime",
      gain: 1,
      rate: 1,
      wait: false,
    });
    telemetry.observe({ type: "error", at: startedAt + 20, message: "boom" });
    advance(8 * 3_600_000);
    telemetry.observe({ type: "run.stop", at: at(), reason: "completed" });
    telemetry.runEnded(at(), "completed");
    await telemetry.idle();

    const events = sent.flat();
    expect(events.map((event) => event.type)).toEqual(["run.start", "run.end"]);
    expect(events[0]).toMatchObject({
      v: 1,
      installId: await telemetry.installId(),
      testerLabel: "Tester 1",
      device,
      app,
      run: { id: "run-1", startedAt, phases },
    });
    expect(events[1].run).toMatchObject({
      id: "run-1",
      durationMs: 8 * 3_600_000,
      endReason: "completed",
      playCount: 1,
      errorCount: 1,
      errorMessage: "boom",
      eventCount: 4,
    });
    expect(await store.getItem("luciddream.telemetry.openRun.v1")).toBeNull();
  });

  it("keeps the install id stable across instances", async () => {
    const first = setup();
    const id = await first.telemetry.installId();
    const second = new Telemetry({ ...first.deps, newId: () => "other" });
    expect(await second.installId()).toBe(id);
  });

  it("reports an unfinished run as interrupted on the next launch", async () => {
    const { telemetry, deps, sent, advance, at } = setup({ result: "retry" });
    telemetry.configure({ enabled: true, testerLabel: "" });
    const startedAt = at();
    telemetry.runStarted({ id: "run-1", startedAt, phases });
    advance(3 * 3_600_000);
    telemetry.heartbeat();
    await telemetry.idle();

    // The process dies here. A new process starts with the same storage.
    const next = new Telemetry({
      ...deps,
      transport: async (events) => (sent.push(events), "sent"),
    });
    next.configure({ enabled: true, testerLabel: "" });
    await next.recoverAfterLaunch();

    const end = sent.flat().find((event) => event.type === "run.end");
    expect(end?.run).toMatchObject({
      id: "run-1",
      endReason: "interrupted",
      endedAt: startedAt + 3 * 3_600_000,
      durationMs: 3 * 3_600_000,
    });
  });

  it("reports a recorded fatal error as a crash of the open run", async () => {
    const { telemetry, deps, sent, advance, at } = setup({ result: "retry" });
    telemetry.configure({ enabled: true, testerLabel: "" });
    telemetry.runStarted({ id: "run-1", startedAt: at(), phases });
    advance(1_000);
    telemetry.recordJsError(new TypeError("undefined is not a function"), true);
    await telemetry.idle();
    await new Promise((resolve) => setImmediate(resolve));

    const next = new Telemetry({
      ...deps,
      transport: async (events) => (sent.push(events), "sent"),
    });
    next.configure({ enabled: true, testerLabel: "" });
    await next.recoverAfterLaunch();

    const delivered = sent.flat().filter((event) => event.type !== "run.start");
    expect(delivered.map((event) => event.type)).toEqual([
      "app.crash",
      "run.end",
    ]);
    expect(delivered[0].error).toEqual({
      message: "TypeError: undefined is not a function",
      fatal: true,
    });
    expect(delivered[1].run?.endReason).toBe("crashed");
  });

  it("ignores non-fatal errors", async () => {
    const { telemetry, store } = setup();
    telemetry.configure({ enabled: true, testerLabel: "" });
    telemetry.recordJsError(new Error("minor"), false);
    await telemetry.idle();
    expect(await store.getItem("luciddream.telemetry.lastFatal.v1")).toBeNull();
  });

  it("withdraws unsent events when switched off", async () => {
    const { telemetry, store, at } = setup({ result: "retry" });
    telemetry.configure({ enabled: true, testerLabel: "" });
    telemetry.runStarted({ id: "run-1", startedAt: at(), phases });
    await telemetry.idle();
    expect(
      await store.getItem("luciddream.telemetry.outbox.v1"),
    ).not.toBeNull();

    telemetry.configure({ enabled: false, testerLabel: "" });
    await telemetry.idle();
    expect(await store.getItem("luciddream.telemetry.outbox.v1")).toBeNull();
    expect(await store.getItem("luciddream.telemetry.openRun.v1")).toBeNull();
  });
});
