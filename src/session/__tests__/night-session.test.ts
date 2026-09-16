import type { EngineEvent, LogPort } from "@/engine";
import { InMemoryFileStore } from "@/storage/testing/in-memory-file-store";

import {
  NightSession,
  type NightSessionDeps,
  type RunRecordEnd,
} from "../night-session";
import {
  RunPreparationError,
  type NightPlan,
  type PreparedRun,
} from "../prepare";
import type { SessionController, StartSessionOptions } from "../session";

const PLAN: NightPlan = {
  phases: [
    { index: 0, label: "Pre-sleep Training", script: null },
    { index: 1, label: "Early Sleep", script: null },
    { index: 2, label: "Wake Up", script: null },
  ],
  masterVolume: 0.5,
  signals: [],
  durationPresets: { short: 1, medium: 2, long: 3 },
};

const OPTIONS = { audioFocus: "duck" as const, voiceInterrupt: false };

/** Lets the service's queued async work (log drain, index write) settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const PREPARED: PreparedRun = {
  name: "Early Sleep: Test",
  phases: [
    {
      index: 1,
      label: "Early Sleep",
      script: { name: "Test", version: 1, volume: 0.5, body: [] },
    },
  ],
  sourceMap: {},
};

/** A startSession stand-in that hands the test the run's LogPort, so it can
 * drive the night's lifecycle events itself. */
function makeFakeSession() {
  let log: LogPort | null = null;
  let resolveDone: (() => void) | null = null;
  const stop = jest.fn();
  let teardownResolved = false;

  const startSession = jest.fn(
    async (options: StartSessionOptions): Promise<SessionController> => {
      log = options.log;
      const done = new Promise<void>((resolve) => {
        resolveDone = () => {
          teardownResolved = true;
          resolve();
        };
      });
      return {
        stop,
        handleVoiceInterrupt: jest.fn(),
        done,
      };
    },
  );

  return {
    startSession,
    stop,
    emit(event: EngineEvent) {
      log?.log(event);
    },
    /** Ends the run the way the sequence does, then finishes teardown. */
    endRun(reason: "completed" | "stopped" | "error", at = 1_000) {
      log?.log({ type: "run.stop", at, reason });
    },
    finishTeardown() {
      resolveDone?.();
    },
    get teardownResolved() {
      return teardownResolved;
    },
  };
}

function makeSession(overrides: Partial<NightSessionDeps> = {}) {
  const fake = makeFakeSession();
  const recordEnd = jest.fn<Promise<void>, [RunRecordEnd]>(async () => {});
  const recordStart = jest.fn(async () => {});
  const logged: EngineEvent[] = [];
  let runIdCounter = 0;

  const deps: NightSessionDeps = {
    fileStore: new InMemoryFileStore(),
    context: { snapshot: async () => ({ at: 0 }) },
    startSession: fake.startSession,
    createLog: () => ({ log: (event) => logged.push(event) }),
    recordStart,
    recordEnd,
    prepare: async () => PREPARED,
    now: () => 1_000,
    newRunId: () => `run-${++runIdCounter}`,
    ...overrides,
  };

  return {
    session: new NightSession(deps),
    fake,
    recordStart,
    recordEnd,
    logged,
  };
}

describe("NightSession", () => {
  it("runs a night to completion and closes its record", async () => {
    const { session, fake, recordStart, recordEnd } = makeSession();

    await session.start(PLAN, OPTIONS);
    expect(session.getSnapshot().status).toBe("running");
    expect(recordStart).toHaveBeenCalledTimes(1);

    fake.endRun("completed", 5_000);

    const snapshot = session.getSnapshot();
    expect(snapshot.status).toBe("completed");
    expect(snapshot.endedAt).toBe(5_000);

    // The record is closed only after the durable log has drained.
    await settle();
    expect(recordEnd).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "completed", endedAt: 5_000 }),
    );
  });

  it("starts only one night when Begin is tapped twice", async () => {
    const prepare = jest.fn(async () => PREPARED);
    const { session, fake } = makeSession({ prepare });

    // Both calls happen before either has awaited anything.
    const first = session.start(PLAN, OPTIONS);
    const second = session.start(PLAN, OPTIONS);
    await Promise.all([first, second]);

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(fake.startSession).toHaveBeenCalledTimes(1);
  });

  it("honours Stop while the night is still being prepared", async () => {
    // A holder, because TypeScript cannot see a closure assignment across an
    // await and would narrow a plain `let` to never.
    const control: { release: (() => void) | null } = { release: null };
    const prepare = jest.fn(
      (_plan: NightPlan, _store: unknown, signal: AbortSignal) =>
        new Promise<PreparedRun>((resolve, reject) => {
          control.release = () => {
            // Rejects with a plain Error, not RunCancelledError, so this also
            // covers preparation that fails *because* it was aborted.
            if (signal.aborted) reject(new Error("aborted"));
            else resolve(PREPARED);
          };
        }),
    );
    const { session, fake } = makeSession({ prepare: prepare as never });

    const started = session.start(PLAN, OPTIONS);
    expect(session.getSnapshot().status).toBe("preparing");
    // Preparation begins after an await, so let it actually start before
    // stopping it.
    await settle();

    session.stop();
    control.release?.();
    await started;

    expect(session.getSnapshot().status).toBe("stopped");
    expect(fake.startSession).not.toHaveBeenCalled();
  });

  it("stops a running night", async () => {
    const { session, fake } = makeSession();
    await session.start(PLAN, OPTIONS);

    session.stop();
    expect(session.getSnapshot().status).toBe("stopping");
    expect(fake.stop).toHaveBeenCalledTimes(1);

    fake.endRun("stopped", 7_000);
    expect(session.getSnapshot().status).toBe("stopped");
  });

  it("shows a failed start as an error the user can act on", async () => {
    const { session } = makeSession({
      prepare: async () => {
        throw new RunPreparationError(
          "Choose at least one script before starting.",
        );
      },
    });

    await session.start(PLAN, OPTIONS);

    const snapshot = session.getSnapshot();
    expect(snapshot.status).toBe("error");
    expect(snapshot.errorMessage).toBe(
      "Choose at least one script before starting.",
    );
  });

  it("never carries the previous night's identity into a failed start", async () => {
    // The old hook kept runId, startedAt and the cue list when a start failed
    // in preflight, so the error screen showed last night's cues and asked
    // the lucid question for the wrong night (AR-06).
    let shouldFail = false;
    const { session, fake } = makeSession({
      prepare: async () => {
        if (shouldFail) throw new RunPreparationError("Nothing to play.");
        return PREPARED;
      },
    });

    await session.start(PLAN, OPTIONS);
    fake.emit({
      type: "play",
      at: 10,
      signal: "chime",
      gain: 1,
      rate: 1,
      wait: false,
    });
    fake.endRun("completed", 20);
    fake.finishTeardown();

    const completed = session.getSnapshot();
    expect(completed.runId).toBe("run-1");
    expect(completed.playCount).toBe(1);

    shouldFail = true;
    await session.start(PLAN, OPTIONS);

    const failed = session.getSnapshot();
    expect(failed.status).toBe("error");
    expect(failed.runId).toBeNull();
    expect(failed.startedAt).toBeNull();
    expect(failed.playCount).toBe(0);
    expect(failed.recentEvents).toEqual([]);
  });

  it("waits for the previous night's teardown before starting the next", async () => {
    const { session, fake } = makeSession();

    await session.start(PLAN, OPTIONS);
    fake.endRun("completed", 20);
    expect(session.getSnapshot().status).toBe("completed");

    // Teardown has not finished, so the next night must not acquire anything.
    const second = session.start(PLAN, OPTIONS);
    await Promise.resolve();
    expect(fake.startSession).toHaveBeenCalledTimes(1);

    fake.finishTeardown();
    await second;
    expect(fake.startSession).toHaveBeenCalledTimes(2);
  });

  it("tracks cues and phases for the morning report", async () => {
    const { session, fake } = makeSession();
    await session.start(PLAN, OPTIONS);

    fake.emit({
      type: "phase.start",
      at: 1,
      phaseIndex: 1,
      phase: "Early Sleep",
      scriptName: "Test",
    });
    fake.emit({
      type: "play",
      at: 2,
      signal: "chime",
      gain: 1,
      rate: 1,
      wait: false,
    });
    fake.emit({
      type: "play",
      at: 3,
      signal: "chime",
      gain: 1,
      rate: 1,
      wait: false,
    });

    const snapshot = session.getSnapshot();
    expect(snapshot.playCount).toBe(2);
    expect(snapshot.activePhaseIndex).toBe(1);
    expect(snapshot.activePhaseLabel).toBe("Early Sleep");
    expect(snapshot.phaseStartedAt).toBe(1);
  });

  it("writes every event to the durable log, including ones the UI filters", async () => {
    const { session, fake, logged } = makeSession();
    await session.start(PLAN, OPTIONS);

    fake.emit({ type: "error", at: 2, message: "decode failed" });
    fake.endRun("error", 3);

    expect(logged.map((event) => event.type)).toEqual(["error", "run.stop"]);
  });

  it("keeps running when the diagnostics observer throws", async () => {
    const observer = {
      runStarted: () => {
        throw new Error("diagnostics exploded");
      },
      observe: () => {
        throw new Error("diagnostics exploded");
      },
      runEnded: () => {
        throw new Error("diagnostics exploded");
      },
    };
    const { session, fake } = makeSession({ observer });

    await session.start(PLAN, OPTIONS);
    expect(session.getSnapshot().status).toBe("running");

    fake.emit({
      type: "play",
      at: 2,
      signal: "chime",
      gain: 1,
      rate: 1,
      wait: false,
    });
    fake.endRun("completed", 3);

    expect(session.getSnapshot().status).toBe("completed");
  });

  it("records a session-level note against the running night", async () => {
    const { session, fake, logged } = makeSession();
    await session.start(PLAN, OPTIONS);

    session.note("Voice interrupt is not listening.");
    fake.endRun("completed", 5);

    expect(logged[0]).toMatchObject({
      type: "error",
      message: "Voice interrupt is not listening.",
    });
  });

  it("ignores a note when no night is running", async () => {
    const { session } = makeSession();
    expect(() => session.note("nothing to attach this to")).not.toThrow();
  });

  it("tracks the temporary recording a night owns", async () => {
    const markOpenRun = jest.fn();
    const { session } = makeSession({ markOpenRun });
    await session.start(PLAN, OPTIONS);

    session.setOwnedRecording("file:///cache/voice.m4a");

    expect(markOpenRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ recordingUri: "file:///cache/voice.m4a" }),
    );
  });

  it("clears the open-run marker when a night ends cleanly", async () => {
    const clearOpenRun = jest.fn();
    const { session, fake } = makeSession({ clearOpenRun });
    await session.start(PLAN, OPTIONS);

    fake.endRun("completed", 5);

    expect(clearOpenRun).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const { session, fake } = makeSession();
    const listener = jest.fn();
    const unsubscribe = session.subscribe(listener);

    await session.start(PLAN, OPTIONS);
    const afterStart = listener.mock.calls.length;
    expect(afterStart).toBeGreaterThan(0);

    unsubscribe();
    fake.emit({
      type: "play",
      at: 2,
      signal: "chime",
      gain: 1,
      rate: 1,
      wait: false,
    });
    expect(listener).toHaveBeenCalledTimes(afterStart);
  });
});
