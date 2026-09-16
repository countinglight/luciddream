import type { KeyValueStore } from "./types";

/**
 * The one thing diagnostics still keep for themselves: the last fatal
 * JavaScript error, recorded before the process dies and reported on the next
 * launch.
 *
 * Kill detection used to live here too, as a second open-run marker beside
 * the session layer's. It moved to src/session/run-recovery.ts, which runs for
 * every user rather than only those who opted into diagnostics, and
 * diagnostics now report from its result (architectural review AR-04).
 */

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

export const readLastFatal = (store: KeyValueStore) =>
  readJson<LastFatal>(store, LAST_FATAL_KEY);
export const writeLastFatal = (store: KeyValueStore, fatal: LastFatal) =>
  writeJson(store, LAST_FATAL_KEY, fatal);
export const clearLastFatal = (store: KeyValueStore) =>
  remove(store, LAST_FATAL_KEY);
