import type { EngineEvent, LogPort } from '@/engine';
import type { FileStorePort } from '@/storage/file-store';

export function logPathFor(runId: string): string {
  return `logs/${runId}.jsonl`;
}

/** Writes a run's events to `documentDirectory/logs/<runId>.jsonl` (spec
 * §4.7/M4) — one JSON object per line, so the Log screen and any future
 * external tool can stream-parse it. Rewrites the whole file on every event
 * rather than truly appending: an overnight run produces at most a few
 * hundred short lines, and FileStorePort has no append primitive (§4.5's
 * file store was designed around whole-file signal/script content, not
 * incremental writes) — not worth adding one for this.
 *
 * Never throws, per the LogPort contract — a write failure is swallowed so
 * a full disk or a storage-permission hiccup can never take down a run. */
export class JsonlLogPort implements LogPort {
  private lines: string[] = [];
  // Chains every write onto the previous one so a burst of events can never
  // land out of order — without this, two overlapping writeText calls could
  // settle in reverse order and leave the file holding the shorter, staler
  // snapshot. Each chained step reads `this.lines` at execution time, not
  // enqueue time, so it always writes whatever has accumulated by then.
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly runId: string,
    private readonly fileStore: FileStorePort,
  ) {}

  log(event: EngineEvent): void {
    this.lines.push(JSON.stringify(event));
    this.writeQueue = this.writeQueue.then(() => this.flush()).catch(() => {});
  }

  private async flush(): Promise<void> {
    const content = this.lines.join('\n') + '\n';
    await this.fileStore.ensureDir('document', 'logs');
    await this.fileStore.writeText('document', logPathFor(this.runId), content);
  }
}
