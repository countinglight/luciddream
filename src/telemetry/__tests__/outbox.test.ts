import { createHttpTransport, Outbox, type DeliveryResult } from "../outbox";
import { MemoryStore } from "../testing/memory-store";
import type { TelemetryEvent } from "../types";

function event(id: string): TelemetryEvent {
  return {
    v: 1,
    id,
    type: "run.start",
    at: 1,
    installId: "install",
    device: {
      platform: "android",
      osVersion: "15",
      model: "Pixel 8",
      manufacturer: "Google",
    },
    app: {
      version: "0.5.1",
      build: "501001",
      updateId: null,
      channel: "preview",
    },
  };
}

describe("Outbox", () => {
  it("keeps events until they are delivered", async () => {
    const store = new MemoryStore();
    const results: DeliveryResult[] = ["retry", "sent"];
    const batches: string[][] = [];
    const outbox = new Outbox(store, async (events) => {
      batches.push(events.map((e) => e.id));
      return results.shift() ?? "sent";
    });
    await outbox.enqueue(event("a"));
    await outbox.enqueue(event("b"));

    expect(await outbox.flush()).toBe(0);
    expect((await outbox.pending()).map((e) => e.id)).toEqual(["a", "b"]);

    expect(await outbox.flush()).toBe(2);
    expect(await outbox.pending()).toEqual([]);
    expect(batches).toEqual([
      ["a", "b"],
      ["a", "b"],
    ]);
  });

  it("sends in batches and drops rejected batches", async () => {
    const store = new MemoryStore();
    const results: DeliveryResult[] = ["drop", "sent"];
    const outbox = new Outbox(store, async () => results.shift() ?? "sent", {
      batchSize: 2,
    });
    for (const id of ["a", "b", "c"]) await outbox.enqueue(event(id));

    expect(await outbox.flush()).toBe(1);
    expect(await outbox.pending()).toEqual([]);
  });

  it("treats a throwing transport as retry", async () => {
    const outbox = new Outbox(new MemoryStore(), async () => {
      throw new Error("offline");
    });
    await outbox.enqueue(event("a"));
    expect(await outbox.flush()).toBe(0);
    expect(await outbox.pending()).toHaveLength(1);
  });

  it("caps the queue, discarding the oldest", async () => {
    const outbox = new Outbox(new MemoryStore(), async () => "retry", {
      maxEvents: 2,
    });
    for (const id of ["a", "b", "c"]) await outbox.enqueue(event(id));
    expect((await outbox.pending()).map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("clears on request", async () => {
    const outbox = new Outbox(new MemoryStore(), async () => "retry");
    await outbox.enqueue(event("a"));
    await outbox.clear();
    expect(await outbox.pending()).toEqual([]);
  });
});

describe("createHttpTransport", () => {
  const config = { url: "https://telemetry.example", token: "t0ken" };

  it("posts the batch with the token and maps statuses", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const statuses = [202, 503, 429, 400];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const status = statuses.shift() ?? 200;
      return { ok: status >= 200 && status < 300, status } as Response;
    }) as unknown as typeof fetch;
    const transport = createHttpTransport(config, fetchImpl);

    expect(await transport([event("a")])).toBe("sent");
    expect(await transport([event("a")])).toBe("retry");
    expect(await transport([event("a")])).toBe("retry");
    expect(await transport([event("a")])).toBe("drop");

    expect(calls[0].url).toBe("https://telemetry.example/v1/events");
    expect(calls[0].init.headers).toMatchObject({
      authorization: "Bearer t0ken",
    });
    expect(JSON.parse(String(calls[0].init.body)).events[0].id).toBe("a");
  });

  it("retries after a network failure", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await createHttpTransport(config, fetchImpl)([event("a")])).toBe(
      "retry",
    );
  });
});
