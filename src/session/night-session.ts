import type { ContextPort, EngineEvent, LogPort } from "@/engine";
import type { FileStorePort } from "@/storage/file-store";

import {
  prepareRun,
  RunCancelledError,
  type NightPlan,
  type PreparedRun,
} from "./prepare";
import type { SessionController, StartSessionOptions } from "./session";

export type NightSessionStatus =
  | "idle"
  | "preparing"
  | "running"
  | "stopping"
  | "completed"
  | "stopped"
  | "error";

/** Everything the UI renders about a night. Deliberately free of anything
 * that changes every second: elapsed time is derived from `startedAt` by the
 * screen that shows it, so the service does not drive an all-night ticker
 * (architectural review AR-24). */
export type NightSessionSnapshot = {
  status: NightSessionStatus;
  runId: string | null;
  runName: string | null;
  startedAt: number | null;
  endedAt: number | null;
  phaseStartedAt: number | null;
  activePhaseIndex: number | null;
  activePhaseLabel: string | null;
  activeScriptName: string | null;
  playCount: number;
  eventCount: number;
  lastEvent: EngineEvent | null;
  recentEvents: EngineEvent[];
  errorMessage: string | null;
};

export const IDLE_SNAPSHOT: NightSessionSnapshot = {
  status: "idle",
  runId: null,
  runName: null,
  startedAt: null,
  endedAt: null,
  phaseStartedAt: null,
  activePhaseIndex: null,
  activePhaseLabel: null,
  activeScriptName: null,
  playCount: 0,
  eventCount: 0,
  lastEvent: null,
  recentEvents: [],
  errorMessage: null,
};

const MAX_RECENT_EVENTS = 6;

export type NightRuntimeOptions = {
  audioFocus: "duck" | "exclusive";
  voiceInterrupt: boolean;
};

export type RunRecordStart = {
  id: string;
  name: string;
  startedAt: number;
  prepared: PreparedRun;
};

export type RunRecordEnd = {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  reason: "completed" | "stopped" | "error";
  eventCount: number;
};

/** Optional side-observer of a night — diagnostics today. Kept optional and
 * failure-tolerant: nothing here may disturb a run. */
export type NightSessionObserver = {
  runStarted(run: {
    id: string;
    startedAt: number;
    phases: { label: string; script: string }[];
  }): void;
  observe(event: EngineEvent): void;
  runEnded(endedAt: number, reason: "completed" | "stopped" | "error"): void;
};

export type NightSessionDeps = {
  fileStore: FileStorePort;
  /** Live context readings. Long-lived and mutable from Settings, including
   * mid-run (spec §4.3), so it belongs to the service rather than to one
   * night's plan. */
  context: ContextPort;
  startSession: (options: StartSessionOptions) => Promise<SessionController>;
  /** The run's durable sink. Composed by the caller so filtering and
   * fan-out policy stay out of the lifecycle. A sink that can `drain` lets
   * the night's record be closed only once its log has settled. */
  createLog: (runId: string) => LogPort & { drain?: () => Promise<void> };
  /** Injectable so lifecycle tests can drive preparation — including making
   * it hang, so Stop-during-preparation is testable. Defaults to the real
   * prepareRun. */
  prepare?: (
    plan: NightPlan,
    fileStore: FileStorePort,
    signal: AbortSignal,
  ) => Promise<PreparedRun>;
  recordStart: (run: RunRecordStart) => Promise<void>;
  recordEnd: (run: RunRecordEnd) => Promise<void>;
  observer?: NightSessionObserver;
  now: () => number;
  newRunId: () => string;
};

/**
 * Owns one night, start to finish, with no dependency on React.
 *
 * The lifecycle used to live in `useSession`, which meant an OS relaunch or
 * any code running before the UI mounted had no entry point to it, the most
 * failure-prone code in the app had no tests, and two defects fell straight
 * out of the hook's shape: Stop during preparation did nothing (the
 * controller existed only after `startSession` resolved), and a start that
 * failed in preflight left the previous night's run id, start time and cue
 * list on screen (architectural review AR-06 / A7).
 *
 * The state machine is explicit — idle, preparing, running, stopping, and the
 * three terminal states — and every transition publishes an immutable
 * snapshot to subscribers.
 */
export class NightSession {
  private snapshot: NightSessionSnapshot = IDLE_SNAPSHOT;
  private listeners = new Set<() => void>();
  private controller: SessionController | null = null;
  private abort: AbortController | null = null;
  /** Resolves when the previous night's resources are fully released. A new
   * night waits on it, so a restart can never race the old run's teardown
   * over the shared wake lock, keep-alive track and notification. */
  private teardown: Promise<void> = Promise.resolve();
  private eventCount = 0;
  private durable: (LogPort & { drain?: () => Promise<void> }) | null = null;
  /** Guards against a late event from an abandoned run rewriting the
   * snapshot of the one after it. */
  private generation = 0;

  constructor(private readonly deps: NightSessionDeps) {}

  getSnapshot(): NightSessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** True while a night owns resources — preparing, running or stopping. */
  get isBusy(): boolean {
    const { status } = this.snapshot;
    return (
      status === "preparing" || status === "running" || status === "stopping"
    );
  }

  /**
   * Begins a night. The busy check and the move to `preparing` both happen
   * synchronously, before the first await, so two taps on Begin cannot start
   * two nights — the hook's old `sessionRef` guard was only populated after
   * startup finished and so guarded nothing during preparation.
   */
  start(plan: NightPlan, options: NightRuntimeOptions): Promise<void> {
    if (this.isBusy) return Promise.resolve();

    const generation = ++this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.eventCount = 0;
    // A fresh night starts from nothing, so a failure during preparation can
    // never leave the previous night's id, cues or lucid question on screen.
    this.publish({ ...IDLE_SNAPSHOT, status: "preparing" });

    return this.execute(plan, options, abort, generation);
  }

  private async execute(
    plan: NightPlan,
    options: NightRuntimeOptions,
    abort: AbortController,
    generation: number,
  ): Promise<void> {
    let terminal: {
      at: number;
      reason: "completed" | "stopped" | "error";
    } | null = null;
    try {
      await this.teardown;
      const prepare = this.deps.prepare ?? prepareRun;
      const prepared = await prepare(plan, this.deps.fileStore, abort.signal);
      if (abort.signal.aborted) throw new RunCancelledError();

      const id = this.deps.newRunId();
      const startedAt = this.deps.now();
      this.publish({
        ...this.snapshot,
        runId: id,
        runName: prepared.name,
        startedAt,
      });

      await this.deps.recordStart({
        id,
        name: prepared.name,
        startedAt,
        prepared,
      });
      this.notifyObserver(() =>
        this.deps.observer?.runStarted({
          id,
          startedAt,
          phases: prepared.phases.map((phase) => ({
            label: phase.label,
            script: phase.script.name,
          })),
        }),
      );

      const durable = this.deps.createLog(id);
      this.durable = durable;
      const log: LogPort = {
        log: (event) => {
          durable.log(event);
          this.notifyObserver(() => this.deps.observer?.observe(event));
          this.eventCount += 1;
          if (generation !== this.generation) return;
          if (event.type === "run.stop") {
            terminal = { at: event.at, reason: event.reason };
            this.finish(id, prepared.name, startedAt, event.at, event.reason);
            return;
          }
          this.apply(event);
        },
      };

      const session = await this.deps.startSession({
        name: prepared.name,
        phases: prepared.phases,
        sourceMap: prepared.sourceMap,
        context: this.deps.context,
        log,
        audioFocus: options.audioFocus,
        voiceInterrupt: options.voiceInterrupt,
      });

      this.controller = session;
      // `done` resolves only once teardown has finished, so the next night
      // cannot begin while this one still holds the wake lock.
      this.teardown = session.done.catch(() => {});

      // The run can already have finished, or Stop can have arrived, while
      // startSession was still resolving.
      if (terminal !== null) return;
      if (abort.signal.aborted) {
        this.publish({ ...this.snapshot, status: "stopping" });
        session.stop();
        return;
      }
      if (generation === this.generation) {
        this.publish({ ...this.snapshot, status: "running" });
      }
    } catch (error) {
      if (generation !== this.generation || terminal !== null) return;
      // Anything that failed while the night was being cancelled reads as
      // stopped, not as an error the user is asked to act on — an aborted
      // download rejects with its own error, not RunCancelledError.
      if (abort.signal.aborted || error instanceof RunCancelledError) {
        this.publish({
          ...this.snapshot,
          status: "stopped",
          endedAt: this.deps.now(),
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.publish({
        ...this.snapshot,
        status: "error",
        errorMessage: message,
        endedAt: this.deps.now(),
      });
    }
  }

  /** Stop is the one control a half-asleep user must be able to trust, so it
   * works in every non-terminal state, including while the night is still
   * being prepared. */
  stop(): void {
    const { status } = this.snapshot;
    if (status === "preparing") {
      this.abort?.abort();
      return;
    }
    if (status === "running") {
      this.publish({ ...this.snapshot, status: "stopping" });
      this.controller?.stop();
    }
  }

  handleVoiceInterrupt(event: "trigger" | "resume"): void {
    this.controller?.handleVoiceInterrupt(event);
  }

  private finish(
    id: string,
    name: string,
    startedAt: number,
    endedAt: number,
    reason: "completed" | "stopped" | "error",
  ): void {
    this.controller = null;
    this.abort = null;
    this.publish({
      ...this.snapshot,
      status:
        reason === "error"
          ? "error"
          : reason === "stopped"
            ? "stopped"
            : "completed",
      endedAt,
    });
    this.notifyObserver(() => this.deps.observer?.runEnded(endedAt, reason));

    // Close the index entry only after the log has settled, so Good morning
    // and export cannot read a prefix of a night that is still being written
    // (architectural review A5).
    const durable = this.durable;
    this.durable = null;
    void (async () => {
      try {
        await durable?.drain?.();
      } catch {
        // A drain failure is already counted by the log port.
      }
      await this.deps
        .recordEnd({
          id,
          name,
          startedAt,
          endedAt,
          reason,
          eventCount: this.eventCount,
        })
        .catch(() => {
          // The index write is best effort; the durable log is the record.
        });
    })();
  }

  private apply(event: EngineEvent): void {
    const next: NightSessionSnapshot = {
      ...this.snapshot,
      eventCount: this.eventCount,
      lastEvent: event,
      recentEvents: [...this.snapshot.recentEvents, event].slice(
        -MAX_RECENT_EVENTS,
      ),
    };
    if (event.type === "error") next.errorMessage = event.message;
    if (event.type === "play") next.playCount = this.snapshot.playCount + 1;
    if (event.type === "phase.start") {
      next.activePhaseIndex = event.phaseIndex;
      next.activePhaseLabel = event.phase;
      next.activeScriptName = event.scriptName;
      next.phaseStartedAt = event.at;
    }
    this.publish(next);
  }

  private notifyObserver(call: () => void): void {
    try {
      call();
    } catch {
      // Diagnostics must never disturb a night.
    }
  }

  private publish(next: NightSessionSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // One bad subscriber must not stop the others, or the night.
      }
    }
  }
}
