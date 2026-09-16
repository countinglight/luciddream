import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from "react";

import { useLibrary } from "@/context/library-context";
import { useSettings } from "@/context/settings-context";
import { useSession } from "@/hooks/use-session";
import { useTelemetryLifecycle } from "@/hooks/use-telemetry";
import {
  useVoiceInterrupt,
  type VoiceInterruptMonitor,
} from "@/hooks/use-voice-interrupt";
import {
  getContextProvider,
  getNightSession,
  recoverOnLaunch,
} from "@/runtime/services";

type SessionContextValue = ReturnType<typeof useSession> & {
  /** So a screen can tell the user that voice interrupt is not actually
   * listening. A denied permission used to be discarded silently, leaving
   * someone believing a feature was watching over their night when it was
   * not (architectural review A1). */
  voiceInterrupt: VoiceInterruptMonitor;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/** Lifts `useSession` above the tab navigator so the Home screen (setup) and
 * the Run screen (live progress) share one running session instead of each
 * mounting its own — navigating between them must not restart or lose the
 * run. Voice interrupt listens here too, so it keeps working while the user
 * is looking at either screen. */
export function SessionProvider({ children }: PropsWithChildren) {
  const { settings, isLoaded } = useSettings();
  const { signals } = useLibrary();
  const session = useSession(signals);

  // Drives conditionals from the Settings screen's "Simulated context" panel
  // live, including mid-run (spec §4.3). "none" is the Settings UI's way of
  // saying "no sleep-stage reading" — ManualContextProvider (and the engine
  // beyond it) only knows `undefined` for that. The provider itself is owned
  // by the composition root, so a run can read context without the React tree.
  useEffect(() => {
    const { sleepStage, ...rest } = settings.simulatedContext;
    getContextProvider().set({
      ...rest,
      sleepStage: sleepStage === "none" ? undefined : sleepStage,
    });
  }, [settings.simulatedContext]);

  useTelemetryLifecycle(settings.diagnostics, isLoaded);

  // A night the OS took away is closed as interrupted at the next launch, for
  // every user, before they can open Nights and see it claiming to run.
  useEffect(() => {
    void recoverOnLaunch();
  }, []);

  const voiceInterrupt = useVoiceInterrupt(
    settings.voiceInterrupt === "gentle" && session.status === "running",
    session.handleVoiceInterrupt,
    {
      // The night owns the temporary recording, so a night the OS kills can
      // still have it deleted at the next launch.
      onRecordingFile: (uri) => getNightSession().setOwnedRecording(uri),
    },
  );

  // A microphone that is not listening must not pass for one that is. The
  // night's own record says so, which is also what the Sleeping screen's
  // recent activity shows.
  const micState = voiceInterrupt.permission;
  useEffect(() => {
    if (session.status !== "running") return;
    if (micState === "denied") {
      getNightSession().note(
        "Voice interrupt is not listening: microphone permission was denied.",
      );
    } else if (micState === "error") {
      getNightSession().note("Voice interrupt could not start listening.");
    }
  }, [micState, session.status]);

  return (
    <SessionContext.Provider value={{ ...session, voiceInterrupt }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx)
    throw new Error("useSessionContext must be used within a SessionProvider");
  return ctx;
}
