import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";

import { ExpoAudioPort, firstSignalName, resolveSignalMap } from "@/audio";
import { useSettings } from "@/context/settings-context";
import { parseScript } from "@/engine";
import { describeEvent } from "@/logging";
import { getFileStore, getNightSession } from "@/runtime/services";
import type { NightSessionSnapshot } from "@/session/night-session";
import type { VoiceInterruptEvent } from "@/session/voice-interrupt";
import type { LibraryScript, LibrarySignal } from "@/storage/library-types";
import { resolveScriptText } from "@/storage/scripts";
import { telemetry } from "@/telemetry";

export type SessionStatus =
  "idle" | "starting" | "running" | "completed" | "stopped" | "error";

/** Refreshes the diagnostics open-run marker through long silent waits, so an
 * interrupted night reports an end time within this margin. */
const TELEMETRY_HEARTBEAT_MS = 5 * 60_000;

export type SelectedRunPhase = {
  index: number;
  label: string;
  script: LibraryScript | null;
};

/** The service distinguishes `preparing` from `stopping`, which the screens
 * do not need: both are moments the user sees as "the night is coming up" or
 * "the night is still here". Collapsing them here keeps one vocabulary in the
 * UI while the service keeps the precise one for its own tests and for v2. */
function toScreenStatus(status: NightSessionSnapshot["status"]): SessionStatus {
  switch (status) {
    case "preparing":
      return "starting";
    case "stopping":
      return "running";
    default:
      return status;
  }
}

/** Elapsed time is derived from the start timestamp and only re-rendered
 * while the app is actually in front of someone. The session context used to
 * tick every second for the whole night with the screen off, re-rendering the
 * provider and everything under it for eight hours (architectural review
 * AR-24). */
function useElapsed(startedAt: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || startedAt === null) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 1000);
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [active, startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

/**
 * React's view of the night. All ownership lives in the NightSession service
 * (src/session/night-session.ts); this hook subscribes to its snapshots and
 * adds only what is genuinely presentational.
 */
export function useSession(signals: LibrarySignal[]) {
  const { settings } = useSettings();
  const session = useMemo(() => getNightSession(), []);

  const subscribe = useCallback(
    (listener: () => void) => session.subscribe(listener),
    [session],
  );
  const getSnapshot = useCallback(() => session.getSnapshot(), [session]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const status = toScreenStatus(snapshot.status);
  const isRunning =
    snapshot.status === "running" || snapshot.status === "stopping";

  const elapsedMs = useElapsed(snapshot.startedAt, isRunning);
  const phaseElapsedMs = useElapsed(snapshot.phaseStartedAt, isRunning);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => telemetry.heartbeat(), TELEMETRY_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [isRunning]);

  const start = useCallback(
    async (selectedPhases: SelectedRunPhase[], masterVolume: number) => {
      await session.start(
        {
          phases: selectedPhases,
          masterVolume,
          signals,
          durationPresets: settings.periodPresets,
        },
        {
          audioFocus: settings.audioFocus,
          voiceInterrupt: settings.voiceInterrupt === "gentle",
        },
      );
    },
    [
      session,
      signals,
      settings.periodPresets,
      settings.audioFocus,
      settings.voiceInterrupt,
    ],
  );

  const stop = useCallback(() => session.stop(), [session]);

  const handleVoiceInterrupt = useCallback(
    (event: VoiceInterruptEvent) => session.handleVoiceInterrupt(event),
    [session],
  );

  /** Plays a script's first `play:` signal at `volume` directly, without
   * running the script — the Run screen's "Test" button (spec §2.2). */
  const testPlay = useCallback(
    async (item: LibraryScript, volume: number) => {
      const fileStore = getFileStore();
      const text = await resolveScriptText(item, fileStore);
      const script = parseScript(text, {
        durationPresets: settings.periodPresets,
      });
      const signal = firstSignalName(script);
      if (!signal) return;

      const sourceMap = await resolveSignalMap([signal], signals, fileStore);
      const audio = new ExpoAudioPort(sourceMap);
      const handle = await audio.play(signal, { gain: volume, rate: 1 });
      handle.finished.then(() => audio.release()).catch(() => {});
    },
    [signals, settings.periodPresets],
  );

  return {
    status,
    scriptName: snapshot.runName,
    elapsedMs,
    phaseElapsedMs,
    activePhaseLabel: snapshot.activePhaseLabel,
    activeScriptName: snapshot.activeScriptName,
    lastEvent: snapshot.lastEvent,
    currentStepText: snapshot.lastEvent
      ? describeEvent(snapshot.lastEvent)
      : null,
    recentEvents: snapshot.recentEvents,
    errorMessage: snapshot.errorMessage,
    runId: snapshot.runId,
    startedAt: snapshot.startedAt,
    endedAt: snapshot.endedAt,
    activePhaseIndex: snapshot.activePhaseIndex,
    playCount: snapshot.playCount,
    start,
    stop,
    testPlay,
    handleVoiceInterrupt,
  };
}
