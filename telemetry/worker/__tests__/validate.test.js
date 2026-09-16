import worker from "../index.js";
import {
  COLUMNS,
  DAILY_EVENT_QUOTA,
  MAX_EVENTS,
  projectPayload,
  toRow,
  validateBatch,
} from "../validate.js";

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
      installId: "install-1",
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
    // `bound` holds event inserts only; the quota statement is answered
    // separately so tests can assert on what was actually stored.
    const bound = [];
    const quotaTotal = options.quotaTotal ?? 1;
    return {
      bound,
      INGEST_TOKEN: options.token,
      DB: {
        prepare: (sql) => {
          const isQuota = String(sql).includes("ingest_quota");
          return {
            bind: (...values) =>
              isQuota
                ? {
                    first: async () =>
                      options.quotaFailing
                        ? Promise.reject(new Error("no quota table"))
                        : { events: quotaTotal },
                  }
                : (bound.push(values), values),
          };
        },
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

describe("payload projection", () => {
  it("keeps only known fields, dropping anything extra a client sent", () => {
    // The payload column used to hold the event exactly as received, so what
    // the database contained was decided by the sender rather than by this
    // schema (AR-16).
    const event = runEnd({
      secret: "should not be stored",
      run: {
        id: "run-1",
        startedAt: 1000,
        endedAt: 2000,
        somethingElse: "also not stored",
      },
    });

    const payload = JSON.parse(
      projectPayload(event) && JSON.stringify(projectPayload(event)),
    );

    expect(payload).not.toHaveProperty("secret");
    expect(payload.run).not.toHaveProperty("somethingElse");
    expect(payload.run.id).toBe("run-1");
    expect(payload.installId).toBe("install-1");
  });

  it("is what the stored row carries", () => {
    const event = runEnd({ secret: "nope" });
    const row = toRow(event, 123);
    const payload = row[COLUMNS.indexOf("payload")];

    expect(payload).not.toMatch(/nope/);
    expect(JSON.parse(payload).id).toBe("evt-1");
  });

  it("caps the number of phases it will store", () => {
    const event = runEnd({
      run: {
        id: "run-1",
        startedAt: 1000,
        phases: Array.from({ length: 50 }, (_, i) => ({
          label: `p${i}`,
          script: "s",
        })),
      },
    });

    expect(projectPayload(event).run.phases).toHaveLength(3);
  });
});

describe("batch identity", () => {
  it("refuses a batch mixing installations", () => {
    // One batch comes from one device; requiring it makes the per-install
    // quota meaningful.
    const result = validateBatch({
      events: [runEnd(), runEnd({ id: "evt-2", installId: "install-2" })],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/installId/);
  });

  it("reports the installation a valid batch belongs to", () => {
    const result = validateBatch({ events: [runEnd()] });

    expect(result.ok).toBe(true);
    expect(result.installId).toBe("install-1");
  });
});

describe("daily ingest quota", () => {
  function env(options = {}) {
    const bound = [];
    return {
      bound,
      DB: {
        prepare: (sql) => {
          const isQuota = String(sql).includes("ingest_quota");
          return {
            bind: (...values) =>
              isQuota
                ? {
                    first: async () => {
                      if (options.quotaFailing) throw new Error("no table");
                      return { events: options.quotaTotal ?? 1 };
                    },
                  }
                : (bound.push(values), values),
          };
        },
        batch: async () => [],
      },
    };
  }

  const post = (body) =>
    new Request("https://t.example/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("accepts a batch while the installation is under its quota", async () => {
    const e = env({ quotaTotal: 10 });
    const response = await worker.fetch(post({ events: [runEnd()] }), e);

    expect(response.status).toBe(202);
    expect(e.bound).toHaveLength(1);
  });

  it("refuses with 429 once the installation is over, so the app retries later", async () => {
    // A single misbehaving client must not exhaust the D1 free-tier daily
    // write allowance and silence everyone else's reports for the day.
    const e = env({ quotaTotal: DAILY_EVENT_QUOTA + 1 });
    const response = await worker.fetch(post({ events: [runEnd()] }), e);

    expect(response.status).toBe(429);
    expect(e.bound).toHaveLength(0);
  });

  it("still accepts reports when the quota table is unavailable", async () => {
    // The quota is a courtesy limit, not a gate; D1's own limits are the
    // backstop.
    const e = env({ quotaFailing: true });
    const response = await worker.fetch(post({ events: [runEnd()] }), e);

    expect(response.status).toBe(202);
    expect(e.bound).toHaveLength(1);
  });
});
