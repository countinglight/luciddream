# LucidDream — beta diagnostics (telemetry)

Status: **implemented, dormant.** The app code, the ingest Worker and the database schema are in the
repository and tested. No build carries an endpoint yet, so the Settings section does not appear and
nothing is sent; no Cloudflare resource has been created. Switching it on is the owner's decision
(§7), and costs nothing at beta scale (§6).

Related: [luciddream-v1-spec.md](luciddream-v1-spec.md) §4.8,
[luciddream-ios-support-plan.md](luciddream-ios-support-plan.md),
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

While a night runs, a small summary is kept on disk (`src/telemetry/open-run.ts`) and refreshed at
most once a minute by engine events and every five minutes by a heartbeat, which covers long silent
waits. A clean end deletes it. If the next launch still finds it, the previous process died mid-run,
and its last refresh is reported as the end time: to within five minutes for a kill, and exactly the
moment iOS suspended the app if that is what happened, which is itself the evidence wanted.

A global JavaScript error handler records a fatal error to disk before React Native's default handler
ends the app; the next launch reports it. Native crashes leave no message; they appear as
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
- **Turning it off** deletes queued events and the on-disk run summary immediately.
- Script display names are sent because they say what a night did; the Settings text says so.
- The privacy page (`site/privacy/`) describes the feature; the iOS privacy manifest in `app.json`
  declares crash and diagnostic data, not linked to identity, not used for tracking.

## 5. Design — the backend

- **Worker** `luciddream-telemetry` (`telemetry/worker/index.js`, `wrangler.telemetry.jsonc`), custom
  domain `luciddream-telemetry.countinglight.com`. `POST /v1/events` validates and stores a batch;
  `GET /v1/health` answers ok. There is no read endpoint.
- **Optional ingest token**: when the Worker secret `INGEST_TOKEN` is set, requests must carry it. It
  ships inside the app, so it deters drive-by traffic rather than protecting anything.
- **D1 database** `luciddream-telemetry` with one `events` table and a `nights` view
  (`telemetry/schema.sql`): one row per night with tester, model, OS, build, start, end, hours, end
  reason, plays and errors.
- **Reading**: `npm run telemetry:nights` queries the view through Wrangler's authenticated API.

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

## 7. Switching it on (owner)

1. `npx wrangler@4.129.0 whoami` — confirm the account that owns `countinglight.com`.
2. `npx wrangler@4.129.0 d1 create luciddream-telemetry` and paste the printed `database_id` into
   `wrangler.telemetry.jsonc`.
3. `npm run telemetry:db:schema`.
4. Optional: `npx wrangler@4.129.0 secret put INGEST_TOKEN -c wrangler.telemetry.jsonc`.
5. `npm run deploy:telemetry` (refuses to run while the placeholder id is still there). Check
   `https://luciddream-telemetry.countinglight.com/v1/health`.
6. Give builds the endpoint: add `"env": { "EXPO_PUBLIC_TELEMETRY_URL":
"https://luciddream-telemetry.countinglight.com" }` to the `preview` and `production` profiles in
   `eas.json` (the `ios-testflight` profile inherits `production`). If a token was set, add
   `EXPO_PUBLIC_TELEMETRY_TOKEN` as an EAS environment variable rather than in the file.
7. Build and release as usual. Ask testers to turn on Settings > Beta diagnostics.
8. App Store Connect > App Privacy: declare Crash Data and Other Diagnostic Data, not linked to the
   user, not used for tracking.

`EXPO_PUBLIC_*` values are compiled into the JavaScript bundle. An OTA update published with
`npm run update:testflight` from a shell without them produces a bundle with diagnostics switched
off; set the same variables before publishing.

To switch it off again: remove the `env` entry and ship a build, or simply delete the Worker — the app
keeps retrying quietly within its 200-event cap.

## 8. Using the results

`npm run telemetry:nights` lists recent nights. Record anything that answers a request in
[doc/evidence/](../evidence/README.md) with source `telemetry` and the run id.

## 9. Limits

- Times are the phone's clock.
- An interrupted night's end time is its last refresh, not the moment of death.
- Native crash stacks are not captured (TestFlight has them for iOS).
- Events from a phone that never reconnects never arrive; a night shows a start without an end.
- Battery level is not reported yet; that needs `expo-battery` and is v2 plan F2.8.

## 10. Tests

`src/telemetry/__tests__/` covers the event flow, interrupted and crashed nights, opt-out withdrawal,
queue retry and caps, and HTTP status mapping. `telemetry/worker/__tests__/` covers request validation,
column mapping, token enforcement and error statuses.
