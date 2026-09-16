import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

/** A ~1s, very-low-amplitude tone (not true digital silence — some Android
 * media-session implementations are more willing to reclaim an all-zero
 * buffer as "not really playing"). Looped continuously for a run's whole
 * duration.
 *
 * Android: keeps expo-audio's own foreground service
 * (FOREGROUND_SERVICE_MEDIA_PLAYBACK, declared by its config plugin) alive
 * through a script's silent `wait` gaps instead of dropping between signal
 * plays — see the M3 plan's foreground-service decision.
 *
 * iOS: arguably more load-bearing. With the `audio` background mode, iOS keeps
 * a backgrounded app running only while its audio session is actively
 * rendering, so without this loop the app is suspended during the first long
 * `wait` and never plays the next cue. Whether iOS treats a 0.01-amplitude
 * loop as real playback through a full night is to be confirmed on a device
 * (iOS support plan D4, doc/evidence R-005). v2 replaces it with an audible
 * night ambience (v2 plan F2.4). */
const KEEP_ALIVE_SOURCE = require("../../assets/sounds/keep-alive.wav");
const KEEP_ALIVE_VOLUME = 0.01;

export type KeepAliveTrack = {
  stop(): void;
};

export type KeepAliveOptions = {
  /** Shown on the Android lock screen while the night runs. */
  title: string;
};

/** No-op on web — there's no OS foreground service to hold there, and
 * looping an inaudible track would just waste a decoder for nothing. */
export function startKeepAliveTrack(options: KeepAliveOptions): KeepAliveTrack {
  if (Platform.OS === "web") {
    return { stop() {} };
  }

  const player: AudioPlayer = createAudioPlayer(KEEP_ALIVE_SOURCE);
  player.loop = true;
  player.volume = KEEP_ALIVE_VOLUME;
  player.play();

  // Android binds expo-audio's media playback service — and promotes it to a
  // foreground service — only when a player is registered for lock-screen
  // controls. Without this, expo-audio's own types state that background
  // playback stops after about three minutes (an OS limitation), so a night
  // with the screen off would die almost immediately. Nothing in the app
  // called it before; the screen-on keep-awake was masking the gap
  // (architectural review A3 / AR-05). Only one player may own the lock
  // screen, and the keep-alive loop is the one that plays continuously, so it
  // is the right owner. `isLiveStream` hides the scrub bar and duration,
  // which are meaningless for a one-second loop.
  if (Platform.OS === "android") {
    try {
      player.setActiveForLockScreen(
        true,
        { title: options.title, artist: "LucidDream" },
        { isLiveStream: true, showSeekForward: false, showSeekBackward: false },
      );
    } catch {
      // A night without lock-screen controls is worse but still a night;
      // never fail the run over this.
    }
  }

  return {
    stop() {
      if (Platform.OS === "android") {
        try {
          player.clearLockScreenControls();
        } catch {
          // Teardown must not throw.
        }
      }
      try {
        player.remove();
      } catch {
        // As above.
      }
    },
  };
}
