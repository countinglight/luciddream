# Telemetry Session — 2026-09-13 — LucidDream beta diagnostics

Process record for the opt-in beta diagnostics ("telemetry") added in commit `d000d93` on
`v1-redesign`. It keeps the request, the questions and answers, the options weighed, every design
detail as implemented, and the full setup and operations procedure. The settled design lives in
[`doc/plans/luciddream-telemetry.md`](../plans/luciddream-telemetry.md); this document is
the long form behind it.

> **Later status (2026-09-16):** the service described here was created and deployed, and has since
> been hardened. This record describes the session of 2026-09-13 as it was. For the current state
> see [luciddream-telemetry.md](../plans/luciddream-telemetry.md).

Status at the end of the session: **implemented, tested, committed, dormant.** No build carries an
endpoint, no Cloudflare resource exists, nothing is sent.

---

## 1. How the work came about

### 1.1 The trigger

Reviewing whether v1 could be declared a success produced a set of questions only testers could
answer ([`doc/evidence/v1-evidence.md`](../evidence/v1-evidence.md), R-001 to R-008): which platform
and build the two 8-hour nights ran on, whether the screen was off, battery drain, whether voice
interrupt was used, whether an iPhone survived a locked night, which path produced the TestFlight
build. The owner wanted to stop depending on testers' memory.

### 1.2 The requests, in order

| #   | Owner's request (paraphrased closely)                                                                                                                                                                                                                                                                                                               | Effect on the work                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Investigate whether, with TestFlight, the app run log could be recorded into a well-known location (OneDrive or a web service): when started, what was done, crashes, when ended — to short-circuit "who, on which iPhone, when, how long". If no easy way, design around a shared file (OneDrive or iCloud Drive first), then a telemetry backend. | Investigation of platform abilities and storage options (§2, §3). |
| 2   | Implement telemetry equally for iOS and Android if the platforms give no such ability for test apps.                                                                                                                                                                                                                                                | Implementation scope became both platforms (§4, §5).              |
| 3   | Fix README and other docs encountered along the way.                                                                                                                                                                                                                                                                                                | Docs updated with the code (§9).                                  |
| 4   | "Is D1 a free service? If not, let me think and review; I do not want to introduce extra cost yet. OneDrive is free to me."                                                                                                                                                                                                                         | Cost verified (§6); design kept free and nothing created.         |
| 5   | "Still build such an opt-in telemetry, but we may not enable it right away if extra costs are involved."                                                                                                                                                                                                                                            | Feature shipped **dormant**: code in, endpoint out, no resources. |
| 6   | "Make the iOS build very polished and robust." (same session, broader)                                                                                                                                                                                                                                                                              | iOS review pass, recorded in the iOS support plan Part J.         |
| 7   | Capture all telemetry details — design, details, setup — in `doc/dev_process`.                                                                                                                                                                                                                                                                      | This document.                                                    |

---

## 2. What the platforms already provide

Checked against Apple's App Store Connect documentation and general platform knowledge.

| Source                             | Provides                                                                                                                                                                                                                                                                 | Does not provide                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **TestFlight / App Store Connect** | Per build: sessions in the last 7 days, crash count, feedback count; per tester engagement sorting; feedback with screenshots filterable by device and OS; crash reports with device model and iOS version (also in Xcode Organizer). Tester identity for email invites. | Night start or end, duration, OS kills that are not crashes, anything tied to a run, anything Android. |
| **Android sideloaded APK**         | Nothing. Play Console Android vitals apply only to Play-distributed apps.                                                                                                                                                                                                | Everything.                                                                                            |
| **App's own run log export**       | The complete night, if the tester shares it through the share sheet.                                                                                                                                                                                                     | Anything the tester forgets or does not bother to send.                                                |

**Conclusion:** no platform answers "who ran which build on which phone, when, for how long, how it
ended" for both platforms. Per request 2, the app reports it itself.

---

## 3. Options considered for where reports go

| Option                                                      | Findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Verdict                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Shared OneDrive folder**                                  | Uploading to a personal OneDrive goes through Microsoft Graph and needs a delegated, signed-in Microsoft account. App-only authentication fails for personal OneDrive ("Tenant does not have a SPO license"), and anonymous upload to a shared-folder link is not supported. The only way to make every tester's app write to the owner's OneDrive would be to embed the owner's OAuth refresh token in the app, and anyone who unpacks the binary would then have full access to that OneDrive. | **Rejected** on security grounds, despite being free to the owner.               |
| **iCloud Drive file**                                       | An app's iCloud container belongs to the Apple ID signed in on each phone. Testers' files land in their own iCloud; there is no common folder the developer can read. No Android equivalent.                                                                                                                                                                                                                                                                                                     | **Rejected**: cannot collect across testers.                                     |
| **Tester shares the run log**                               | Already exists. Manual, depends on the tester.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Kept** as fallback, not a solution.                                            |
| **Third-party SDK** (Sentry, Firebase Crashlytics, Bugsnag) | Free tiers exist; native crash stacks and release-health sessions out of the box. Each adds a native SDK and rebuild, an external account and DSN or config file, and a larger privacy disclosure.                                                                                                                                                                                                                                                                                               | **Deferred**: revisit if native crashes need stacks beyond TestFlight's reports. |
| **Own endpoint: Cloudflare Worker + D1**                    | The project already runs Cloudflare Workers with checked-in Wrangler configs and npm deploy scripts. A Worker plus a D1 database stores exactly the chosen fields, has no read endpoint, and fits the free plan (§6).                                                                                                                                                                                                                                                                            | **Chosen.**                                                                      |

The app reaches the backend only through one `Transport` function
([`src/telemetry/outbox.ts`](../../src/telemetry/outbox.ts)), so a different backend means replacing
`createHttpTransport` and nothing else.

---

## 4. App-side design, as implemented

### 4.1 File map

| File                                                                                   | Role                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`src/telemetry/types.ts`](../../src/telemetry/types.ts)                               | Wire format (schema v1), `KeyValueStore` interface, text limits and `truncate`.                   |
| [`src/telemetry/config.ts`](../../src/telemetry/config.ts)                             | Reads the build-time endpoint; returns null on web, without a URL, or for non-HTTPS URLs.         |
| [`src/telemetry/device-info.ts`](../../src/telemetry/device-info.ts)                   | Device and app facts through `expo-device`, `expo-constants`, `expo-updates`; every read guarded. |
| [`src/telemetry/run-tracker.ts`](../../src/telemetry/run-tracker.ts)                   | Pure fold of engine events into counts and run summaries.                                         |
| [`src/telemetry/open-run.ts`](../../src/telemetry/open-run.ts)                         | On-disk open-run marker and last-fatal record.                                                    |
| [`src/telemetry/outbox.ts`](../../src/telemetry/outbox.ts)                             | Persistent queue and the HTTP transport.                                                          |
| [`src/telemetry/telemetry.ts`](../../src/telemetry/telemetry.ts)                       | The `Telemetry` class: preferences, install id, lifecycle, serialised storage work.               |
| [`src/telemetry/index.ts`](../../src/telemetry/index.ts)                               | App-wide singleton and `installGlobalErrorHandler`.                                               |
| [`src/telemetry/testing/memory-store.ts`](../../src/telemetry/testing/memory-store.ts) | In-memory store for tests.                                                                        |
| [`src/hooks/use-telemetry.ts`](../../src/hooks/use-telemetry.ts)                       | Syncs Settings to the singleton, recovers once per launch, flushes on foreground.                 |
| [`src/hooks/use-session.ts`](../../src/hooks/use-session.ts)                           | Calls `runStarted`, `observe`, `runEnded`; five-minute heartbeat while running.                   |
| [`src/context/session-context.tsx`](../../src/context/session-context.tsx)             | Mounts `useTelemetryLifecycle`.                                                                   |
| [`src/app/_layout.tsx`](../../src/app/_layout.tsx)                                     | Installs the global error handler at module load.                                                 |
| [`src/lib/settings.ts`](../../src/lib/settings.ts)                                     | `diagnostics: { enabled, testerLabel }`, default `{ false, "" }`, merged on load.                 |
| [`src/app/settings.tsx`](../../src/app/settings.tsx)                                   | "Beta diagnostics" section, rendered only when `telemetry.available`.                             |

### 4.2 Wire format (schema version 1)

```ts
type TelemetryEvent = {
  v: 1;
  id: string; // unique per event; backend ignores duplicates
  type: "run.start" | "run.end" | "app.crash";
  at: number; // ms since epoch, phone clock
  installId: string; // random, created on first use
  testerLabel?: string; // optional name typed in Settings
  device: {
    platform: string;
    osVersion: string | null;
    model: string | null;
    manufacturer: string | null;
  };
  app: {
    version: string | null;
    build: string | null;
    updateId: string | null;
    channel: string | null;
  };
  run?: {
    id: string;
    startedAt: number;
    endedAt?: number;
    durationMs?: number;
    endReason?: "completed" | "stopped" | "error" | "interrupted" | "crashed";
    lastSeenAt?: number;
    phases?: { label: string; script: string }[];
    playCount?: number;
    eventCount?: number;
    errorCount?: number;
    errorMessage?: string;
  };
  error?: { message: string; fatal: boolean };
};
```

| Field                                       | Source                                                       | Notes                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `id`, `installId`                           | `randomId()`: base-36 timestamp plus two random segments     | Not `crypto.randomUUID`, which Hermes does not guarantee. Install id stored under `luciddream.telemetry.installId.v1`. |
| `device.platform`                           | `Platform.OS`                                                | `ios` or `android`; web never sends.                                                                                   |
| `device.osVersion`, `model`, `manufacturer` | `expo-device` `osVersion`, `modelName`, `manufacturer`       | No device name, serial, IDFV or advertising id.                                                                        |
| `app.version`                               | `Constants.expoConfig.version`                               | From `package.json` through `app.config.js`.                                                                           |
| `app.build`                                 | `expoConfig.ios.buildNumber` / `android.versionCode`         | The computed build number (`scripts/build-number.js`).                                                                 |
| `app.updateId`, `channel`                   | `expo-updates`                                               | Null for embedded bundles and development.                                                                             |
| `run.phases`                                | Phase label and script display name for each populated phase | Script names are user-visible labels; the Settings text says they are sent.                                            |
| `run.*Count`                                | `RunTracker`                                                 | `eventCount` counts every engine event, including `run.start` and `run.stop`.                                          |
| `run.errorMessage` / `error.message`        | Last engine error, or the fatal JS error                     | Truncated to 500 characters.                                                                                           |

All other strings are truncated to 200 characters with an ellipsis.

**Event types and when they are produced:**

| Event                                 | Produced by                                                          | `at`              |
| ------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| `run.start`                           | `runStarted`, right after the run is recorded in the local run index | run start         |
| `run.end` (normal)                    | `runEnded`, from the engine's `run.stop`                             | engine stop time  |
| `run.end` (`interrupted` / `crashed`) | `recoverAfterLaunch` on the next launch                              | last-seen time    |
| `app.crash`                           | `recoverAfterLaunch`, when a fatal JS error was recorded             | time of the error |

### 4.3 Lifecycle

```
app launch
  _layout.tsx         installGlobalErrorHandler()
  SettingsProvider    settings load
  SessionProvider     useTelemetryLifecycle(diagnostics, isLoaded)
                        configure(enabled, testerLabel)
                        recoverAfterLaunch()   once per process
                        flush() on every AppState "active"

Begin pressed (use-session.ts)
  preflight, resolve signals
  persistRunStart()                     local run index
  telemetry.runStarted(id, start, phases)
      if not active: nothing
      tracker = new RunTracker
      write open-run marker
      enqueue run.start, flush
  every engine event -> telemetry.observe(event)
      tracker counts; marker refresh if >= 60 s since last write
  every 5 min while running -> telemetry.heartbeat()   marker refresh
  engine run.stop -> telemetry.runEnded(at, reason)
      enqueue run.end, delete marker, flush
```

Every storage and delivery step runs through one promise chain (`serial`), so a heartbeat write that
was queued before `runEnded` cannot recreate the marker afterwards: the write checks that its tracker
is still the current one.

### 4.4 Crash and kill detection

- **Open-run marker** (`luciddream.telemetry.openRun.v1`): the run summary including `lastSeenAt`.
  Written at start, refreshed by events (at most once a minute) and by the heartbeat (every five
  minutes, which covers long `wait` statements that produce no events), deleted at a clean end.
- **Last fatal** (`luciddream.telemetry.lastFatal.v1`): written by the global JS error handler when
  `isFatal` is true, before React Native's previous handler runs. Non-fatal errors are ignored. The
  write is asynchronous and best effort; the process may die before it completes.
- **On the next launch** `recoverAfterLaunch` reads and deletes both records, then, only if
  diagnostics are active:
  - a last-fatal record becomes an `app.crash` event;
  - a marker becomes a `run.end` with `endedAt = lastSeenAt`, `durationMs = lastSeenAt - startedAt`,
    and `endReason` `crashed` if a fatal error was recorded at or after the run started, otherwise
    `interrupted` (OS kill, native crash, flat battery, iOS suspension that ended in termination).
- **Precision:** an interrupted night's end time is within five minutes of the last moment the app
  was alive. If iOS suspends the app during a long wait, `lastSeenAt` is the suspension time — the
  exact failure the iOS support plan D4 worries about.
- **Native crashes** leave no message; they appear as `interrupted`. TestFlight keeps the stacks on
  iOS.

### 4.5 Delivery

| Parameter      | Value                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Queue key      | `luciddream.telemetry.outbox.v1` (AsyncStorage)                                                                           |
| Queue cap      | 200 events; the oldest are discarded beyond it                                                                            |
| Batch size     | 50 events                                                                                                                 |
| Request        | `POST <url>/v1/events`, JSON `{ "events": [...] }`, `authorization: Bearer <token>` when a token is configured            |
| Timeout        | 15 s (AbortController)                                                                                                    |
| Flush points   | after `run.start`, after `run.end`, after launch recovery, every return to foreground, on preference change while enabled |
| Result mapping | 2xx sent; 429, 5xx, network error, timeout: keep and retry later; any other status (400, 401, 404, 413): drop the batch   |

Events are persisted before any network attempt. Delivery is at least once; the server's
`INSERT OR IGNORE` on the event id makes retries harmless. A 401 drops the batch on purpose: a wrong
token will not fix itself, and a growing queue would only waste storage.

### 4.6 Consent, visibility and opt-out

- `telemetry.available` is true only when `readTelemetryConfig()` returns a config: not web, and
  `EXPO_PUBLIC_TELEMETRY_URL` present and starting with `https://`.
- Settings > **Beta diagnostics** is rendered only when available. It holds a "Share night reports"
  switch (default off), an explanation of what is sent, and, when on, an optional "Your name" field
  (60 characters).
- `telemetry.active` = available and switched on. Every public method is a no-op otherwise.
- Switching off deletes the queue, the open-run marker and the last-fatal record immediately.
- A run that starts while diagnostics are off is never tracked, even if they are switched on
  mid-run.

### 4.7 Build-time configuration

| Variable                      | Required       | Meaning                                                   |
| ----------------------------- | -------------- | --------------------------------------------------------- |
| `EXPO_PUBLIC_TELEMETRY_URL`   | yes, to enable | Worker base URL, HTTPS, no trailing slash needed          |
| `EXPO_PUBLIC_TELEMETRY_TOKEN` | no             | Must match the Worker secret `INGEST_TOKEN` if one is set |

`process.env.EXPO_PUBLIC_*` is inlined into the JavaScript bundle at bundle time, and only when
written out literally, which is why `readTelemetryConfig`'s default argument spells both names. Two
consequences:

- **EAS builds** take them from the `env` of the build profile in `eas.json` or from EAS environment
  variables.
- **OTA updates** (`npm run update:testflight`) bundle on the machine that publishes. Publishing from
  a shell without the variables ships a bundle with diagnostics unavailable. Set them in the shell
  first.

The ingest token ships inside the app and can be extracted. It deters drive-by posts; it is not a
secret and protects nothing of value.

---

## 5. Backend design, as implemented

### 5.1 Files

| File                                                                           | Role                                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [`telemetry/worker/index.js`](../../telemetry/worker/index.js)                 | Worker entry point.                                                                     |
| [`telemetry/worker/validate.js`](../../telemetry/worker/validate.js)           | Validation and row mapping, free of Workers APIs so Jest can test it.                   |
| [`telemetry/schema.sql`](../../telemetry/schema.sql)                           | D1 table, indexes, `nights` view. Idempotent.                                           |
| [`wrangler.telemetry.jsonc`](../../wrangler.telemetry.jsonc)                   | Worker `luciddream-telemetry`, custom domain, D1 binding `DB`, placeholder database id. |
| [`scripts/check-telemetry-config.js`](../../scripts/check-telemetry-config.js) | Refuses deployment while the placeholder id is present.                                 |

### 5.2 HTTP contract

| Request                                                     | Response                                   |
| ----------------------------------------------------------- | ------------------------------------------ |
| `GET /v1/health`                                            | `200 {"ok":true}`                          |
| `POST /v1/events` with a valid batch                        | `202 {"accepted": n}`                      |
| Missing or wrong `authorization` when `INGEST_TOKEN` is set | `401`                                      |
| `content-length` or body over 64 KiB                        | `413`                                      |
| Body not JSON                                               | `400 {"error":"invalid JSON"}`             |
| Batch fails validation                                      | `400 {"error": "<first problem>"}`         |
| D1 insert fails (including free-tier daily limit)           | `503` — the app keeps the events           |
| Any other path                                              | `404`; other method on `/v1/events`: `405` |

All responses carry `content-type: application/json` and `cache-control: no-store`. There is
deliberately **no read endpoint**; the owner reads through Wrangler's authenticated D1 API.

### 5.3 Validation rules

- Body is an object with `events`, an array of 1–50 items.
- Each event: object; `v === 1`; `id` non-empty string; `type` one of the three event types; `at`
  finite number; `installId` non-empty string; `device` and `app` objects.
- `run.start` and `run.end` need `run.id` and a numeric `run.startedAt`; `run.endReason`, when
  present, is one of the five reasons. `app.crash` needs no run.
- The first failure is reported and the whole batch is rejected.

### 5.4 Storage

`events` table, one row per event (`INSERT OR IGNORE`, primary key `id`):

| Column                                                                          | From                                  | Limit                     |
| ------------------------------------------------------------------------------- | ------------------------------------- | ------------------------- |
| `id`                                                                            | `event.id`                            | 100                       |
| `received_at`                                                                   | Worker clock, ms                      | —                         |
| `type`, `at`                                                                    | event                                 | —                         |
| `install_id`                                                                    | `installId`                           | 100                       |
| `tester_label`                                                                  | `testerLabel`                         | 200                       |
| `platform`, `os_version`, `model`, `manufacturer`                               | `device.*`                            | 20, 40, 200, 200          |
| `app_version`, `app_build`, `update_id`, `channel`                              | `app.*`                               | 40, 40, 100, 40           |
| `run_id`, `run_started_at`, `run_ended_at`, `run_duration_ms`, `run_end_reason` | `run.*`                               | 100 for id, 20 for reason |
| `play_count`, `error_count`                                                     | `run.*`                               | integers                  |
| `error_message`                                                                 | `run.errorMessage` or `error.message` | 500                       |
| `payload`                                                                       | the whole event as JSON               | 8,000 characters          |

Indexes on `run_id` and `at`. The `nights` view joins each `run.start` with its `run.end`:

| Column                                                        | Meaning                                               |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `run_id`, `install_id`                                        | identifiers                                           |
| `tester`                                                      | tester label from the end event, else the start event |
| `platform`, `model`, `os_version`, `app_version`, `app_build` | from the start event                                  |
| `started_utc`, `ended_utc`                                    | ISO-like UTC datetimes                                |
| `hours`                                                       | duration in hours, two decimals                       |
| `end_reason`, `plays`, `errors`, `error_message`              | from the end event                                    |

A night with no end row is either still running or on a phone that never came back online.

---

## 6. Cost

The owner asked (request 4) whether D1 is free before anything else happened. Verified against
Cloudflare's D1 pricing page and its 2026-09-01 changelog on free-tier enforcement:

| Resource        | Workers Free allowance | Expected beta use                                                   |
| --------------- | ---------------------- | ------------------------------------------------------------------- |
| Worker requests | 100,000 per day        | ~2–4 per tester per night                                           |
| D1 rows written | 100,000 per day        | ~3 per event (row plus two index entries), ~10 per tester per night |
| D1 rows read    | 5,000,000 per day      | owner queries only                                                  |
| D1 storage      | 5 GB                   | well under 1 MB per thousand nights                                 |

Limits reset at 00:00 UTC. On the Free plan, exceeding one makes D1 return errors until the reset; it
does not bill. The Worker turns that into 503 and the app retries later. **Nothing here needs the
paid plan, and nothing has been created**, so the current cost is zero and stays zero until the
owner performs §7.

Decision recorded: build now, enable later at the owner's discretion (request 5).

---

## 7. Setup procedure (owner)

Every step is manual on purpose; none has been done.

### 7.1 Create the backend

1. Confirm the Cloudflare account:
   ```bash
   npx wrangler@4.129.0 whoami
   ```
   It must be the account that owns `countinglight.com`.
2. Check DNS: Cloudflare > `countinglight.com` > DNS > Records has no record named
   `luciddream-telemetry`. The one-level subdomain is covered by Universal SSL.
3. Create the database:
   ```bash
   npx wrangler@4.129.0 d1 create luciddream-telemetry
   ```
   Copy the printed `database_id` into `wrangler.telemetry.jsonc`, replacing
   `00000000-0000-0000-0000-000000000000`. Commit that change; the id is not a secret.
4. Apply the schema:
   ```bash
   npm run telemetry:db:schema
   ```
5. Optional ingest token:
   ```bash
   npx wrangler@4.129.0 secret put INGEST_TOKEN -c wrangler.telemetry.jsonc
   ```
6. Deploy:
   ```bash
   npm run deploy:telemetry
   ```
   The script refuses the placeholder id, runs `wrangler whoami`, then deploys with
   `-c wrangler.telemetry.jsonc`. Never run a bare `wrangler deploy` for it: the default config is the
   production web app.
7. Check `https://luciddream-telemetry.countinglight.com/v1/health` returns `{"ok":true}`.

### 7.2 Smoke-test the endpoint before any build

```bash
curl -i -X POST https://luciddream-telemetry.countinglight.com/v1/events \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token, if set>" \
  -d '{"events":[{"v":1,"id":"smoke-1","type":"run.start","at":1757800000000,"installId":"smoke","testerLabel":"owner smoke test","device":{"platform":"ios","osVersion":"test","model":"curl","manufacturer":"none"},"app":{"version":"0.0.0","build":"0","updateId":null,"channel":"smoke"},"run":{"id":"smoke-run","startedAt":1757800000000}}]}'
npm run telemetry:nights
```

Expect `202` and one night row for `owner smoke test`. Remove it:

```bash
npx wrangler@4.129.0 d1 execute luciddream-telemetry --remote -c wrangler.telemetry.jsonc --command "DELETE FROM events WHERE install_id = 'smoke'"
```

### 7.3 Give builds the endpoint

1. In `eas.json`, add to both `preview` and `production` (the `ios-testflight` profile extends
   `production`):
   ```json
   "env": { "EXPO_PUBLIC_TELEMETRY_URL": "https://luciddream-telemetry.countinglight.com" }
   ```
2. If a token was set, add `EXPO_PUBLIC_TELEMETRY_TOKEN` as an EAS environment variable for those
   environments rather than committing it.
3. Build and release as usual (tag, or the manual EAS workflows). The first build with the variable
   shows Settings > Beta diagnostics.
4. Before publishing an OTA update, export the same variables in the shell.

### 7.4 Store and privacy paperwork

- **App Store Connect > App Privacy:** declare Crash Data and Other Diagnostic Data, not linked to
  the user's identity, not used for tracking, purpose App Functionality. The `app.json` privacy
  manifest already declares the same.
- **Website:** `site/privacy/` already describes the switch and what it sends; it deploys with the
  website.
- **Testers:** ask them to turn on Settings > Beta diagnostics and, optionally, type a name.

### 7.5 End-to-end check on a device

1. Install the new build; open Settings; confirm the section appears and is off.
2. Turn it on, enter a name, begin a short night (a script of a few minutes), let it complete.
3. `npm run telemetry:nights`: one row with the name, model, build, `completed`, plausible hours.
4. Begin another night, then force-quit the app from the app switcher; relaunch.
5. `npm run telemetry:nights`: that night ends `interrupted` with `ended_utc` at or before the
   force-quit.
6. Turn the switch off and confirm the section's text and that no further rows appear.

---

## 8. Operations

| Task                           | How                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recent nights                  | `npm run telemetry:nights`                                                                                                                                |
| Ad-hoc query                   | `npx wrangler@4.129.0 d1 execute luciddream-telemetry --remote -c wrangler.telemetry.jsonc --command "<SQL>"`                                             |
| Crashes                        | `... --command "SELECT datetime(at/1000,'unixepoch'), tester_label, model, app_build, error_message FROM events WHERE type='app.crash' ORDER BY at DESC"` |
| Delete one tester's data       | `... --command "DELETE FROM events WHERE install_id = '<id>'"` (find the id through `nights`)                                                             |
| Retention                      | None automatic. Purge old rows manually, e.g. `DELETE FROM events WHERE at < <ms>`.                                                                       |
| Record evidence                | Add rows to `doc/evidence/v<N>-evidence.md` with source `telemetry` and the run id.                                                                       |
| Rotate token                   | `wrangler secret put INGEST_TOKEN` again, update the EAS variable, ship a build; old builds' batches get 401 and are dropped.                             |
| Pause collection               | Delete or undeploy the Worker. Apps keep up to 200 events and retry quietly.                                                                              |
| Remove the feature from builds | Drop the `env` entry from `eas.json` and ship a build; the section disappears.                                                                            |

---

## 9. Changes made alongside

- **Docs:** README (feature, structure), BUILD.md (fourth Worker, setup section), v1 spec §2.3 and
  new §4.8, `site/privacy/` (update check, beta diagnostics section, revised claims),
  `doc/evidence/README.md` (use diagnostics before asking), v2 plan §7.3 (diagnostics feed F2.7),
  iOS support plan Part J.
- **iOS privacy manifest** in `app.json` declares crash and diagnostic data types alongside the
  required-reason API entries.
- **Memory:** a feedback note that new costs are reviewed by the owner before anything is created or
  enabled.

---

## 10. Tests

Run with `npm test`; all passing at `d000d93` (224 tests across the suite).

| File                                          | Covers                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/telemetry/__tests__/telemetry.test.ts`   | Disabled and no-endpoint are no-ops; start and end events with counts, tester label, device and app; stable install id; interrupted night recovered on next launch with end time from the heartbeat; fatal JS error becomes `app.crash` plus `run.end` `crashed`; non-fatal errors ignored; switching off withdraws queue and marker. |
| `src/telemetry/__tests__/outbox.test.ts`      | Keep until delivered; batching; drop on rejection; throwing transport retried; cap discards oldest; clear; HTTP transport posts to `/v1/events` with the bearer token and maps 2xx/5xx/429/400; network failure retried.                                                                                                              |
| `src/telemetry/__tests__/config.test.ts`      | Unavailable without URL, on web, over HTTP; URL and token normalisation; tracker last-seen and non-negative duration; truncation.                                                                                                                                                                                                     |
| `src/lib/__tests__/settings.test.ts`          | Diagnostics default off; partial saved object merged.                                                                                                                                                                                                                                                                                 |
| `telemetry/worker/__tests__/validate.test.js` | Batch validation cases; crash without run; column mapping; Worker 202, 401 with and without token, 400 for bad JSON and empty batch, 503 on storage failure, 404, health.                                                                                                                                                             |

Not covered by automated tests: the real HTTP path to a deployed Worker, real D1 SQL (the view and
`INSERT OR IGNORE`), and on-device behaviour of the global error handler and background heartbeat.
§7.2 and §7.5 cover those manually.

---

## 11. Known limits and open follow-ups

- Phone clock, not server clock, for all run times (`received_at` is server time).
- Interrupted end time is the last refresh, not the moment of death.
- A phone that never reconnects leaves a start without an end.
- Native crash stacks are not captured; TestFlight has them for iOS, nothing does for sideloaded
  Android.
- Battery start/end is not reported; needs `expo-battery` (a native dependency) and is v2 plan F2.8.
- Screen-off state (evidence R-004) is not reported; could be inferred later from AppState
  transitions if wanted.
- No automatic retention; purge manually (§8).
- If the Worker is never deployed but builds carry the URL, the app retries harmlessly within its
  200-event cap.
