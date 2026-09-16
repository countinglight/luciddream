import { File } from "expo-file-system";
import { Platform } from "react-native";

/**
 * Deletes a temporary microphone file by absolute URI.
 *
 * expo-audio's recorder always writes to a real file — a UUID-named file in
 * the cache directory — even when the only thing being used is its metering.
 * Nothing deleted it, so an eight-hour night with voice interrupt on left
 * roughly 230 MB of bedroom audio on iOS and 44 MB on Android sitting in
 * cache until the OS happened to evict it. Spec §4.6 says audio is never
 * stored and the iOS permission string says "Nothing is kept or sent"
 * (architectural review AR-02 / A1).
 *
 * Addressed by URI rather than through FileStorePort, which is rooted at the
 * app's own cache and document directories: the recorder chooses its own
 * path, and owning that path explicitly is more robust than guessing
 * expo-audio's folder names.
 */
export async function deleteRecordingFile(
  uri: string | null | undefined,
): Promise<void> {
  if (!uri) return;
  // expo-file-system's File is a no-op stub on web; a web recording is an
  // in-memory blob the browser reclaims itself.
  if (Platform.OS === "web") return;

  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A file already gone, or one the OS will not let us touch, must never
    // take down a night or block the next one starting.
  }
}
