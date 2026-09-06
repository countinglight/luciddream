import {
    createAudioPlayer,
    type AudioPlayer,
    type AudioStatus,
} from "expo-audio";

import type { AudioPort, PlaybackHandle, PlayOptions } from "@/engine";

import type { AudioSourceRef } from "./types";

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

  constructor(private readonly sources: Record<string, AudioSourceRef>) {}

  async play(signal: string, opts: PlayOptions): Promise<PlaybackHandle> {
    const source = this.sources[signal];
    if (source === undefined) {
      throw new Error(
        `Unresolved signal "${signal}" — it wasn't in the resolved signal map for this run.`,
      );
    }

    let player = this.players.get(signal);
    if (!player) {
      player = createAudioPlayer(source);
      this.players.set(signal, player);
    }

    player.volume = opts.gain * this.duckFactor;
    player.setPlaybackRate(opts.rate);
    await player.seekTo(0);
    player.play();

    const finished = new Promise<void>((resolve) => {
      const subscription = player!.addListener(
        "playbackStatusUpdate",
        (status: AudioStatus) => {
          if (status.didJustFinish) {
            subscription.remove();
            resolve();
          }
        },
      );
    });
    this.pendingFinishes.set(signal, finished);

    return { finished };
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
   * `media.play()` call, which we have no way to catch from here. */
  async release(): Promise<void> {
    await Promise.all(this.pendingFinishes.values());
    for (const player of this.players.values()) {
      player.remove();
    }
    this.players.clear();
    this.pendingFinishes.clear();
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
