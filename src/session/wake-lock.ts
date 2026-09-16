import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Platform } from "react-native";

/** A single tag so this session's lock can't collide with, or be
 * accidentally released by, some unrelated `useKeepAwake()` call elsewhere
 * in the app. */
const TAG = "luciddream-run";

/**
 * Keeps a *web* run alive, and deliberately does nothing on a phone.
 *
 * This was described, in spec §4.4 and in this file, as a partial CPU wake
 * lock. It never was one: expo-keep-awake sets Android's
 * FLAG_KEEP_SCREEN_ON and iOS's `isIdleTimerDisabled`, both of which keep the
 * *display* awake and neither of which keeps the CPU running with the screen
 * off (architectural review AR-05 / A3).
 *
 * Holding a phone screen lit all night is not acceptable: it lights the
 * bedroom and it is the dominant term in the battery budget (spec §2.4). The
 * screen may come on when the OS itself wakes it — a button press, a turn of
 * the phone — and not otherwise. Overnight liveness on a phone rests on the
 * audio session instead: expo-audio's media foreground service on Android,
 * bound through the keep-alive track's lock-screen registration, and the
 * `audio` background mode on iOS.
 *
 * The web build keeps the Screen Wake Lock, because a browser tab has no
 * foreground service to fall back on and would be throttled into stopping.
 * The web build is not a device anyone sleeps next to.
 */
export async function acquireWakeLock(): Promise<void> {
  if (Platform.OS !== "web") return;
  await activateKeepAwakeAsync(TAG);
}

export function releaseWakeLock(): void {
  if (Platform.OS !== "web") return;
  deactivateKeepAwake(TAG);
}
