import { setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";

import { ExpoAudioPort, type AudioSourceRef } from "@/audio";
import { type ContextPort, type LogPort, type RunController } from "@/engine";
import { describeEvent } from "@/logging/describe-event";

import { RealClockPort } from "./clock";
import { startKeepAliveTrack, type KeepAliveTrack } from "./keep-alive-track";
import {
  dismissRunNotification,
  ensureRunNotificationSetup,
  onStopAction,
  showOrUpdateRunNotification,
} from "./notification";
import type { VoiceInterruptEvent } from "./voice-interrupt";
import { acquireWakeLock, releaseWakeLock } from "./wake-lock";
import { runScriptSequence, type SessionPhase } from "./sequence";

export type SessionController = {
  stop(): void;
  /** Called by the voice/sound interrupt hook when its detector fires
   * (spec §4.6) — 'trigger' pauses + lowers volume, 'resume' undoes it. Has
   * no effect on the interpreter's own timing. */
  handleVoiceInterrupt(event: VoiceInterruptEvent): void;
  /** Resolves once the run has ended *and* every resource it acquired has
   * been released. Callers may safely start the next night after this. */
  done: Promise<void>;
};

export type StartSessionOptions = {
  name: string;
  phases: SessionPhase[];
  sourceMap: Record<string, AudioSourceRef>;
  context: ContextPort;
  log: LogPort;
  /** Narrow by design: the adapter needs this one field, not the whole
   * Settings type (architectural review A11). */
  audioFocus: "duck" | "exclusive";
  /** Voice interrupt is on for this run, so the audio session must also allow
   * the microphone — see the comment at `setAudioModeAsync`. */
  voiceInterrupt?: boolean;
};

const VOICE_INTERRUPT_DUCK_FACTOR = 0.15;

/** Wires an ordered script sequence into a real, overnight-capable run: audio focus,
 * wake lock, the keep-alive track that holds expo-audio's Android
 * foreground service open through silent `wait` gaps, and a notification
 * that mirrors the run's progress with a Stop action — then tears all of it
 * down when the run ends, however it ends (spec §4.4).
 *
 * Every resource is registered for rollback as it is acquired, so a failure
 * part-way through setup releases what already succeeded instead of leaking
 * it; and `done` resolves only after teardown, so an immediate restart
 * cannot race the previous night over the shared wake-lock tag and
 * notification (architectural review A2 / A7). */
export async function startSession(
  options: StartSessionOptions,
): Promise<SessionController> {
  const { name, phases, sourceMap, context, log, audioFocus } = options;
  const recording = options.voiceInterrupt === true;

  // Unwound in reverse on failure, and by releaseOnce on any exit.
  const rollback: (() => void | Promise<void>)[] = [];
  let released = false;
  const releaseOnce = async (): Promise<void> => {
    if (released) return;
    released = true;
    for (const undo of rollback.reverse()) {
      try {
        await undo();
      } catch {
        // One failing teardown step must not strand the others.
      }
    }
  };

  const audio = new ExpoAudioPort(sourceMap, {
    onPlaybackTimeout: (signal, waitedMs) => {
      log.log({
        type: "error",
        at: Date.now(),
        message: `Cue "${signal}" never reported finishing after ${Math.round(waitedMs / 1000)}s; continuing the night.`,
      });
    },
  });

  try {
    await setAudioModeAsync({
      // Explicit rather than relying on expo-audio's default: a run is expected to
      // happen overnight with the ringer switch on silent, so playback surviving
      // silent mode is load-bearing, not incidental. Leaving it implicit means a
      // future default change silences every run, invisibly and only on device.
      playsInSilentMode: true,
      interruptionMode: audioFocus === "exclusive" ? "doNotMix" : "duckOthers",
      shouldPlayInBackground: true,
      // Voice interrupt meters the microphone all night with the screen locked.
      // Without `allowsRecording`, iOS refuses to start the recorder at all; it
      // switches the session to playAndRecord, which expo-audio still routes to
      // the speaker. Without `allowsBackgroundRecording`, both platforms pause
      // the recorder as soon as the app leaves the foreground (Android also
      // needs the plugin's enableBackgroundRecording, set in app.json). Off
      // otherwise, so a run without voice interrupt keeps the plain playback
      // session and never touches the microphone.
      allowsRecording: recording,
      allowsBackgroundRecording: recording,
    });

    // Every player is created here, while the user is still awake and able to
    // act on a failure, rather than hours into the night (AR-09).
    await audio.preload();
    rollback.push(() => audio.release());

    try {
      await acquireWakeLock();
      rollback.push(() => releaseWakeLock());
    } catch (error) {
      // Browsers can deny Screen Wake Lock even after a user gesture (for
      // example in an embedded browser). The web run can still proceed with
      // normal browser throttling caveats; a native overnight run cannot.
      if (Platform.OS !== "web") throw error;
    }

    const keepAlive: KeepAliveTrack = startKeepAliveTrack();
    rollback.push(() => keepAlive.stop());

    const notificationsReady = await ensureRunNotificationSetup().catch(
      () => false,
    );

    // Notification updates are serialised so the final dismissal cannot be
    // overtaken by a step update still in flight, which would leave a dead
    // run's notification on the lock screen all night.
    let notificationChain: Promise<void> = Promise.resolve();
    const queueNotification = (task: () => Promise<void>): Promise<void> => {
      notificationChain = notificationChain.then(task).catch(() => {});
      return notificationChain;
    };

    if (notificationsReady) {
      rollback.push(async () => {
        await queueNotification(() => dismissRunNotification());
      });
    }

    const controller: RunController = runScriptSequence(name, phases, {
      audio,
      clock: new RealClockPort(),
      context,
      log: {
        log(event) {
          log.log(event);
          if (notificationsReady && Platform.OS !== "web") {
            void queueNotification(() =>
              showOrUpdateRunNotification(name, describeEvent(event)),
            );
          }
        },
      },
    });

    if (notificationsReady) {
      const unsubscribe = onStopAction(() => controller.stop());
      rollback.push(() => unsubscribe());
    }

    const done = (async () => {
      try {
        await controller.done;
      } finally {
        await releaseOnce();
      }
    })();

    return {
      stop: () => controller.stop(),
      handleVoiceInterrupt(event) {
        if (event === "trigger") {
          audio.duck(VOICE_INTERRUPT_DUCK_FACTOR);
        } else {
          audio.undoDuck();
        }
      },
      done,
    };
  } catch (error) {
    await releaseOnce();
    throw error;
  }
}
