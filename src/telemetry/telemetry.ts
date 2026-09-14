import type { EngineEvent } from "@/engine";

import {
  clearLastFatal,
  clearOpenRun,
  readLastFatal,
  readOpenRun,
  writeLastFatal,
  writeOpenRun,
} from "./open-run";
import { Outbox, type Transport } from "./outbox";
import { RunTracker } from "./run-tracker";
import {
  MAX_MESSAGE,
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
/** How often, at most, ordinary run events refresh the on-disk marker. */
const MARKER_REFRESH_MS = 60_000;

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
  return truncate(message, MAX_MESSAGE);
}

/**
 * Opt-in beta diagnostics (doc/plans/luciddream-beta-telemetry.md). Reports
 * when a night started, how it ended and on what device — enough to answer
 * the field-evidence questions without asking testers. Every method is
 * fire-and-forget and swallows its own failures: diagnostics must never
 * disturb a run.
 */
export class Telemetry {
  private enabled = false;
  private testerLabel = "";
  private tracker: RunTracker | null = null;
  private lastMarkerWrite = 0;
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
        await clearOpenRun(this.deps.store);
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

  /** Call once per app launch, after preferences are loaded. Reports a run the
   * previous process never finished, and a fatal error it recorded. */
  recoverAfterLaunch(): Promise<void> {
    return this.serial(async () => {
      const { store } = this.deps;
      const openRun = await readOpenRun(store);
      const fatal = await readLastFatal(store);
      await clearOpenRun(store);
      await clearLastFatal(store);
      if (!this.active) return;

      if (fatal) {
        await this.enqueue(
          await this.event("app.crash", {
            at: fatal.at,
            error: {
              message: truncate(fatal.message, MAX_MESSAGE),
              fatal: true,
            },
          }),
        );
      }
      if (openRun) {
        const crashed = fatal !== null && fatal.at >= openRun.startedAt;
        const endedAt = Math.max(
          openRun.lastSeenAt ?? openRun.startedAt,
          openRun.startedAt,
        );
        const run: RunInfo = {
          ...openRun,
          endedAt,
          durationMs: endedAt - openRun.startedAt,
          endReason: crashed ? "crashed" : "interrupted",
          ...(crashed
            ? { errorMessage: truncate(fatal.message, MAX_MESSAGE) }
            : {}),
        };
        await this.enqueue(await this.event("run.end", { at: endedAt, run }));
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
    this.lastMarkerWrite = this.deps.now();
    const info = tracker.snapshot(run.startedAt);
    this.serial(async () => {
      await writeOpenRun(this.deps.store, info);
      await this.enqueue(
        await this.event("run.start", { at: run.startedAt, run: info }),
      );
      await this.deliver();
    });
  }

  observe(event: EngineEvent): void {
    const tracker = this.tracker;
    if (!tracker) return;
    tracker.observe(event);
    if (event.type === "run.stop") return;
    const now = this.deps.now();
    if (now - this.lastMarkerWrite >= MARKER_REFRESH_MS)
      this.writeMarker(tracker, now);
  }

  /** Refreshes the marker during long silent waits, when no events arrive. */
  heartbeat(): void {
    if (this.tracker) this.writeMarker(this.tracker, this.deps.now());
  }

  runEnded(endedAt: number, reason: RunEndReason): void {
    const tracker = this.tracker;
    if (!tracker) return;
    this.tracker = null;
    const info = tracker.ended(endedAt, reason);
    this.serial(async () => {
      await this.enqueue(
        await this.event("run.end", { at: endedAt, run: info }),
      );
      await clearOpenRun(this.deps.store);
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

  private writeMarker(tracker: RunTracker, now: number): void {
    this.lastMarkerWrite = now;
    const info = tracker.snapshot(now);
    this.serial(async () => {
      // A run that ended while this write waited must not be resurrected.
      if (this.tracker === tracker) await writeOpenRun(this.deps.store, info);
    });
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
