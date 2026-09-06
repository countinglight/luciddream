import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  collectSignalNames,
  ExpoAudioPort,
  firstSignalName,
  resolveSignalMap,
} from "@/audio";
import { getLibraryFileStore } from "@/context/library-context";
import { useSettings } from "@/context/settings-context";
import { parseScript, type EngineEvent, type LogPort } from "@/engine";
import {
  describeEvent,
  FanOutLogPort,
  FilteringLogPort,
  JsonlLogPort,
} from "@/logging";
import { loadRunIndex, saveRunIndex, upsertRun } from "@/logging/run-index";
import { ManualContextProvider } from "@/runtime/context-providers";
import {
  startSession,
  type SessionController,
  type SessionPhase,
} from "@/session";
import type { VoiceInterruptEvent } from "@/session/voice-interrupt";
import type { LibraryScript, LibrarySignal } from "@/storage/library-types";
import { resolveScriptText } from "@/storage/scripts";

export type SessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "completed"
  | "stopped"
  | "error";

const MAX_RECENT_EVENTS = 6;

export type SelectedRunPhase = {
  index: number;
  label: string;
  script: LibraryScript | null;
};

function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function persistRunStart(
  id: string,
  scriptName: string,
  startedAt: number,
): Promise<void> {
  const runs = await loadRunIndex();
  await saveRunIndex(
    upsertRun(runs, { id, scriptName, startedAt, eventCount: 0 }),
  );
}

async function persistRunEnd(
  id: string,
  scriptName: string,
  startedAt: number,
  event: Extract<EngineEvent, { type: "run.stop" }>,
  eventCount: number,
): Promise<void> {
  const runs = await loadRunIndex();
  await saveRunIndex(
    upsertRun(runs, {
      id,
      scriptName,
      startedAt,
      endedAt: event.at,
      eventCount,
      reason: event.reason,
    }),
  );
}

/**
 * The M3 replacement for the M2-era `useScriptRun`: runs a library script
 * through `session.startSession` (foreground service keep-alive, wake lock,
 * notification, JSONL logging) instead of calling the engine's `runScript`
 * directly. See src/session/session.ts for what wiring that adds.
 */
export function useSession(signals: LibrarySignal[]) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [scriptName, setScriptName] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [phaseElapsedMs, setPhaseElapsedMs] = useState(0);
  const [activePhaseLabel, setActivePhaseLabel] = useState<string | null>(null);
  const [activeScriptName, setActiveScriptName] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<EngineEvent | null>(null);
  const [recentEvents, setRecentEvents] = useState<EngineEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionRef = useRef<SessionController | null>(null);
  const eventCountRef = useRef(0);
  const phaseStartedAtRef = useRef<number | null>(null);
  const context = useMemo(() => new ManualContextProvider(), []);

  // Drives conditionals from the Settings screen's "Simulated context" panel
  // live, including mid-run (spec §4.3). "none" is the Settings UI's way of
  // saying "no sleep-stage reading" — ManualContextProvider (and the engine
  // beyond it) only knows `undefined` for that.
  useEffect(() => {
    const { sleepStage, ...rest } = settings.simulatedContext;
    context.set({
      ...rest,
      sleepStage: sleepStage === "none" ? undefined : sleepStage,
    });
  }, [context, settings.simulatedContext]);

  useEffect(() => {
    if (status !== "running" || startedAt === null) return;
    const id = setInterval(() => {
      const now = Date.now();
      setElapsedMs(now - startedAt);
      if (phaseStartedAtRef.current !== null)
        setPhaseElapsedMs(now - phaseStartedAtRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [status, startedAt]);

  const start = useCallback(
    async (selectedPhases: SelectedRunPhase[], masterVolume: number) => {
      if (sessionRef.current) return; // one run at a time
      if (selectedPhases.length !== 3) {
        setStatus("error");
        setErrorMessage("A run requires the three fixed phases.");
        return;
      }
      if (
        !selectedPhases.some(
          (phase) => (phase.index === 1 || phase.index === 2) && phase.script,
        )
      ) {
        setStatus("error");
        setErrorMessage(
          "Choose a script for Early Sleep or Wake Up (at least one is required).",
        );
        return;
      }
      const populatedPhases = selectedPhases.filter(
        (
          phase,
        ): phase is { index: number; label: string; script: LibraryScript } =>
          phase.script !== null,
      );
      if (populatedPhases.length === 0) {
        setStatus("error");
        setErrorMessage("Choose at least one script before starting.");
        return;
      }

      const runName = selectedPhases
        .map((phase) => `${phase.label}: ${phase.script?.name ?? "Empty"}`)
        .join(" · ");

      setStatus("starting");
      setErrorMessage(null);
      setScriptName(runName);
      setActivePhaseLabel(null);
      setActiveScriptName(null);
      phaseStartedAtRef.current = null;
      setPhaseElapsedMs(0);
      setLastEvent(null);
      setRecentEvents([]);
      eventCountRef.current = 0;
      let failStartedSession: ((message: string) => void) | null = null;

      try {
        const fileStore = getLibraryFileStore();
        // Preflight every phase before acquiring the wake lock or starting
        // audio so a later malformed/unresolvable phase cannot fail mid-night.
        const phases: SessionPhase[] = await Promise.all(
          populatedPhases.map(async (phase) => {
            const text = await resolveScriptText(phase.script, fileStore);
            return {
              index: phase.index,
              label: phase.label,
              script: {
                ...parseScript(text, {
                  durationPresets: settings.periodPresets,
                }),
                volume: masterVolume,
              },
            };
          }),
        );
        const signalNames = [
          ...new Set(
            phases.flatMap((phase) => [...collectSignalNames(phase.script)]),
          ),
        ];
        const sourceMap = await resolveSignalMap(
          signalNames,
          signals,
          fileStore,
        );

        const id = generateRunId();
        const started = Date.now();
        await persistRunStart(id, runName, started);
        let finishedBeforeStartReturned = false;

        const uiLog: LogPort = {
          log: (event) => {
            eventCountRef.current += 1;
            setLastEvent(event);
            setRecentEvents((prev) =>
              [...prev, event].slice(-MAX_RECENT_EVENTS),
            );
            if (event.type === "error") setErrorMessage(event.message);
            if (event.type === "phase.start") {
              setActivePhaseLabel(event.phase);
              setActiveScriptName(event.scriptName);
              phaseStartedAtRef.current = event.at;
              setPhaseElapsedMs(0);
            }
            if (event.type === "run.stop") {
              finishedBeforeStartReturned = true;
              setStatus(
                event.reason === "error"
                  ? "error"
                  : event.reason === "stopped"
                    ? "stopped"
                    : "completed",
              );
              sessionRef.current = null;
              void persistRunEnd(
                id,
                runName,
                started,
                event,
                eventCountRef.current,
              );
            }
          },
        };
        const log = new FanOutLogPort([
          new FilteringLogPort(
            new JsonlLogPort(id, fileStore),
            settings.logCategories,
          ),
          uiLog,
        ]);
        failStartedSession = (message) => {
          const at = Date.now();
          log.log({ type: "run.start", at: started, scriptName: runName });
          log.log({ type: "error", at, message });
          log.log({ type: "run.stop", at, reason: "error" });
        };

        setStartedAt(started);
        setElapsedMs(0);

        const session = await startSession({
          name: runName,
          phases,
          sourceMap,
          context,
          log,
          audioFocus: settings.audioFocus,
        });
        if (!finishedBeforeStartReturned) {
          sessionRef.current = session;
          setStatus("running");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (failStartedSession) failStartedSession(message);
        else {
          setStatus("error");
          setErrorMessage(message);
        }
      }
    },
    [
      context,
      signals,
      settings.audioFocus,
      settings.logCategories,
      settings.periodPresets,
    ],
  );

  const stop = useCallback(() => {
    sessionRef.current?.stop();
  }, []);

  const handleVoiceInterrupt = useCallback((event: VoiceInterruptEvent) => {
    sessionRef.current?.handleVoiceInterrupt(event);
  }, []);

  /** Plays a script's first `play:` signal at `volume` directly, without
   * running the script — the Run screen's "Test" button (spec §2.2). */
  const testPlay = useCallback(
    async (item: LibraryScript, volume: number) => {
      const fileStore = getLibraryFileStore();
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
    scriptName,
    elapsedMs,
    phaseElapsedMs,
    activePhaseLabel,
    activeScriptName,
    lastEvent,
    currentStepText: lastEvent ? describeEvent(lastEvent) : null,
    recentEvents,
    errorMessage,
    start,
    stop,
    testPlay,
    handleVoiceInterrupt,
  };
}
