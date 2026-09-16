import AsyncStorage from "@react-native-async-storage/async-storage";

import { logPathFor } from "@/logging/jsonl-log-port";
import type { SessionRecord } from "@/logging/records";
import {
  loadRunIndex,
  saveRunIndex,
  upsertRun,
  type RunSummary,
} from "@/logging/run-index";
import type { FileStorePort } from "@/storage/file-store";

/**
 * Detecting a night the operating system took away.
 *
 * A run's index entry gets `endedAt` from its own `run.stop`. When the
 * process dies mid-night — an OS kill, a native crash, a flat battery —
 * nothing writes it, so the night showed as "running" forever, and the week
 * strip ranked it above every completed night. That is exactly the failure v1
 * most needs evidence about, and detection existed only inside optional
 * diagnostics, so a user who never turned those on saw nothing
 * (architectural review AR-04 / A7, v2 F2.9).
 *
 * This is the local, always-on version. Diagnostics now read from it rather
 * than owning it. It promises detection only: there is no resume, and it
 * never claims to know more about the end than it does.
 */

const OPEN_RUN_KEY = "luciddream.openRun.v1";

export type OpenRunMarker = {
  id: string;
  name: string;
  startedAt: number;
  /** Refreshed while the night runs, including through long silent waits, so
   * an interrupted run has an end time better than "its last cue". */
  lastSeenAt: number;
  eventCount: number;
  /** Temporary microphone file this night owns, if voice interrupt was on.
   * Recovery deletes it: an interrupted night must not leave bedroom audio
   * on disk (spec §4.6). */
  recordingUri?: string;
};

export async function readOpenRun(): Promise<OpenRunMarker | null> {
  try {
    const raw = await AsyncStorage.getItem(OPEN_RUN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isOpenRunMarker(parsed)) return null;
    return parsed;
  } catch {
    // A corrupt marker must never stop the app starting.
    return null;
  }
}

export async function writeOpenRun(marker: OpenRunMarker): Promise<void> {
  try {
    await AsyncStorage.setItem(OPEN_RUN_KEY, JSON.stringify(marker));
  } catch {
    // Losing the marker costs precision in the morning, not the night.
  }
}

export async function clearOpenRun(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OPEN_RUN_KEY);
  } catch {
    // As above.
  }
}

/** Defensive: the marker is JSON on disk and can be anything at all. */
function isOpenRunMarker(value: unknown): value is OpenRunMarker {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.startedAt === "number" &&
    Number.isFinite(candidate.startedAt)
  );
}

export type RecoveryDeps = {
  fileStore: FileStorePort;
  now: () => number;
  /** Removes a temporary recording an interrupted night left behind. */
  deleteRecording?: (uri: string) => Promise<void>;
};

export type RecoveryResult = {
  /** Runs closed as interrupted by this pass. */
  interrupted: RunSummary[];
};

/**
 * Closes every run the previous process left open. Safe to call once per
 * launch, before or without any UI.
 *
 * The marker is cleared before anything else is attempted, so a failure
 * part-way through cannot make every subsequent launch retry the same
 * recovery forever.
 */
export async function recoverInterruptedRuns(
  deps: RecoveryDeps,
): Promise<RecoveryResult> {
  const marker = await readOpenRun();
  await clearOpenRun();

  if (marker?.recordingUri && deps.deleteRecording) {
    try {
      await deps.deleteRecording(marker.recordingUri);
    } catch {
      // Best effort; the next enable of voice interrupt sweeps again.
    }
  }

  let runs: RunSummary[];
  try {
    runs = await loadRunIndex();
  } catch {
    return { interrupted: [] };
  }

  // Everything still open, not just the one the marker names: a night from
  // before this existed, or a marker lost to a storage failure, must still
  // stop claiming to be running.
  const open = runs.filter((run) => run.endedAt === undefined);
  if (open.length === 0) return { interrupted: [] };

  const detectedAt = deps.now();
  const closed: RunSummary[] = [];
  let next = runs;

  for (const run of open) {
    const { endedAt, source } = await resolveEndTime(run, marker, deps);
    const summary: RunSummary = {
      ...run,
      endedAt,
      reason: "interrupted",
    };
    next = upsertRun(next, summary);
    closed.push(summary);

    const record: SessionRecord = {
      type: "run.interrupted",
      at: endedAt,
      detectedAt,
      endTimeSource: source,
    };
    await appendRecord(deps.fileStore, run.id, record);
  }

  try {
    await saveRunIndex(next);
  } catch {
    return { interrupted: [] };
  }

  return { interrupted: closed };
}

/** The best end time available, and how good it is. Never invents one. */
async function resolveEndTime(
  run: RunSummary,
  marker: OpenRunMarker | null,
  deps: RecoveryDeps,
): Promise<{ endedAt: number; source: SessionRecord["endTimeSource"] }> {
  if (marker && marker.id === run.id && typeof marker.lastSeenAt === "number") {
    return {
      endedAt: Math.max(marker.lastSeenAt, run.startedAt),
      source: "marker",
    };
  }

  const lastEventAt = await lastEventTime(deps.fileStore, run.id);
  if (lastEventAt !== null && lastEventAt >= run.startedAt) {
    return { endedAt: lastEventAt, source: "last-event" };
  }

  return { endedAt: run.startedAt, source: "start" };
}

async function lastEventTime(
  fileStore: FileStorePort,
  runId: string,
): Promise<number | null> {
  try {
    if (!(await fileStore.exists("document", logPathFor(runId)))) return null;
    const text = await fileStore.readText("document", logPathFor(runId));
    let latest: number | null = null;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        // A process killed mid-append can leave a partial final line.
        const parsed: unknown = JSON.parse(trimmed);
        const at = (parsed as { at?: unknown }).at;
        if (typeof at === "number" && Number.isFinite(at)) {
          latest = latest === null ? at : Math.max(latest, at);
        }
      } catch {
        continue;
      }
    }
    return latest;
  } catch {
    return null;
  }
}

async function appendRecord(
  fileStore: FileStorePort,
  runId: string,
  record: SessionRecord,
): Promise<void> {
  try {
    await fileStore.ensureDir("document", "logs");
    await fileStore.appendText(
      "document",
      logPathFor(runId),
      `${JSON.stringify(record)}\n`,
    );
  } catch {
    // The index entry is already corrected; the log line is a bonus.
  }
}
