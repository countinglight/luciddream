import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/** A single tag so this session's wake lock can't collide with, or be
 * accidentally released by, some unrelated `useKeepAwake()` call elsewhere
 * in the app. */
const TAG = 'luciddream-run';

/** Holds a partial CPU wake lock for the run's duration (spec §4.4) — keeps
 * timers firing with the screen off. Call `release` in every exit path
 * (completed, stopped, or error), not just the happy path. */
export async function acquireWakeLock(): Promise<void> {
  await activateKeepAwakeAsync(TAG);
}

export function releaseWakeLock(): void {
  deactivateKeepAwake(TAG);
}
