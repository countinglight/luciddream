import { createContext, useContext, type PropsWithChildren } from 'react';

import { useLibrary } from '@/context/library-context';
import { useSettings } from '@/context/settings-context';
import { useSession } from '@/hooks/use-session';
import { useVoiceInterrupt } from '@/hooks/use-voice-interrupt';

type SessionContextValue = ReturnType<typeof useSession>;

const SessionContext = createContext<SessionContextValue | null>(null);

/** Lifts `useSession` above the tab navigator so the Home screen (setup) and
 * the Run screen (live progress) share one running session instead of each
 * mounting its own — navigating between them must not restart or lose the
 * run. Voice interrupt listens here too, so it keeps working while the user
 * is looking at either screen. */
export function SessionProvider({ children }: PropsWithChildren) {
  const { settings } = useSettings();
  const { signals } = useLibrary();
  const session = useSession(signals);

  useVoiceInterrupt(
    settings.voiceInterrupt === 'gentle' && session.status === 'running',
    session.handleVoiceInterrupt,
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSessionContext must be used within a SessionProvider');
  return ctx;
}
