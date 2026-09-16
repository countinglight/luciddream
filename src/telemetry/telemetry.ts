import type { EngineEvent } from "@/engine";

import { clearLastFatal, readLastFatal, writeLastFatal } from "./open-run";
import { redactMessage } from "./redact";
import { Outbox, type Transport } from "./outbox";
import { RunTracker } from "./run-tracker";
import {
  TELEMETRY_SCHEMA_VERSION,
  truncate,
  type AppInfo,
  type DeviceInfo,
  type KeyValueStore,
  type RunEndReason,
  type RunInfo,
  type RunPhaseInfo,
  type TelemetryEvent,
  type TelemetryEventType,
} from "./types";

const INSTALL_ID_KEY = "luciddream.telemetry.installId.v1";

/** A night the session layer found abandoned at launch. Diagnostics report
 * it; they no longer detect it (AR-04). */
export type RecoveredRunInfo = {
  id: string;
  startedAt: number;
  endedAt: number;
  eventCount?: number;
};

export type TelemetryDeps = {
  store: KeyValueStore;
  /** Null when the build carries no endpoint: everything becomes a no-op. */
  transport: Transport | null;
  readDevice: () => DeviceInfo;
  readApp: () => AppInfo;
  now: () => number;
  newId: () => string;
};

export type TelemetryPreferences = { enabled: boolean; testerLabel: string };

export function randomId(now: number = Date.now()): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `${now.toString(36)}-${random()}${random()}`;
}

function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : "Unknown error";
  // Redacted, not merely truncated: a path or URL is usually at the front of
  // an error string, so truncation would have preserved exactly the part that
  // must not leave the device (AR-16).
  return redactMessage(message);
}

/**
 * Opt-in beta diagnostics (doc/plans/luciddream-telemetry.md). Reports
 * when a night started, how it ended and on what device — enough to answer
 * the field-evidence questions without asking testers. Every method is
 * fire-and-forget and swallows its own failures: diagnostics must never
 * disturb a run.
 */
export class Telemetry {
  private enabled = false;
  private testerLabel = "";
  private tracker: RunTracker | null = null;
  private installIdPromise: Promise<string> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly outbox: Outbox | null;

  constructor(private readonly deps: TelemetryDeps) {
    this.outbox = deps.transport
      ? new Outbox(deps.store, deps.transport)
      : null;
  }

  /** This build can send diagnostics at all. */
  get available(): boolean {
    return this.outbox !== null;
  }

  /** Available and switched on by the user. */
  get active(): boolean {
    return this.available && this.enabled;
  }

  configure(preferences: TelemetryPreferences): void {
    const wasEnabled = this.enabled;
    this.enabled = preferences.enabled;
    this.testerLabel = truncate(preferences.testerLabel.trim());
    if (wasEnabled && !this.enabled) {
      // Turning it off also withdraws anything not yet sent.
      this.tracker = null;
      const outbox = this.outbox;
      this.serial(async () => {
        await outbox?.clear();
        await clearLastFatal(this.deps.store);
      });
    }
  }

  installId(): Promise<string> {
    if (!this.installIdPromise) {
      this.installIdPromise = (async () => {
        try {
          const existing = await this.deps.store.getItem(INSTALL_ID_KEY);
          if (existing) return existing;
        } catch {
          // Fall through to a fresh id.
        }
        const id = this.deps.newId();
        try {
          await this.deps.store.setItem(INSTALL_ID_KEY, id);
        } catch {
          // An unsaved id only means the next launch reports a new one.
        }
        return id;
      })();
    }
    return this.installIdPromise;
  }

  /** Resolves when every queued storage and delivery task has settled. */
  idle(): Promise<void> {
    return this.chain;
  }

  /**
   * Call once per app launch, with the runs the session layer closed as
   * interrupted (src/session/run-recovery.ts).
   *
   * Diagnostics used to keep a second open-run marker of their own and detect
   * this themselves, which meant a user without diagnostics saw nothing and
   * both layers wrote a marker every minute. Detection is now always-on and
   * lives with the run record; this reports it.
   */
  recoverAfterLaunch(interrupted: RecoveredRunInfo[] = []): Promise<void> {
    return this.serial(async () => {
      const { store } = this.deps;
      const fatal = await readLastFatal(store);
      await clearLastFatal(store);
      if (!this.active) return;

      if (fatal) {
        await this.enqueue(
          await this.event("app.crash", {
            at: fatal.at,
            error: { message: redactMessage(fatal.message), fatal: true },
          }),
        );
      }

      for (const recovered of interrupted) {
        // A fatal JavaScript error recorded during this run means it crashed
        // rather than simply vanished.
        const crashed = fatal !== null && fatal.at >= recovered.startedAt;
        const run: RunInfo = {
          id: recovered.id,
          startedAt: recovered.startedAt,
          endedAt: recovered.endedAt,
          lastSeenAt: recovered.endedAt,
          durationMs: Math.max(0, recovered.endedAt - recovered.startedAt),
          endReason: crashed ? "crashed" : "interrupted",
          ...(recovered.eventCount !== undefined
            ? { eventCount: recovered.eventCount }
            : {}),
          ...(crashed ? { errorMessage: redactMessage(fatal.message) } : {}),
        };
        await this.enqueue(
          await this.event("run.end", { at: recovered.endedAt, run }),
        );
      }
      await this.deliver();
    });
  }

  runStarted(run: {
    id: string;
    startedAt: number;
    phases: RunPhaseInfo[];
  }): void {
    if (!this.active) {
      this.tracker = null;
      return;
    }
    const tracker = new RunTracker(
      run.id,
      run.startedAt,
      run.phases.map((phase) => ({
        label: truncate(phase.label),
        script: truncate(phase.script),
      })),
    );
    this.tracker = tracker;
    const info = tracker.snapshot(run.startedAt);
    this.serial(async () => {
      await this.enqueue(
        await this.event("run.start", { at: run.startedAt, run: info }),
      );
      await this.deliver();
    });
  }

  observe(event: EngineEvent): void {
    this.tracker?.observe(event);
  }

  /** Kept so callers need not know that the open-run marker moved; the
   * session layer refreshes it now. */
  heartbeat(): void {}

  runEnded(endedAt: number, reason: RunEndReason): void {
    const tracker = this.tracker;
    if (!tracker) return;
    this.tracker = null;
    const info = tracker.ended(endedAt, reason);
    this.serial(async () => {
      await this.enqueue(
        await this.event("run.end", { at: endedAt, run: info }),
      );
      await this.deliver();
    });
  }

  /** For the global JS error handler. Only fatal errors are kept, and only as
   * a single record read back on the next launch — the process may be gone
   * before any network request could finish. */
  recordJsError(error: unknown, isFatal: boolean): void {
    if (!this.active || !isFatal) return;
    void writeLastFatal(this.deps.store, {
      message: errorMessage(error),
      at: this.deps.now(),
      ...(this.tracker ? { runId: this.tracker.runId } : {}),
    });
  }

  /** Tries to send whatever is queued. */
  flush(): Promise<void> {
    return this.serial(() => this.deliver());
  }

  private async deliver(): Promise<void> {
    if (!this.active || !this.outbox) return;
    try {
      await this.outbox.flush();
    } catch {
      // Retried on the next flush.
    }
  }

  private async enqueue(event: TelemetryEvent): Promise<void> {
    try {
      await this.outbox?.enqueue(event);
    } catch {
      // Dropped; diagnostics are best effort.
    }
  }

  private async event(
    type: TelemetryEventType,
    extra: { at: number; run?: RunInfo; error?: TelemetryEvent["error"] },
  ): Promise<TelemetryEvent> {
    return {
      v: TELEMETRY_SCHEMA_VERSION,
      id: this.deps.newId(),
      type,
      at: extra.at,
      installId: await this.installId(),
      ...(this.testerLabel ? { testerLabel: this.testerLabel } : {}),
      device: this.deps.readDevice(),
      app: this.deps.readApp(),
      ...(extra.run ? { run: extra.run } : {}),
      ...(extra.error ? { error: extra.error } : {}),
    };
  }

  private serial(task: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(task).catch(() => {});
    return this.chain;
  }
}
