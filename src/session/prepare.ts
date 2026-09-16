// Deep imports rather than the @/audio barrel: the barrel pulls in the
// expo-audio adapter, and preparation is pure enough to be tested
// without a native module.
import { collectSignalNames, resolveSignalMap } from "@/audio/resolve";
import type { AudioSourceRef } from "@/audio/types";
import { parseScript, type DurationPresets } from "@/engine";
import type { FileStorePort } from "@/storage/file-store";
import type { LibraryScript, LibrarySignal } from "@/storage/library-types";
import { resolveScriptText } from "@/storage/scripts";

import type { SessionPhase } from "./sequence";

/** One slot of the fixed three-phase plan. A null script means the slot is
 * deliberately empty, not that something failed to load. */
export type NightPlanPhase = {
  index: number;
  label: string;
  script: LibraryScript | null;
};

export type NightPlan = {
  phases: NightPlanPhase[];
  masterVolume: number;
  signals: LibrarySignal[];
  durationPresets: DurationPresets;
};

/** A slot the user actually chose a script for. */
type PopulatedPhase = NightPlanPhase & { script: LibraryScript };

export type PreparedRun = {
  /** Display name for the run, built from the populated phases. */
  name: string;
  phases: SessionPhase[];
  sourceMap: Record<string, AudioSourceRef>;
};

/**
 * Raised for anything the user can act on: an empty plan, a script that will
 * not parse, a missing signal. The message is shown verbatim on the Run
 * screen, so it is written for someone half asleep — what is wrong and what
 * to do, no identifiers they did not choose themselves.
 */
export class RunPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunPreparationError";
  }
}

/** Raised when Stop arrived while preparation was still running. Never shown:
 * the caller turns it into the ordinary stopped state. */
export class RunCancelledError extends Error {
  constructor() {
    super("The night was stopped before it started.");
    this.name = "RunCancelledError";
  }
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new RunCancelledError();
}

/** The three-phase plan's own rules (spec §2.2). Pure and synchronous, so an
 * unusable plan is rejected before any file is touched. */
function validatePlan(plan: NightPlan): PopulatedPhase[] {
  if (plan.phases.length !== 3) {
    throw new RunPreparationError(
      "A night needs its three phases. Reopen the app and try again.",
    );
  }
  const populated = plan.phases.filter(
    (phase): phase is PopulatedPhase => phase.script !== null,
  );
  if (populated.length === 0) {
    throw new RunPreparationError(
      "Choose at least one script before starting.",
    );
  }
  if (!populated.some((phase) => phase.index === 1 || phase.index === 2)) {
    throw new RunPreparationError(
      "Choose a script for Early Sleep or Wake Up (at least one is required).",
    );
  }
  return populated;
}

/** Signal monikers are matched by name, so two library signals sharing one
 * name make it ambiguous which file a script would play — silently, and
 * differently depending on library order. Refuse before the night rather
 * than play the wrong sound at 3am (architectural review A10). */
function rejectAmbiguousSignals(
  referenced: string[],
  library: LibrarySignal[],
): void {
  const counts = new Map<string, number>();
  for (const item of library)
    counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  const ambiguous = referenced.filter((name) => (counts.get(name) ?? 0) > 1);
  if (ambiguous.length > 0) {
    throw new RunPreparationError(
      `More than one sound in your Library is called "${ambiguous[0]}". Rename or remove one so the script knows which to play.`,
    );
  }
}

/**
 * Turns a chosen plan into everything a night needs, before any resource is
 * acquired: every script parsed, every signal resolved to a real file. A
 * malformed later phase therefore fails here rather than at 4am (spec §2.2
 * step 3).
 *
 * Cancellable at every await: Stop during preparation must actually stop,
 * which it could not when this logic lived inline in useSession and the
 * controller only existed after startSession resolved (architectural review
 * AR-06 / A7).
 */
export async function prepareRun(
  plan: NightPlan,
  fileStore: FileStorePort,
  signal: AbortSignal,
): Promise<PreparedRun> {
  checkCancelled(signal);
  const populated = validatePlan(plan);

  const name = plan.phases
    .map((phase) => `${phase.label}: ${phase.script?.name ?? "Empty"}`)
    .join(" · ");

  const phases: SessionPhase[] = [];
  for (const phase of populated) {
    const text = await resolveScriptText(phase.script, fileStore);
    checkCancelled(signal);
    let parsed;
    try {
      parsed = parseScript(text, { durationPresets: plan.durationPresets });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new RunPreparationError(
        `"${phase.script.name}" could not be read: ${detail}`,
      );
    }
    phases.push({
      index: phase.index,
      label: phase.label,
      script: { ...parsed, volume: plan.masterVolume },
    });
  }

  const referenced = [
    ...new Set(
      phases.flatMap((phase) => [...collectSignalNames(phase.script)]),
    ),
  ];
  rejectAmbiguousSignals(referenced, plan.signals);

  let sourceMap: Record<string, AudioSourceRef>;
  try {
    sourceMap = await resolveSignalMap(referenced, plan.signals, fileStore);
  } catch (error) {
    checkCancelled(signal);
    throw new RunPreparationError(
      error instanceof Error ? error.message : String(error),
    );
  }
  checkCancelled(signal);

  return { name, phases, sourceMap };
}
