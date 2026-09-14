-- LucidDream beta diagnostics (doc/plans/luciddream-beta-telemetry.md).
-- Apply with: npm run telemetry:db:schema
-- Safe to re-run; every statement is idempotent.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,            -- client-generated; retries are ignored
  received_at INTEGER NOT NULL,   -- ms since epoch, server clock
  type TEXT NOT NULL,             -- run.start | run.end | app.crash
  at INTEGER NOT NULL,            -- ms since epoch, phone clock
  install_id TEXT NOT NULL,
  tester_label TEXT,
  platform TEXT,
  os_version TEXT,
  model TEXT,
  manufacturer TEXT,
  app_version TEXT,
  app_build TEXT,
  update_id TEXT,
  channel TEXT,
  run_id TEXT,
  run_started_at INTEGER,
  run_ended_at INTEGER,
  run_duration_ms INTEGER,
  run_end_reason TEXT,            -- completed | stopped | error | interrupted | crashed
  play_count INTEGER,
  error_count INTEGER,
  error_message TEXT,
  payload TEXT NOT NULL           -- the event as received, for anything not in a column
);

CREATE INDEX IF NOT EXISTS events_run_id ON events (run_id);
CREATE INDEX IF NOT EXISTS events_at ON events (at);

-- One row per night: who, on what, when, for how long, and how it ended.
-- A night still running, or one whose phone never came back online, has no
-- end columns yet.
DROP VIEW IF EXISTS nights;
CREATE VIEW nights AS
SELECT
  s.run_id AS run_id,
  COALESCE(e.tester_label, s.tester_label) AS tester,
  s.install_id AS install_id,
  s.platform AS platform,
  s.model AS model,
  s.os_version AS os_version,
  s.app_version AS app_version,
  s.app_build AS app_build,
  datetime(s.run_started_at / 1000, 'unixepoch') AS started_utc,
  datetime(e.run_ended_at / 1000, 'unixepoch') AS ended_utc,
  ROUND(e.run_duration_ms / 3600000.0, 2) AS hours,
  e.run_end_reason AS end_reason,
  e.play_count AS plays,
  e.error_count AS errors,
  e.error_message AS error_message
FROM events s
LEFT JOIN events e ON e.run_id = s.run_id AND e.type = 'run.end'
WHERE s.type = 'run.start';
