import type { KeyValueStore, RunInfo } from "./types";

/**
 * Crash and kill detection without native code. While a run is active its
 * summary is kept on disk and refreshed as a heartbeat; a clean end removes
 * it. If the next launch still finds it, the previous process died mid-run.
 */

const OPEN_RUN_KEY = "luciddream.telemetry.openRun.v1";
const LAST_FATAL_KEY = "luciddream.telemetry.lastFatal.v1";

export type LastFatal = { message: string; at: number; runId?: string };

async function readJson<T>(
  store: KeyValueStore,
  key: string,
): Promise<T | null> {
  try {
    const raw = await store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(
  store: KeyValueStore,
  key: string,
  value: unknown,
): Promise<void> {
  try {
    await store.setItem(key, JSON.stringify(value));
  } catch {
    // Diagnostics must never disturb a night.
  }
}

async function remove(store: KeyValueStore, key: string): Promise<void> {
  try {
    await store.removeItem(key);
  } catch {
    // As above.
  }
}

export const readOpenRun = (store: KeyValueStore) =>
  readJson<RunInfo>(store, OPEN_RUN_KEY);
export const writeOpenRun = (store: KeyValueStore, run: RunInfo) =>
  writeJson(store, OPEN_RUN_KEY, run);
export const clearOpenRun = (store: KeyValueStore) =>
  remove(store, OPEN_RUN_KEY);

export const readLastFatal = (store: KeyValueStore) =>
  readJson<LastFatal>(store, LAST_FATAL_KEY);
export const writeLastFatal = (store: KeyValueStore, fatal: LastFatal) =>
  writeJson(store, LAST_FATAL_KEY, fatal);
export const clearLastFatal = (store: KeyValueStore) =>
  remove(store, LAST_FATAL_KEY);
