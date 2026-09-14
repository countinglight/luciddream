import worker from "../index.js";
import { COLUMNS, MAX_EVENTS, toRow, validateBatch } from "../validate.js";

function runEnd(overrides = {}) {
  return {
    v: 1,
    id: "evt-1",
    type: "run.end",
    at: 2000,
    installId: "install-1",
    testerLabel: "Tester 1",
    device: {
      platform: "ios",
      osVersion: "19.1",
      model: "iPhone 15",
      manufacturer: "Apple",
    },
    app: {
      version: "0.5.1",
      build: "501012",
      updateId: null,
      channel: "testflight",
    },
    run: {
      id: "run-1",
      startedAt: 1000,
      endedAt: 2000,
      durationMs: 1000,
      endReason: "completed",
      playCount: 3,
      errorCount: 0,
    },
    ...overrides,
  };
}

describe("validateBatch", () => {
  it("accepts a well-formed batch", () => {
    expect(validateBatch({ events: [runEnd()] })).toEqual({
      ok: true,
      events: [runEnd()],
    });
  });

  it("rejects malformed input", () => {
    expect(validateBatch(null).ok).toBe(false);
    expect(validateBatch({ events: [] }).ok).toBe(false);
    expect(
      validateBatch({ events: new Array(MAX_EVENTS + 1).fill(runEnd()) }).ok,
    ).toBe(false);
    expect(validateBatch({ events: [runEnd({ v: 2 })] }).ok).toBe(false);
    expect(validateBatch({ events: [runEnd({ type: "page.view" })] }).ok).toBe(
      false,
    );
    expect(validateBatch({ events: [runEnd({ run: { id: "r" } })] }).ok).toBe(
      false,
    );
    expect(
      validateBatch({
        events: [
          runEnd({ run: { id: "r", startedAt: 1, endReason: "exploded" } }),
        ],
      }).ok,
    ).toBe(false);
  });

  it("accepts a crash without a run", () => {
    const crash = runEnd({
      type: "app.crash",
      run: undefined,
      error: { message: "TypeError", fatal: true },
    });
    expect(validateBatch({ events: [crash] }).ok).toBe(true);
    expect(toRow(crash, 5)[COLUMNS.indexOf("error_message")]).toBe("TypeError");
  });
});

describe("toRow", () => {
  it("maps an event onto the columns", () => {
    const row = toRow(runEnd(), 12345);
    expect(row).toHaveLength(COLUMNS.length);
    const byName = Object.fromEntries(COLUMNS.map((name, i) => [name, row[i]]));
    expect(byName).toMatchObject({
      id: "evt-1",
      received_at: 12345,
      type: "run.end",
      install_id: "install-1",
      tester_label: "Tester 1",
      model: "iPhone 15",
      app_build: "501012",
      run_id: "run-1",
      run_duration_ms: 1000,
      run_end_reason: "completed",
      play_count: 3,
    });
  });
});

describe("worker fetch", () => {
  function env(options = {}) {
    const bound = [];
    return {
      bound,
      INGEST_TOKEN: options.token,
      DB: {
        prepare: () => ({ bind: (...values) => (bound.push(values), values) }),
        batch: options.failing
          ? async () => {
              throw new Error("D1 limit");
            }
          : async () => [],
      },
    };
  }

  const post = (body, headers = {}) =>
    new Request("https://t.example/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("stores a valid batch", async () => {
    const e = env();
    const response = await worker.fetch(post({ events: [runEnd()] }), e);
    expect(response.status).toBe(202);
    expect(e.bound).toHaveLength(1);
  });

  it("enforces the token when one is configured", async () => {
    expect(
      (await worker.fetch(post({ events: [runEnd()] }), env({ token: "s" })))
        .status,
    ).toBe(401);
    const ok = await worker.fetch(
      post({ events: [runEnd()] }, { authorization: "Bearer s" }),
      env({ token: "s" }),
    );
    expect(ok.status).toBe(202);
  });

  it("answers 400 for bad input, 503 when storage fails, 404 elsewhere", async () => {
    expect((await worker.fetch(post("{nope"), env())).status).toBe(400);
    expect((await worker.fetch(post({ events: [] }), env())).status).toBe(400);
    expect(
      (await worker.fetch(post({ events: [runEnd()] }), env({ failing: true })))
        .status,
    ).toBe(503);
    expect(
      (await worker.fetch(new Request("https://t.example/"), env())).status,
    ).toBe(404);
    expect(
      (await worker.fetch(new Request("https://t.example/v1/health"), env()))
        .status,
    ).toBe(200);
  });
});
