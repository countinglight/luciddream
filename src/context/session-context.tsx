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
import { useVoiceInterrupt } from "@/hooks/use-voice-interrupt";
import { getContextProvider } from "@/runtime/services";

type SessionContextValue = ReturnType<typeof useSession>;

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

  useVoiceInterrupt(
    settings.voiceInterrupt === "gentle" && session.status === "running",
    session.handleVoiceInterrupt,
  );

  return (
    <SessionContext.Provider value={session}>
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
