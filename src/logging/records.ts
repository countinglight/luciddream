import type { EngineEvent } from "@/engine";

/**
 * Records a run's log can hold that the engine does not produce.
 *
 * The engine stays unaware of these: it emits EngineEvents and nothing else.
 * Recovery, and later the session-level facts the reviews ask for (ducking,
 * route changes, write-failure counts), are written beside them by the
 * session layer (architectural review AR-11).
 */
export type SessionRecord = {
  type: "run.interrupted";
  /** Best known moment the night actually ended — the last time the app was
   * seen alive, not when the loss was noticed. */
  at: number;
  /** When the next launch discovered the run had been abandoned. */
  detectedAt: number;
  /** How the end time was established, so a reader knows its precision.
   * `marker` is accurate to the heartbeat interval; `last-event` can be much
   * earlier than the real end if the night was in a long silent wait. */
  endTimeSource: "marker" | "last-event" | "start";
};

/** Anything a stored run log may contain, one per line. */
export type RunRecord = EngineEvent | SessionRecord;
