import { clearLucidNotes, saveLucidNote } from "@/lib/lucid-notes";
import type { FileStorePort } from "@/storage/file-store";

import { logPathFor } from "./jsonl-log-port";
import {
  loadRunIndex,
  removeRun,
  saveRunIndex,
  tryLoadRunIndex,
} from "./run-index";

/**
 * Deleting a night, properly.
 *
 * Delete used to remove a run's index entry and its lucid answer, and leave
 * `logs/<runId>.jsonl` on disk forever — unreachable through the UI, still in
 * iOS device backups, and accumulating. That contradicts what Delete means to
 * the person tapping it, spec §2.3, and v2's F6.3 "every stored thing can be
 * deleted" (architectural review AR-01 / A6).
 *
 * These operations live beside the index they maintain rather than inside the
 * Nights screen, which is how the log file came to be missed in the first
 * place (AR-18).
 */

const LOGS_DIR = "logs";

/** Removes one night: its index entry, its lucid answer and its log. */
export async function deleteRun(
  id: string,
  fileStore: FileStorePort,
): Promise<void> {
  const runs = await loadRunIndex();
  await saveRunIndex(removeRun(runs, id));
  await saveLucidNote(id, null);
  await deleteLog(id, fileStore);
}

/** Removes every night and every log file, including orphans. */
export async function deleteAllRuns(fileStore: FileStorePort): Promise<void> {
  await saveRunIndex([]);
  await clearLucidNotes();

  for (const name of await listLogFiles(fileStore)) {
    await deleteByName(name, fileStore);
  }
}

/**
 * Deletes log files no index entry refers to.
 *
 * Runs once at launch, after interrupted-run recovery has put every night
 * that does exist back into the index — so a night in progress, whose entry
 * is written the moment it starts, is never swept.
 */
export async function sweepOrphanLogs(
  fileStore: FileStorePort,
): Promise<number> {
  // Deliberately the strict read: loadRunIndex returns [] when storage
  // fails, which here would make every log look like an orphan and delete
  // the user's entire history over a transient error.
  const indexed = await tryLoadRunIndex();
  if (indexed === null) return 0;
  const known = new Set(indexed.map((run) => run.id));

  let removed = 0;
  for (const name of await listLogFiles(fileStore)) {
    const runId = runIdFromLogName(name);
    if (runId === null || known.has(runId)) continue;
    await deleteByName(name, fileStore);
    removed += 1;
  }
  return removed;
}

async function listLogFiles(fileStore: FileStorePort): Promise<string[]> {
  try {
    const names = await fileStore.listFiles("document", LOGS_DIR);
    return names.filter((name) => name.endsWith(".jsonl"));
  } catch {
    return [];
  }
}

function runIdFromLogName(name: string): string | null {
  if (!name.endsWith(".jsonl")) return null;
  const runId = name.slice(0, -".jsonl".length);
  return runId.length > 0 ? runId : null;
}

async function deleteLog(
  runId: string,
  fileStore: FileStorePort,
): Promise<void> {
  try {
    await fileStore.deleteFile("document", logPathFor(runId));
  } catch {
    // A file already gone, or one the OS will not let us remove, must not
    // leave the user staring at a night that refuses to disappear. The index
    // entry is already gone, which is what they asked for.
  }
}

async function deleteByName(
  name: string,
  fileStore: FileStorePort,
): Promise<void> {
  try {
    await fileStore.deleteFile("document", `${LOGS_DIR}/${name}`);
  } catch {
    // As above.
  }
}
