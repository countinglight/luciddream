/** What expo-audio's `AudioSource` actually accepts: a `require()`'d
 * bundled asset (a numeric module id) or a `{ uri }` pointing at a local or
 * remote file. Named separately from expo-audio's own type so audio/resolve
 * can be unit-tested without importing expo-audio at all. */
export type AudioSourceRef = number | { uri: string };
