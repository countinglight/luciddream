import { Platform } from "react-native";

import type { FileStorePort } from "@/storage/file-store";
import { ExpoFileSystemStore } from "@/storage/expo-file-store";
import { WebFileStore } from "@/storage/web-file-store";

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
