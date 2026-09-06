export type VoiceInterruptEvent = 'trigger' | 'resume';

export type VoiceInterruptConfig = {
  /** dBFS threshold above which a sample counts as "loud." expo-audio's
   * metering ranges -160 (silence) to 0 (max) — a sustained sound near the
   * device is comfortably above -30 in practice. */
  thresholdDb: number;
  /** How long input must stay above `thresholdDb`, continuously, before it
   * counts as a real interrupt rather than a click or cough (spec §4.6:
   * "a sustained loud sound"). */
  sustainMs: number;
  /** How long after a trigger to keep playback ducked before resuming on
   * its own (spec §4.6: "then the run resumes on its own"). */
  holdMs: number;
};

export const DEFAULT_VOICE_INTERRUPT_CONFIG: VoiceInterruptConfig = {
  thresholdDb: -30,
  sustainMs: 1_500,
  holdMs: 15_000,
};

/** Pure state machine over a stream of (metering dB, timestamp) samples —
 * no expo-audio import here, so it's fully unit-testable without a mic.
 * `src/hooks/use-voice-interrupt.ts` is the only caller, feeding it real
 * `useAudioRecorder` status updates.
 *
 * Never emits a "stop": a level threshold can't tell a spoken "stop" apart
 * from snoring or a partner talking, so every trigger is the gentle
 * pause-and-lower action (spec §4.6) and `resume` always follows on a timer,
 * not on the sound going away. */
export class VoiceInterruptDetector {
  private loudSince: number | null = null;
  private triggeredAt: number | null = null;

  constructor(private readonly config: VoiceInterruptConfig = DEFAULT_VOICE_INTERRUPT_CONFIG) {}

  feed(meteringDb: number, atMs: number): VoiceInterruptEvent | null {
    if (this.triggeredAt !== null) {
      if (atMs - this.triggeredAt >= this.config.holdMs) {
        this.triggeredAt = null;
        this.loudSince = null;
        return 'resume';
      }
      return null;
    }

    if (meteringDb < this.config.thresholdDb) {
      this.loudSince = null;
      return null;
    }

    if (this.loudSince === null) {
      this.loudSince = atMs;
      return null;
    }

    if (atMs - this.loudSince >= this.config.sustainMs) {
      this.triggeredAt = atMs;
      return 'trigger';
    }

    return null;
  }
}
