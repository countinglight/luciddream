// Request validation for the telemetry Worker, kept free of Workers APIs so
// Jest can test it. The event shape is src/telemetry/types.ts.

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_EVENTS = 50;

const EVENT_TYPES = new Set(["run.start", "run.end", "app.crash"]);
const END_REASONS = new Set([
  "completed",
  "stopped",
  "error",
  "interrupted",
  "crashed",
]);

export const COLUMNS = [
  "id",
  "received_at",
  "type",
  "at",
  "install_id",
  "tester_label",
  "platform",
  "os_version",
  "model",
  "manufacturer",
  "app_version",
  "app_build",
  "update_id",
  "channel",
  "run_id",
  "run_started_at",
  "run_ended_at",
  "run_duration_ms",
  "run_end_reason",
  "play_count",
  "error_count",
  "error_message",
  "payload",
];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value, max = 200) {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, max)
    : null;
}

function int(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function checkEvent(event, index) {
  if (!isObject(event)) return `events[${index}] is not an object`;
  if (event.v !== 1) return `events[${index}].v must be 1`;
  if (!text(event.id, 100)) return `events[${index}].id is required`;
  if (!EVENT_TYPES.has(event.type))
    return `events[${index}].type is not recognised`;
  if (int(event.at) === null) return `events[${index}].at must be a number`;
  if (!text(event.installId, 100))
    return `events[${index}].installId is required`;
  if (!isObject(event.device) || !isObject(event.app)) {
    return `events[${index}] needs device and app`;
  }
  if (event.type !== "app.crash") {
    if (
      !isObject(event.run) ||
      !text(event.run.id, 100) ||
      int(event.run.startedAt) === null
    ) {
      return `events[${index}].run needs id and startedAt`;
    }
    if (
      event.run.endReason !== undefined &&
      !END_REASONS.has(event.run.endReason)
    ) {
      return `events[${index}].run.endReason is not recognised`;
    }
  }
  return null;
}

/** @returns {{ ok: true, events: object[] } | { ok: false, error: string }} */
export function validateBatch(body) {
  if (!isObject(body) || !Array.isArray(body.events)) {
    return { ok: false, error: "body must be { events: [...] }" };
  }
  if (body.events.length === 0 || body.events.length > MAX_EVENTS) {
    return { ok: false, error: `events must hold 1-${MAX_EVENTS} items` };
  }
  for (let i = 0; i < body.events.length; i += 1) {
    const error = checkEvent(body.events[i], i);
    if (error) return { ok: false, error };
  }
  return { ok: true, events: body.events };
}

/** One validated event as values in COLUMNS order. */
export function toRow(event, receivedAt) {
  const run = isObject(event.run) ? event.run : {};
  const error = isObject(event.error) ? event.error : {};
  return [
    text(event.id, 100),
    receivedAt,
    event.type,
    int(event.at),
    text(event.installId, 100),
    text(event.testerLabel),
    text(event.device.platform, 20),
    text(event.device.osVersion, 40),
    text(event.device.model),
    text(event.device.manufacturer),
    text(event.app.version, 40),
    text(event.app.build, 40),
    text(event.app.updateId, 100),
    text(event.app.channel, 40),
    text(run.id, 100),
    int(run.startedAt),
    int(run.endedAt),
    int(run.durationMs),
    text(run.endReason, 20),
    int(run.playCount),
    int(run.errorCount),
    text(run.errorMessage ?? error.message, 500),
    JSON.stringify(event).slice(0, 8000),
  ];
}
