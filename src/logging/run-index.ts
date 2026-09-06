import AsyncStorage from '@react-native-async-storage/async-storage';

export type RunSummary = {
  id: string;
  scriptName: string;
  startedAt: number;
  /** Undefined while the run is still in progress. */
  endedAt?: number;
  eventCount: number;
  reason?: 'completed' | 'stopped' | 'error';
};

const STORAGE_KEY = 'luciddream.runs.v1';

/** The run's log content itself lives in a JSONL file (jsonl-log-port.ts);
 * this is just enough metadata for the Log screen's list, same split as
 * library-store.ts (index in AsyncStorage, content in the file store). */
export async function loadRunIndex(): Promise<RunSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRunIndex(runs: RunSummary[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

export function upsertRun(runs: RunSummary[], run: RunSummary): RunSummary[] {
  const index = runs.findIndex((existing) => existing.id === run.id);
  if (index === -1) return [...runs, run];
  const next = runs.slice();
  next[index] = run;
  return next;
}

export function removeRun(runs: RunSummary[], id: string): RunSummary[] {
  return runs.filter((run) => run.id !== id);
}
