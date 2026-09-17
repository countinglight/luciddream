# LucidDream — diagnostics (telemetry)

Status (2026-09-16): **backend live, app builds not yet connected.** The ingest Worker and its
database were created and deployed on 2026-09-16 (§7.1). No app build carries the endpoint yet, so
the Settings section stays hidden and nothing is sent. Builds get the endpoint with the EAS build
work (§7.2). It costs nothing at beta scale (§6).

This is the single reference for everything diagnostics do, for testers and for the owner: what is
collected (§4), how the service works (§5), how to operate it (§7), and how to read and act on the
results (§8).

Related: [luciddream-v1-spec.md](luciddream-v1-spec.md) §4.8,
[luciddream-ios-support-plan.md](../archive/luciddream-ios-support-plan.md),
[doc/evidence/](../evidence/README.md). Process record with the full design detail, the options and
questions behind it, setup, smoke tests and operations:
[telemetry_session_091326.md](../dev_process/telemetry_session_091326.md).

---

## 1. The question

The field-evidence log ([v1-evidence.md](../evidence/v1-evidence.md)) keeps asking testers the same
things: who ran the app, on which phone and system, when a night started, what it did, whether it
crashed, when it ended and how long it ran. Diagnostics answer those from the phone itself, for iOS
and Android alike.

## 2. What the platforms already give

| Source                             | What it shows                                                                                                                                                                           | What it cannot show                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **TestFlight** (App Store Connect) | Per build and tester: sessions in the last 7 days, crash count, feedback with screenshots; crash reports with device model and iOS version. Tester identity is known for email invites. | When a night started or ended, how long it ran, whether it was killed by the OS without a crash, anything about Android. |
| **Android sideloaded APK**         | Nothing. Play Console vitals exist only for apps distributed through Play.                                                                                                              | Everything.                                                                                                              |
| **Run log export** (existing)      | The complete night, when a tester shares it.                                                                                                                                            | Anything the tester does not remember to send.                                                                           |

TestFlight covers crashes on iOS well and stays the source for native crash stacks. It cannot measure
runs, and there is no Android equivalent, so the app reports runs itself.

## 3. Options considered

| Option                                             | Verdict                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Shared OneDrive file**                           | Rejected. Writing to a personal OneDrive requires a signed-in Microsoft account through Microsoft Graph; app-only access and anonymous upload to a shared folder are not supported for personal OneDrive. The only workaround, shipping the owner's own token in the app, would hand anyone who unpacks the binary full access to that OneDrive. |
| **iCloud Drive file**                              | Rejected. An app's iCloud container belongs to each tester's own Apple ID, so there is no common place to collect from, and it does not exist on Android.                                                                                                                                                                                        |
| **Third-party SDK** (Sentry, Crashlytics, Bugsnag) | Deferred. Free tiers exist and native crash stacks are better, but each adds a native SDK, an external account and a larger privacy disclosure. Revisit if native crashes need diagnosing beyond TestFlight's reports.                                                                                                                           |
| **Own endpoint: Cloudflare Worker + D1**           | **Chosen.** Uses the Cloudflare account and Wrangler workflow the project already has, stores exactly the fields below, and fits the free plan.                                                                                                                                                                                                  |

The app talks to the backend through one small transport function (`src/telemetry/outbox.ts`), so
replacing the Worker later changes one file.

## 4. Design — the app

### 4.1 Events

Three event types, schema version 1 (`src/telemetry/types.ts`):

| Event       | When                                                 | Carries                                                                     |
| ----------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `run.start` | A night begins                                       | run id, start time, phase labels and script names                           |
| `run.end`   | A night ends, or the next launch finds it unfinished | end time, duration, end reason, play/event/error counts, last error message |
| `app.crash` | Next launch after a fatal JavaScript error           | error message                                                               |

Every event also carries: a random install id created on first use (not derived from any device
identifier), the optional tester name from Settings, platform, OS version, model and manufacturer
(`expo-device`), and app version, build number, OTA update id and channel.

End reasons: `completed`, `stopped`, `error` from the engine; `interrupted` when the process vanished
mid-night (OS kill, native crash, flat battery); `crashed` when a fatal JavaScript error was recorded
first.

### 4.2 Crash and kill detection without native code

**Interrupted nights** are detected by the night session itself, for every user, whether or not
diagnostics are on (`src/session/run-recovery.ts`). While a night runs, a small open-run marker is
kept on disk: rewritten at most once a minute as events arrive, and every five minutes by a heartbeat
through long silent waits. A clean end deletes it. If the next launch still finds it, the previous
process died mid-night: the night is closed as `interrupted` in Nights, and diagnostics, when on,
report a `run.end` from that result. The reported end time is the marker's last refresh.

Until 2026-09-16 diagnostics kept a second marker of their own. It was removed so there is one source
of truth, and so a user without diagnostics still sees an honest Nights screen.

**Crashes**: a global JavaScript error handler records a fatal error to disk before React Native's
default handler ends the app; the next launch reports it as `app.crash`, and a night open at the time
is reported as `crashed` rather than `interrupted`. Native crashes leave no message; they appear as
`interrupted` runs here and with stacks in TestFlight.

### 4.3 Delivery

Events are written to a persistent queue before any network attempt (`Outbox`). The queue is sent on
run start, run end, app launch and every return to the foreground, in batches of up to 50. Network
failures, 429 and 5xx keep the events for later; other rejections drop the batch. The queue holds at
most 200 events. The backend ignores duplicate event ids, so retries are safe.

### 4.4 Consent and privacy

- **Opt-in, off by default.** Settings > Beta diagnostics > Share night reports.
- **Invisible unless the build has an endpoint** (`EXPO_PUBLIC_TELEMETRY_URL`, HTTPS only). Web builds
  never send.
- **Never sent:** audio, microphone levels, run logs, signal files, script contents, context values,
  location, contacts, advertising or vendor identifiers, device name.
- **Turning it off** deletes queued events and any recorded fatal error immediately. The open-run
  marker is not deleted: it belongs to the night record, which works without diagnostics.
- **Error messages are redacted before they are queued** (`src/telemetry/redact.ts`). Web addresses
  (including `file://` and `content://`), file paths on any platform and email addresses become
  `<uri>`, `<path>` and `<email>`. Script names are kept. Messages are cut to 500 characters.
- Script display names are sent because they say what a night did; the Settings text says so.
- The privacy page (`site/privacy/`) describes the feature; the iOS privacy manifest in `app.json`
  declares crash and diagnostic data, not linked to identity, not used for tracking.

## 5. Design — the backend

**Worker** `luciddream-telemetry` (`telemetry/worker/index.js`, `wrangler.telemetry.jsonc`) at
`https://luciddream-telemetry.countinglight.com`.

| Endpoint          | Behaviour                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `GET /v1/health`  | `200 {"ok":true}`. No token needed.                                                                 |
| `POST /v1/events` | Body `{ "events": [...] }`, 1 to 50 events from one installation. `202 {"accepted": n}` on success. |
| anything else     | `404`. There is deliberately no read endpoint.                                                      |

- **Ingest token**: the Worker secret `INGEST_TOKEN` is set (2026-09-16). Requests must send
  `Authorization: Bearer <token>`, or get `401`. The token ships inside the app, so it keeps casual
  traffic out; it is not what protects the data. The owner holds the value; it is not in the
  repository.
- **Request limits**: a body over 64 KB gets `413`, checked against the declared length and again
  while reading, so an undeclared oversize body is never buffered whole. Malformed JSON or an invalid
  batch gets `400` with the reason.
- **Daily quota**: each installation may submit 2,000 events per UTC day (table `ingest_quota`).
  Beyond that the Worker answers `429`, which the app treats as "retry later", so events are kept,
  not lost. If the quota table is unavailable, reports are still accepted.
- **What is stored**: the columns of `events`, plus a `payload` copy built only from known fields.
  Anything else a client sends is discarded, so the database holds exactly what this document
  describes.
- **D1 database** `luciddream-telemetry` (`telemetry/schema.sql`): the `events` table, the
  `ingest_quota` table, and a `nights` view with one row per night: tester, model, OS, build, start,
  end, hours, end reason, plays and errors.

## 6. Cost

Everything fits the Cloudflare **Workers Free** plan, with no charge:

| Resource        | Free allowance    | Beta usage estimate                                           |
| --------------- | ----------------- | ------------------------------------------------------------- |
| Worker requests | 100,000 per day   | ~2–4 per tester per night                                     |
| D1 rows written | 100,000 per day   | ~3 per event (row plus two indexes): ~10 per tester per night |
| D1 rows read    | 5,000,000 per day | owner queries only                                            |
| D1 storage      | 5 GB              | well under 1 MB per thousand nights                           |

On the Free plan, exceeding a daily limit makes D1 refuse queries until 00:00 UTC; it does not bill.
The Worker then answers 503 and the app keeps the events and retries. Nothing in this design requires
the paid plan.

## 7. Operating the service (owner)

Every command uses the pinned Wrangler version. Run `npx wrangler@4.129.0 whoami` first and check the account before
changing anything.

### 7.1 Done on 2026-09-16

| Step                                                                       | Result                                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Account check                                                              | `vlad_sadovsky@hotmail.com`, account `c301845f3bc784a5dff389637a114c2b`                                  |
| `npx wrangler@4.129.0 d1 create luciddream-telemetry`                      | Database `c92165fc-434b-4915-a0f9-2e0b94e22ce7`, region WNAM; id committed in `wrangler.telemetry.jsonc` |
| `npm run telemetry:db:schema`                                              | `events`, `ingest_quota` and the `nights` view created                                                   |
| `npm run deploy:telemetry`                                                 | Worker version `8e667742-82e5-49f2-a10d-6431f7af3a9e` at the custom domain                               |
| `npx wrangler@4.129.0 secret put INGEST_TOKEN -c wrangler.telemetry.jsonc` | Set; value kept by the owner, not in the repository                                                      |
| Live checks                                                                | health `200`; no token `401`; empty batch with token `400`; unknown path `404`                           |

### 7.2 Still to do: connecting builds

1. Give builds the endpoint and token as EAS environment variables, not in `eas.json` and not in git:
   `EXPO_PUBLIC_TELEMETRY_URL=https://luciddream-telemetry.countinglight.com` and
   `EXPO_PUBLIC_TELEMETRY_TOKEN=<the token>`, for every profile testers install (preview, production,
   and `ios-testflight`, which inherits production).
2. Build and release. Testers turn on **Settings > Beta diagnostics > Share night reports**, and may
   fill in **Name shown with your reports**. The section appears only in builds with the endpoint.
3. App Store Connect > App Privacy: declare Crash Data and Other Diagnostic Data, not linked to the
   user, not used for tracking.

`EXPO_PUBLIC_*` values are compiled into the JavaScript bundle. An OTA update published with
`npm run update:testflight` from a shell without them produces a bundle with diagnostics switched off;
set the same variables before publishing.

### 7.3 Routine operations

| Task                               | How                                                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redeploy after changing the Worker | `npm run deploy:telemetry`. It refuses a placeholder database id and runs `whoami` first. Never run a bare `wrangler deploy`: the default configuration is the production web app.                                                                     |
| Change the schema                  | Edit `telemetry/schema.sql` (every statement must stay idempotent), run `npm run telemetry:db:schema`, and only then deploy a Worker that depends on it.                                                                                               |
| Rotate the token                   | Generate a new value, `npx wrangler@4.129.0 secret put INGEST_TOKEN -c wrangler.telemetry.jsonc`, update `EXPO_PUBLIC_TELEMETRY_TOKEN` in EAS and rebuild. Builds with the old token get `401` and keep their events queued (up to 200) until updated. |
| Remove the token                   | `npx wrangler@4.129.0 secret delete INGEST_TOKEN -c wrangler.telemetry.jsonc`. The Worker then accepts requests without one.                                                                                                                           |
| Check the service                  | `curl https://luciddream-telemetry.countinglight.com/v1/health`                                                                                                                                                                                        |
| Watch requests live                | `npx wrangler@4.129.0 tail luciddream-telemetry -c wrangler.telemetry.jsonc`                                                                                                                                                                           |
| Delete one tester's data           | `npx wrangler@4.129.0 d1 execute luciddream-telemetry --remote -c wrangler.telemetry.jsonc --command "DELETE FROM events WHERE install_id = 'INSTALL_ID'"`, and the same for `ingest_quota`                                                            |
| Delete all data                    | The same with `DELETE FROM events` and `DELETE FROM ingest_quota`                                                                                                                                                                                      |
| Switch it off                      | Remove the two EAS variables and ship a build, or delete the Worker. The app retries quietly within its 200-event cap and never shows an error.                                                                                                        |

## 8. Using the results

Reading goes through Wrangler's authenticated API; nothing public can read the data. An owner tool
with its own authentication is planned for v2 ([v2 plan](luciddream-v2-plan.md) F9.6).

In the table, `Q` stands for `npx wrangler@4.129.0 d1 execute luciddream-telemetry --remote -c wrangler.telemetry.jsonc --command`.

| Question                             | Command                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recent nights, one row each          | `npm run telemetry:nights`                                                                                                                                |
| Everything for one night             | `Q "SELECT type, datetime(at/1000,'unixepoch') AS at_utc, run_end_reason, error_message FROM events WHERE run_id = 'RUN_ID' ORDER BY at"`                 |
| Nights that did not end cleanly      | `Q "SELECT * FROM nights WHERE end_reason IN ('interrupted','crashed','error') ORDER BY started_utc DESC"`                                                |
| Crashes                              | `Q "SELECT datetime(at/1000,'unixepoch') AS at_utc, tester_label, model, app_build, error_message FROM events WHERE type = 'app.crash' ORDER BY at DESC"` |
| Nights per tester and device         | `Q "SELECT tester, model, platform, COUNT(*) AS nights FROM nights GROUP BY tester, model, platform"`                                                     |
| Installations near their daily quota | `Q "SELECT * FROM ingest_quota ORDER BY day DESC, events DESC LIMIT 20"`                                                                                  |

A night with a start and no end is still running, or on a phone that has not reconnected. Record
anything that answers a request in [doc/evidence/](../evidence/README.md) with source `telemetry` and
the run id.

**When something looks wrong**

| Symptom                  | Likely cause                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| No events at all         | The build lacks `EXPO_PUBLIC_TELEMETRY_URL`, or the tester has not turned on Share night reports. |
| `401` in `wrangler tail` | The build's token does not match the Worker secret.                                               |
| `429`                    | An installation passed 2,000 events in a day; its events are kept and retried the next day.       |
| `503`                    | D1 refused the write, usually the free-tier daily limit; the app retries.                         |

## 9. Limits

- Times are the phone's clock.
- An interrupted night's end time is the open-run marker's last refresh: within about a minute
  while events arrive, within five minutes during a long silent wait.
- Native crash stacks are not captured (TestFlight has them for iOS).
- Events from a phone that never reconnects never arrive; a night shows a start without an end.
- Battery level is not reported yet; that needs `expo-battery` and is v2 plan F2.8.

## 10. Tests

`src/telemetry/__tests__/` covers the event flow, interrupted and crashed nights reported from launch
recovery, opt-out withdrawal, queue retry and caps, HTTP status mapping, and message redaction.
`src/session/__tests__/run-recovery.test.ts` covers the open-run marker and interrupted-night
detection. `telemetry/worker/__tests__/` covers request validation, column mapping, payload
projection, token enforcement, the daily quota and error statuses.
