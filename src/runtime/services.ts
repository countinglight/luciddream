import { Platform } from "react-native";

import { JsonlLogPort } from "@/logging/jsonl-log-port";
import { recordRunEnd, recordRunStart } from "@/logging/run-index";
import { NightSession } from "@/session/night-session";
import { startSession } from "@/session/session";
import { ExpoFileSystemStore } from "@/storage/expo-file-store";
import type { FileStorePort } from "@/storage/file-store";
import { WebFileStore } from "@/storage/web-file-store";
import { telemetry } from "@/telemetry";

import { ManualContextProvider } from "./context-providers";

/**
 * The app's plain, React-free composition root.
 *
 * Everything here must be reachable from code that runs before — or without —
 * the React tree: launch-time run recovery, the night session service, and
 * (in v2) an OS-initiated relaunch at a scheduled cue time. Creating these in
 * a context module instead, as `library-context.tsx` used to, forced that code
 * to import React just to reach storage (architectural review AR-08).
 *
 * Contexts and hooks are consumers of this module, never the other way round.
 */

// expo-file-system's Directory/File classes are unimplemented on web, so the
// web build needs its own IndexedDB-backed FileStorePort instead.
const fileStore: FileStorePort =
  Platform.OS === "web" ? new WebFileStore() : new ExpoFileSystemStore();

/** The one file store for library content, run logs and recovery markers. */
export function getFileStore(): FileStorePort {
  return fileStore;
}

// Drives conditionals from the Settings screen's "Simulated context" panel,
// including mid-run (spec §4.3). One instance for the app's lifetime, updated
// by the settings effect in SessionProvider.
const contextProvider = new ManualContextProvider();

export function getContextProvider(): ManualContextProvider {
  return contextProvider;
}

function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let nightSession: NightSession | null = null;

/** The app's single night session. Created lazily so importing this module
 * stays cheap for code that only wants the file store. */
export function getNightSession(): NightSession {
  if (!nightSession) {
    nightSession = new NightSession({
      fileStore,
      context: contextProvider,
      startSession,
      // The durable log records every event. The per-category toggles filter
      // what is shown and exported, not what is written: a user should not be
      // able to switch off the record of why their night ended (architectural
      // review AR-12, owner decision).
      createLog: (runId) => new JsonlLogPort(runId, fileStore),
      recordStart: ({ id, name, startedAt }) =>
        recordRunStart({ id, scriptName: name, startedAt }),
      recordEnd: ({ id, name, startedAt, endedAt, reason, eventCount }) =>
        recordRunEnd({
          id,
          scriptName: name,
          startedAt,
          endedAt,
          reason,
          eventCount,
        }),
      observer: telemetry,
      now: () => Date.now(),
      newRunId: generateRunId,
    });
  }
  return nightSession;
}
