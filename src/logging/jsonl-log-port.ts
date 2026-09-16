import type { EngineEvent, LogPort } from "@/engine";
import type { FileStorePort } from "@/storage/file-store";

export function logPathFor(runId: string): string {
  return `logs/${runId}.jsonl`;
}

/** A durable sink that can say when its writes have settled, and whether any
 * were lost. The morning summary should not be finalised from a log that is
 * still being written (architectural review A5). */
export type DurableLogPort = LogPort & {
  drain(): Promise<void>;
  readonly writeFailures: number;
};

/**
 * Writes a run's events to `documentDirectory/logs/<runId>.jsonl` (spec
 * §4.7/M4) — one JSON object per line, so the Nights screen and any future
 * external tool can stream-parse it.
 *
 * Appends. The previous implementation held every line in memory and rewrote
 * the whole file on every event, which cost O(n^2) in total bytes written
 * over a night and, far worse, meant a process death during a rewrite could
 * truncate the entire night rather than lose its last line. It also made a
 * second port instance for an existing run overwrite it, which blocks
 * recovery records (AR-03 / A5 / v2 F2.2).
 *
 * Never throws, per the LogPort contract — a write failure must never take
 * down a run — but failures are counted rather than swallowed silently, so
 * the run can report that its record is incomplete.
 */
export class JsonlLogPort implements DurableLogPort {
  /** Lines accepted but not yet written. */
  private pending: string[] = [];
  /** Chains every write onto the previous one so records can never land out
   * of order. Each step drains whatever has accumulated by the time it runs,
   * so a burst of events costs one append, not one per event. */
  private writeQueue: Promise<void> = Promise.resolve();
  private failures = 0;
  private directoryReady = false;

  constructor(
    private readonly runId: string,
    private readonly fileStore: FileStorePort,
  ) {}

  log(event: EngineEvent): void {
    this.pending.push(JSON.stringify(event));
    this.writeQueue = this.writeQueue.then(() => this.flush());
  }

  /** Resolves once everything logged so far has been written, or failed. */
  async drain(): Promise<void> {
    await this.writeQueue;
  }

  /** How many records could not be written. Non-zero means this night's
   * record is incomplete, which the morning report should say rather than
   * quietly showing a short log. */
  get writeFailures(): number {
    return this.failures;
  }

  private async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    const content = batch.map((line) => `${line}\n`).join("");

    try {
      if (!this.directoryReady) {
        await this.fileStore.ensureDir("document", "logs");
        this.directoryReady = true;
      }
      await this.fileStore.appendText(
        "document",
        logPathFor(this.runId),
        content,
      );
    } catch {
      // Counted, not rethrown: a full disk must not end the night.
      this.failures += batch.length;
    }
  }
}
