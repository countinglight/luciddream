import type { TelemetryConfig } from "./config";
import type { KeyValueStore, TelemetryEvent } from "./types";

/** What a delivery attempt achieved. `drop` means the server rejected the
 * batch as malformed, so retrying would never succeed. */
export type DeliveryResult = "sent" | "retry" | "drop";

export type Transport = (events: TelemetryEvent[]) => Promise<DeliveryResult>;

const OUTBOX_KEY = "luciddream.telemetry.outbox.v1";

export type OutboxOptions = {
  /** Oldest events are discarded beyond this, so a phone that never reaches
   * the network cannot grow the queue without bound. */
  maxEvents?: number;
  batchSize?: number;
};

/**
 * A persistent queue. Events are written to storage before any network
 * attempt, so a night that ends with the process dying still reports on the
 * next launch. Delivery is at-least-once; the backend deduplicates by id.
 */
export class Outbox {
  private readonly maxEvents: number;
  private readonly batchSize: number;
  private flushing: Promise<number> | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly transport: Transport,
    options: OutboxOptions = {},
  ) {
    this.maxEvents = options.maxEvents ?? 200;
    this.batchSize = options.batchSize ?? 50;
  }

  async pending(): Promise<TelemetryEvent[]> {
    try {
      const raw = await this.store.getItem(OUTBOX_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async save(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) await this.store.removeItem(OUTBOX_KEY);
    else await this.store.setItem(OUTBOX_KEY, JSON.stringify(events));
  }

  async clear(): Promise<void> {
    if (this.flushing) await this.flushing.catch(() => 0);
    await this.store.removeItem(OUTBOX_KEY);
  }

  async enqueue(event: TelemetryEvent): Promise<void> {
    // Serialise with an in-flight flush so its removal of sent events cannot
    // overwrite this addition.
    if (this.flushing) await this.flushing.catch(() => 0);
    const events = [...(await this.pending()), event];
    await this.save(events.slice(-this.maxEvents));
  }

  /** Sends queued events in batches until the queue is empty or a batch
   * needs retrying later. Returns the number of events delivered. */
  flush(): Promise<number> {
    if (!this.flushing) {
      this.flushing = this.flushOnce().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async flushOnce(): Promise<number> {
    let delivered = 0;
    for (;;) {
      const events = await this.pending();
      if (events.length === 0) return delivered;
      const batch = events.slice(0, this.batchSize);
      let result: DeliveryResult;
      try {
        result = await this.transport(batch);
      } catch {
        result = "retry";
      }
      if (result === "retry") return delivered;
      const sentIds = new Set(batch.map((event) => event.id));
      const remaining = (await this.pending()).filter(
        (event) => !sentIds.has(event.id),
      );
      await this.save(remaining);
      if (result === "sent") delivered += batch.length;
    }
  }
}

/** POSTs a batch to `<url>/v1/events`. Network failures, timeouts, 429 and
 * 5xx are retried later; any other non-2xx drops the batch. */
export function createHttpTransport(
  config: TelemetryConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Transport {
  return async (events) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${config.url}/v1/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
        },
        body: JSON.stringify({ events }),
        signal: controller.signal,
      });
      if (response.ok) return "sent";
      if (response.status === 429 || response.status >= 500) return "retry";
      return "drop";
    } catch {
      return "retry";
    } finally {
      clearTimeout(timer);
    }
  };
}
