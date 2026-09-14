// LucidDream beta diagnostics ingest. Deployed by `npm run deploy:telemetry`
// with wrangler.telemetry.jsonc; see doc/plans/luciddream-beta-telemetry.md.
//
// POST /v1/events  { events: TelemetryEvent[] }  -> 202 { accepted }
// GET  /v1/health                                -> 200 { ok: true }
//
// There is deliberately no read endpoint: data is queried by the owner with
// `npm run telemetry:nights`, which goes through Wrangler's authenticated API.

import { COLUMNS, MAX_BODY_BYTES, toRow, validateBatch } from "./validate.js";

const INSERT = `INSERT OR IGNORE INTO events (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/v1/health" && request.method === "GET")
      return json({ ok: true });
    if (pathname !== "/v1/events") return json({ error: "not found" }, 404);
    if (request.method !== "POST")
      return json({ error: "method not allowed" }, 405);

    if (env.INGEST_TOKEN) {
      const expected = `Bearer ${env.INGEST_TOKEN}`;
      if (request.headers.get("authorization") !== expected) {
        return json({ error: "unauthorized" }, 401);
      }
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return json({ error: "too large" }, 413);
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "too large" }, 413);

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }

    const result = validateBatch(body);
    if (!result.ok) return json({ error: result.error }, 400);

    try {
      const receivedAt = Date.now();
      const statement = env.DB.prepare(INSERT);
      await env.DB.batch(
        result.events.map((event) =>
          statement.bind(...toRow(event, receivedAt)),
        ),
      );
    } catch {
      // Includes the D1 free-tier daily limit. The app keeps the events and
      // retries on 5xx.
      return json({ error: "storage unavailable" }, 503);
    }

    return json({ accepted: result.events.length }, 202);
  },
};
