import type { AudioPort, ContextSnapshot, ContextPort, EngineEvent, LogPort, PlaybackHandle, PlayOptions } from '../ports';

export type RecordedPlay = { signal: string; opts: PlayOptions };

/** Records every play() call. By default playback "finishes" immediately,
 * so `wait: true` statements don't block tests unless a test deliberately
 * asks for control — see `holdNextFinish()`. */
export class RecordingAudioPort implements AudioPort {
  readonly calls: RecordedPlay[] = [];
  private nextFinished: Promise<void> | null = null;

  /** Makes the *next* play() call return a handle whose `finished` doesn't
   * resolve until the returned function is called — for testing that
   * `wait: true` actually blocks the interpreter. */
  holdNextFinish(): () => void {
    let release!: () => void;
    this.nextFinished = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  async play(signal: string, opts: PlayOptions): Promise<PlaybackHandle> {
    this.calls.push({ signal, opts });
    const finished = this.nextFinished ?? Promise.resolve();
    this.nextFinished = null;
    return { finished };
  }
}

/** Collects every event a run logs, in order — the assertion surface for
 * the bundled-example fixture tests (spec §4.7). */
export class RecordingLogPort implements LogPort {
  readonly events: EngineEvent[] = [];

  log(event: EngineEvent): void {
    this.events.push(event);
  }
}

/** A ContextPort a test can drive by hand: set the snapshot once for a
 * constant scenario, or install a timeline for it to change over the
 * course of a run. Mirrors the shape of the real ManualContextProvider and
 * ScriptedContextProvider (src/runtime) without depending on that module —
 * engine/ stays self-contained per spec §4.1. */
export class FakeContextProvider implements ContextPort {
  private timeline: { at: number; snapshot: Omit<ContextSnapshot, 'at'> }[] = [];
  private current: Omit<ContextSnapshot, 'at'> = {};

  constructor(private readonly now: () => number) {}

  set(snapshot: Omit<ContextSnapshot, 'at'>): void {
    this.current = snapshot;
  }

  /** Registers a snapshot that becomes current once `now()` reaches `at`.
   * Entries are applied in the order their `at` has passed, latest wins. */
  scheduleAt(at: number, snapshot: Omit<ContextSnapshot, 'at'>): void {
    this.timeline.push({ at, snapshot });
    this.timeline.sort((a, b) => a.at - b.at);
  }

  async snapshot(): Promise<ContextSnapshot> {
    const nowMs = this.now();
    for (const entry of this.timeline) {
      if (entry.at <= nowMs) this.current = entry.snapshot;
    }
    return { at: nowMs, ...this.current };
  }
}
