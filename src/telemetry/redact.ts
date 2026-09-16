import { MAX_MESSAGE, truncate } from "./types";

/**
 * Removes things an error message should never carry off the device.
 *
 * Error strings were uploaded raw. An exception from resolution or playback
 * routinely embeds a file path, and a failed import embeds the URL the user
 * typed — which can name a private host, carry a token in its query string,
 * or simply be content the diagnostics plan promises not to collect (it
 * allows script names and nothing else of the library). Truncation alone does
 * not help: the path is usually at the front (architectural review AR-16).
 *
 * Deliberately blunt. A diagnostic message is for recognising a failure mode,
 * not for reading back; losing precision is the right trade against leaking a
 * user's filesystem. What survives is the shape of the error.
 */

/** file:///…, content://…, https://… and friends, up to the next space. */
const URI_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S*/gi;

/** Unix-style absolute paths, including the iOS container paths that appear
 * in expo-file-system errors. */
const UNIX_PATH_PATTERN = /(?<![\w:])\/(?:[\w .+-]+\/)*[\w .+-]+/g;

/** Windows-style paths, which reach here from the web build and from tests. */
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\(?:[\w .+-]+\\)*[\w .+-]*/g;

/** Anything that looks like an email address. */
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

export function redactMessage(message: string): string {
  const cleaned = message
    .replace(URI_PATTERN, "<uri>")
    .replace(WINDOWS_PATH_PATTERN, "<path>")
    .replace(EMAIL_PATTERN, "<email>")
    .replace(UNIX_PATH_PATTERN, "<path>");
  return truncate(cleaned, MAX_MESSAGE);
}
