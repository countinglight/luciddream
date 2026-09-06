/**
 * The engine talks to the outside world only through these interfaces. This
 * is what keeps src/engine/ free of React/React Native/Expo imports (§4.1 of
 * the spec) — real implementations live in src/audio, src/runtime, etc.;
 * tests use fakes (see testing/).
 */

export type SleepStage = 'awake' | 'light' | 'deep' | 'rem';

export type ContextSnapshot = {
  at: number;
  hr?: number;
  hrv?: number;
  rem?: boolean;
  sleepStage?: SleepStage;
};

/** Live wearable/context data. v1 ships mock implementations only — see
 * testing/context-providers.ts and the spec's §4.3. */
export interface ContextPort {
  snapshot(): Promise<ContextSnapshot>;
}

/** Wall-clock time and cancellable sleeping. Real implementations use actual
 * timers; VirtualClock (testing/virtual-clock.ts) lets tests run an
 * eight-hour script in milliseconds, deterministically. */
export interface ClockPort {
  now(): number;
  /** Resolves after `ms` elapses, or as soon as `signal` aborts — whichever
   * comes first. Never rejects; the interpreter checks `signal.aborted`
   * afterwards to decide whether to keep going. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export type PlayOptions = {
  /** Effective gain after all enclosing scopes and the per-play override are
   * multiplied together, clamped to [0, 1]. */
  gain: number;
  /** Effective playback rate after all enclosing scopes and the per-play
   * override are multiplied together. */
  rate: number;
};

export type PlaybackHandle = {
  /** Resolves once playback completes. Ports that don't track playback
   * duration may resolve it immediately — the interpreter only awaits this
   * when the statement says `wait: true`. */
  finished: Promise<void>;
};

/** Audio playback, addressed by the moniker a script uses in `play:`. Real
 * implementations (src/audio) resolve monikers to actual files up front, at
 * run start — the engine never deals with URLs or file paths. */
export interface AudioPort {
  play(signal: string, opts: PlayOptions): Promise<PlaybackHandle>;
}

export type EngineEvent =
  | { type: 'run.start'; at: number; scriptName: string }
  | { type: 'run.stop'; at: number; reason: 'completed' | 'stopped' | 'error' }
  | { type: 'phase.start'; at: number; phaseIndex: number; phase: string; scriptName: string }
  | {
      type: 'phase.stop';
      at: number;
      phaseIndex: number;
      phase: string;
      scriptName: string;
      reason: 'completed' | 'stopped' | 'error';
    }
  | { type: 'play'; at: number; signal: string; gain: number; rate: number; wait: boolean }
  | { type: 'volume.changed'; at: number; volume: number }
  | { type: 'log'; at: number; message: string }
  | { type: 'context.unavailable'; at: number; field: string }
  | { type: 'error'; at: number; message: string };

/** Sink for every event the run produces — the source of the morning-after
 * log (spec §2.2/§4.7). Implementations should not throw; a logging failure
 * must never take down a run. */
export interface LogPort {
  log(event: EngineEvent): void;
}

export type RunDeps = {
  audio: AudioPort;
  clock: ClockPort;
  context: ContextPort;
  log: LogPort;
};
