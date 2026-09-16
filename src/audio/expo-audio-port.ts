import {
  createAudioPlayer,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";

import type { AudioPort, PlaybackHandle, PlayOptions } from "@/engine";

import type { AudioSourceRef } from "./types";

/** Longest a cue may keep a `wait: true` statement blocked when the player
 * never reports finishing. A lost Bluetooth route, a decode failure or a
 * suspended audio session can all mean `didJustFinish` simply never arrives;
 * before this bound, that stalled the night forever and, because release()
 * also waited on the same promise, held the wake lock, the keep-alive track
 * and the notification until the process died (architectural review A2 /
 * AR-09). Used only when the clip's own duration is unknown. */
const UNKNOWN_DURATION_TIMEOUT_MS = 60_000;

/** Added to a clip's real duration before giving up on its completion
 * callback, covering startup latency and rate changes. */
const COMPLETION_GRACE_MS = 5_000;

/** Longest release() waits for in-flight playback to settle before removing
 * players anyway. Teardown must always terminate. */
const RELEASE_TIMEOUT_MS = 10_000;

export type ExpoAudioPortOptions = {
  /** Reports a cue whose completion callback never arrived, so the run log
   * can record it. The night continues: a missing callback is not evidence
   * the sound failed, and ending a night over it would be worse than
   * carrying on. */
  onPlaybackTimeout?: (signal: string, waitedMs: number) => void;
};

/** The real AudioPort (spec §4.1/§5.1), backed by expo-audio. Constructed
 * with every signal already resolved (moniker -> AudioSourceRef, from
 * resolve.ts) — the engine only ever calls `play(moniker, ...)`.
 *
 * Kept thin and adapter-only, in the same spirit as ExpoFileSystemStore:
 * the interesting logic (resolution, caching) lives in plain functions
 * tested against fakes; this class just maps engine calls onto expo-audio's
 * imperative player API. */
export class ExpoAudioPort implements AudioPort {
  private players = new Map<string, AudioPlayer>();
  // Tracks each signal's most recent `finished` promise, so release() can
  // wait for a fire-and-forget play to actually finish before touching its
  // player — see release()'s doc comment for why that matters.
  private pendingFinishes = new Map<string, Promise<void>>();
  // Multiplies every future play()'s gain — the voice/sound interrupt (spec
  // §4.6) sets this below 1 for its hold window instead of touching the
  // engine's own gain math, which must stay unaware of this feature.
  private duckFactor = 1;
  // Signals duck() paused mid-playback, so undoDuck() resumes only those —
  // not every player that happens to be paused because it already finished.
  private duckedSignals = new Set<string>();
  // Set by release(). Resolves every outstanding and future wait at once, so
  // nothing can block teardown.
  private disposed = false;
  private disposeWaiters = new Set<() => void>();

  constructor(
    private readonly sources: Record<string, AudioSourceRef>,
    private readonly options: ExpoAudioPortOptions = {},
  ) {}

  /** Creates every player up front, during preflight.
   *
   * Players used to be created lazily at first play, which could be hours
   * into the night — by which time a URL signal resolved into the purgeable
   * cache root may no longer exist, and a decode failure surfaces in the
   * dark instead of before the user goes to sleep (architectural review
   * AR-09). Failures here are reported to the caller, which still has the
   * chance to refuse to start.
   */
  async preload(): Promise<void> {
    for (const signal of Object.keys(this.sources)) {
      this.playerFor(signal);
    }
  }

  private playerFor(signal: string): AudioPlayer {
    const existing = this.players.get(signal);
    if (existing) return existing;

    const source = this.sources[signal];
    if (source === undefined) {
      throw new Error(
        `Unresolved signal "${signal}" — it wasn't in the resolved signal map for this run.`,
      );
    }
    const player = createAudioPlayer(source);
    this.players.set(signal, player);
    return player;
  }

  async play(signal: string, opts: PlayOptions): Promise<PlaybackHandle> {
    const player = this.playerFor(signal);

    player.volume = opts.gain * this.duckFactor;
    player.setPlaybackRate(opts.rate);
    await player.seekTo(0);
    player.play();

    const finished = this.trackCompletion(signal, player, opts.rate);
    this.pendingFinishes.set(signal, finished);

    return { finished };
  }

  /** Resolves on the player's own completion callback, or on a bound derived
   * from the clip's duration, or on release — whichever comes first. Never
   * rejects: the interpreter treats `finished` as "stop waiting now", not as
   * a claim that the sound was heard. */
  private trackCompletion(
    signal: string,
    player: AudioPlayer,
    rate: number,
  ): Promise<void> {
    const timeoutMs = this.completionTimeoutFor(player, rate);

    return new Promise<void>((resolve) => {
      if (this.disposed) {
        resolve();
        return;
      }

      let settled = false;
      const settle = (timedOut: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription.remove();
        this.disposeWaiters.delete(onDispose);
        if (timedOut) this.options.onPlaybackTimeout?.(signal, timeoutMs);
        resolve();
      };

      const onDispose = () => settle(false);
      this.disposeWaiters.add(onDispose);

      const timer = setTimeout(() => settle(true), timeoutMs);

      const subscription = player.addListener(
        "playbackStatusUpdate",
        (status: AudioStatus) => {
          if (status.didJustFinish) settle(false);
        },
      );
    });
  }

  private completionTimeoutFor(player: AudioPlayer, rate: number): number {
    let durationMs = 0;
    try {
      // `duration` is seconds and is 0 until the player has loaded.
      durationMs = Math.max(0, player.duration * 1000);
    } catch {
      durationMs = 0;
    }
    if (durationMs <= 0) return UNKNOWN_DURATION_TIMEOUT_MS;
    const scaled = rate > 0 ? durationMs / rate : durationMs;
    return scaled + COMPLETION_GRACE_MS;
  }

  /** Releases every native player this port created. Call once the run
   * ends — the interpreter has no lifecycle hook for this itself (it just
   * stops calling play()), so it's the caller's job, same as constructing
   * this port in the first place.
   *
   * Waits for each player's most recent play() to actually finish first.
   * A script that ends right after a `wait: false` play (every bundled
   * example does this) would otherwise reach here while that play is still
   * in flight — removing (which pauses) a player mid-play cuts its audio
   * short and, on web, throws an unhandled AbortError from expo-audio's own
   * `media.play()` call, which we have no way to catch from here.
   *
   * That wait is bounded twice over: each completion promise has its own
   * timeout, and the whole wait gives up after RELEASE_TIMEOUT_MS. Teardown
   * that cannot terminate is worse than a clipped final note. */
  async release(): Promise<void> {
    const pending = [...this.pendingFinishes.values()];
    if (pending.length > 0) {
      await Promise.race([Promise.all(pending), delay(RELEASE_TIMEOUT_MS)]);
    }
    this.dispose();
  }

  /** Immediate, unconditional teardown: resolves every outstanding wait and
   * removes every player without waiting for anything. Used by release() and
   * available on its own for a hard stop. Idempotent. */
  dispose(): void {
    this.disposed = true;
    for (const waiter of [...this.disposeWaiters]) waiter();
    this.disposeWaiters.clear();
    for (const player of this.players.values()) {
      try {
        player.remove();
      } catch {
        // An already-removed or failed player must not block teardown.
      }
    }
    this.players.clear();
    this.pendingFinishes.clear();
    this.duckedSignals.clear();
  }

  /** Pauses every currently-playing signal and multiplies future plays'
   * gain by `factor` (default heavily attenuated, not muted — spec §4.6
   * says "lowers volume," not silences). Used by the voice/sound interrupt;
   * has no effect on the interpreter's own timing, which keeps running
   * underneath. */
  duck(factor: number): void {
    this.duckFactor = factor;
    for (const [signal, player] of this.players) {
      if (player.playing) {
        this.duckedSignals.add(signal);
        player.pause();
      }
    }
  }

  /** Reverses duck(): restores full-gain future plays and resumes only the
   * signals duck() actually paused mid-playback (not ones that had already
   * finished on their own). */
  undoDuck(): void {
    this.duckFactor = 1;
    for (const signal of this.duckedSignals) {
      this.players.get(signal)?.play();
    }
    this.duckedSignals.clear();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
