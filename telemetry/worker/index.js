// LucidDream beta diagnostics ingest. Deployed by `npm run deploy:telemetry`
// with wrangler.telemetry.jsonc; see doc/plans/luciddream-telemetry.md.
//
// POST /v1/events  { events: TelemetryEvent[] }  -> 202 { accepted }
// GET  /v1/health                                -> 200 { ok: true }
//
// There is deliberately no read endpoint: data is queried by the owner with
// `npm run telemetry:nights`, which goes through Wrangler's authenticated API.

import {
  COLUMNS,
  DAILY_EVENT_QUOTA,
  MAX_BODY_BYTES,
  toRow,
  validateBatch,
} from "./validate.js";

const INSERT = `INSERT OR IGNORE INTO events (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`;

const COUNT_QUOTA = `INSERT INTO ingest_quota (install_id, day, events) VALUES (?, ?, ?)
  ON CONFLICT(install_id, day) DO UPDATE SET events = events + excluded.events
  RETURNING events`;

/**
 * Reads at most `maxBytes` from the request.
 *
 * `request.text()` buffers the whole body first and only then is its size
 * checked, so a client ignoring content-length could make the Worker hold an
 * arbitrarily large string before the check ran. Reading the stream with a cap
 * refuses it while it arrives (Codex "diagnostics security boundary").
 */
async function readBounded(request, maxBytes) {
  const reader = request.body?.getReader?.();
  if (!reader) {
    // Some runtimes (and the test harness) expose no readable stream. The
    // declared content-length has already been checked; re-check the actual
    // length so an undeclared oversize body is still refused.
    const text = await request.text();
    return text.length > maxBytes ? null : text;
  }

  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

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
    const raw = await readBounded(request, MAX_BODY_BYTES);
    if (raw === null) return json({ error: "too large" }, 413);

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }

    const result = validateBatch(body);
    if (!result.ok) return json({ error: result.error }, 400);

    const receivedAt = Date.now();

    // Per-install daily quota. Counted before the insert, so a client that
    // keeps retrying cannot keep writing while it is over.
    try {
      const day = new Date(receivedAt).toISOString().slice(0, 10);
      const quota = await env.DB.prepare(COUNT_QUOTA)
        .bind(result.installId, day, result.events.length)
        .first();
      if (quota && quota.events > DAILY_EVENT_QUOTA) {
        // 429 so the app keeps the events and retries another day rather than
        // dropping them.
        return json({ error: "daily quota reached" }, 429);
      }
    } catch {
      // A quota table that is missing or unavailable must not stop real
      // reports arriving; the D1 limits remain the backstop.
    }

    try {
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
