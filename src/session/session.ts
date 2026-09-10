import { setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

import { ExpoAudioPort, type AudioSourceRef } from '@/audio';
import { type ContextPort, type LogPort, type RunController } from '@/engine';
import type { Settings } from '@/lib/settings';
import { describeEvent } from '@/logging/describe-event';

import { RealClockPort } from './clock';
import { startKeepAliveTrack, type KeepAliveTrack } from './keep-alive-track';
import { dismissRunNotification, ensureRunNotificationSetup, onStopAction, showOrUpdateRunNotification } from './notification';
import type { VoiceInterruptEvent } from './voice-interrupt';
import { acquireWakeLock, releaseWakeLock } from './wake-lock';
import { runScriptSequence, type SessionPhase } from './sequence';

export type SessionController = {
  stop(): void;
  /** Called by the voice/sound interrupt hook when its detector fires
   * (spec §4.6) — 'trigger' pauses + lowers volume, 'resume' undoes it. Has
   * no effect on the interpreter's own timing. */
  handleVoiceInterrupt(event: VoiceInterruptEvent): void;
  done: Promise<void>;
};

export type StartSessionOptions = {
  name: string;
  phases: SessionPhase[];
  sourceMap: Record<string, AudioSourceRef>;
  context: ContextPort;
  log: LogPort;
  audioFocus: Settings['audioFocus'];
};

const VOICE_INTERRUPT_DUCK_FACTOR = 0.15;

/** Wires an ordered script sequence into a real, overnight-capable run: audio focus,
 * wake lock, the keep-alive track that holds expo-audio's Android
 * foreground service open through silent `wait` gaps, and a notification
 * that mirrors the run's progress with a Stop action — then tears all of it
 * down when the run ends, however it ends (spec §4.4). This is the M3
 * replacement for calling `runScript` directly the way the M2-era
 * `useScriptRun` hook did. */
export async function startSession(options: StartSessionOptions): Promise<SessionController> {
  const { name, phases, sourceMap, context, log, audioFocus } = options;

  await setAudioModeAsync({
    // Explicit rather than relying on expo-audio's default: a run is expected to
    // happen overnight with the ringer switch on silent, so playback surviving
    // silent mode is load-bearing, not incidental. Leaving it implicit means a
    // future default change silences every run, invisibly and only on device.
    playsInSilentMode: true,
    interruptionMode: audioFocus === 'exclusive' ? 'doNotMix' : 'duckOthers',
    shouldPlayInBackground: true,
  });

  const audio = new ExpoAudioPort(sourceMap);
  let wakeLockAcquired = false;
  try {
    await acquireWakeLock();
    wakeLockAcquired = true;
  } catch (error) {
    // Browsers can deny Screen Wake Lock even after a user gesture (for
    // example in an embedded browser). The web run can still proceed with
    // normal browser throttling caveats; a native overnight run cannot.
    if (Platform.OS !== 'web') throw error;
  }
  const keepAlive: KeepAliveTrack = startKeepAliveTrack();

  const notificationsReady = await ensureRunNotificationSetup().catch(() => false);
  let unsubscribeStopAction: (() => void) | null = null;

  let released = false;
  const releaseOnce = async () => {
    if (released) return;
    released = true;
    unsubscribeStopAction?.();
    if (wakeLockAcquired) releaseWakeLock();
    keepAlive.stop();
    await audio.release().catch(() => {});
    if (notificationsReady) await dismissRunNotification().catch(() => {});
  };

  const controller: RunController = runScriptSequence(name, phases, {
    audio,
    clock: new RealClockPort(),
    context,
    log: {
      log(event) {
        log.log(event);
        if (notificationsReady && Platform.OS !== 'web') {
          void showOrUpdateRunNotification(name, describeEvent(event));
        }
        if (event.type === 'run.stop') {
          void releaseOnce();
        }
      },
    },
  });

  if (notificationsReady) {
    unsubscribeStopAction = onStopAction(() => controller.stop());
  }

  return {
    stop: () => controller.stop(),
    handleVoiceInterrupt(event) {
      if (event === 'trigger') {
        audio.duck(VOICE_INTERRUPT_DUCK_FACTOR);
      } else {
        audio.undoDuck();
      }
    },
    done: controller.done,
  };
}
