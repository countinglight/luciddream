# LucidDream v1 — Functional & Engineering Specification

Status: **approved for implementation** · Target: Android + iOS, POC quality · Source requirements:
[manual_requirements.txt](manual_requirements.txt) · Design history: [design_session_090426.md](../dev_process/design_session_090426.md)

---

## 1. Purpose and scope

LucidDream is a self-study tool for lucid dreaming. **v1 is a proof of concept with one job:** run a
user-authored script of audio signals through the night, with the phone's screen off, and hand the
user a log of what happened the next morning.

**In v1**

- A **signal library** — short audio files from the bundle, a URL, or a file picked on the device,
  with an explicit **save-offline** option for anything pulled from a URL (§4.5).
- A **script engine** — a declarative script that sequences signals with waits, loops, conditionals
  and per-scope effects.
- **Overnight execution** — reliable playback with the screen off, with an opt-in voice/sound
  interrupt so a half-asleep user can quiet playback without finding the phone (§4.6).
- **An event log** — every playback, volume change and context reading, exportable.
- **Distribution** — Android: signed APK attached to a GitHub Release. iOS: TestFlight, built by CI.

**Explicitly not in v1:** reality-check reminders, dream journal, dream analysis, personalised
guidance, accounts, multi-user support, cloud sync, real wearable integration (see §4.3),
folder-watching of any kind (files are added one at a time, permanently — not a future item),
and an in-app script editor (scripts are authored in any text editor; the app offers a read-only
viewer).

Single device, single user, no backend: all state — settings, signals, scripts, logs — lives in app
storage. "Shared access to audio files between users," from the source requirements, is satisfied by
users independently pointing their own app at the same URL, not by a server LucidDream operates.

Android and iOS both ship in v1, through different channels (§5) — Apple has no direct-install
equivalent of an APK. Feature parity is the goal; iOS is expected to trail Android by roughly one
delivery milestone (§7) since it needs a macOS-capable cloud build and cannot be smoke-tested as
cheaply as `expo start --web`.

---

## 2. Functional specification

### 2.1 Domain concepts

| Concept     | Meaning                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Signal**  | A named short audio file. `{ name, source, gain? }`. `name` is the moniker scripts refer to.                              |
| **Script**  | A YAML document defining what to play, when, how many times and under what conditions.                                    |
| **Phase**   | One of three fixed v1 slots: Pre-sleep Training, Early Sleep, or Wake Up. A populated phase executes one selected script. |
| **Run**     | One ordered execution of the three-phase plan, from Start to Stop/completion. Produces exactly one log file.              |
| **Context** | Live values a script can branch on: elapsed time, clock, and wearable readings (`hr`, `hrv`, `rem`, `sleepStage`).        |
| **Event**   | One timestamped line in the run log.                                                                                      |

### 2.2 The night, end to end (primary use case)

1. User opens the app to the **Run** screen. The last-used scripts for the three fixed phases and
   master volume are pre-selected.
2. User selects a script or Empty for each phase and sets master volume with a slider. Each populated
   phase has a **Test** button that plays its script's first signal at that volume. Pre-sleep Training
   is optional; either Early Sleep or Wake Up may be empty, but they may not both be empty.
3. **Start.** The app validates all populated scripts and resolves every referenced signal before
   acquiring the wake lock, showing the
   foreground-service notification, and begins execution. The screen may be switched off.
4. The populated phases execute in order. Normal script completion advances to the next phase.
   `stop:`, a runtime error, or the user Stop action terminates the whole run. The notification shows
   the current phase/step and a Stop action.
5. Morning: user opens the app (or taps the notification) and hits **Stop**, or all populated phases
   have already completed. The run appears in the **Log** tab.
6. User reviews the run — timeline of playbacks, gains applied, context readings — and can share the
   log file out via the device share sheet.

### 2.3 Screens

Four tabs. Deliberately plain: nearly all real interaction happens before sleep and after waking.
This structure is expected to evolve once real usage feedback comes in — it is a v1 starting point,
not a fixed design.

**Run** (home) — three named phase selectors · per-populated-phase Test · master-volume slider ·
large **Start**/**Stop** button. While running: current phase and script name, phase and total elapsed
time, current step description, next scheduled event, and a live latest-events strip. The same
master volume initializes every phase; a script's internal volume changes do not leak into the next
phase. This is the only screen with a running-state layout.

**Library** — two sections, _Signals_ and _Scripts_. Each entry shows name, source badge
(`bundled` / `url` / `file`) and resolution status. A `url`-sourced entry additionally shows an
**offline badge** (saved locally / not saved) and a **Save offline** / **Remove local copy** action
(§4.5). Other actions: add from URL, add from file, re-resolve, remove, preview (signals) / view
source (scripts). Bundled example items are not removable and are always offline. There is no
folder import and no folder-watching — every item is added one file at a time.

**Log** — list of past runs (date, script, duration, event count). Tapping one opens a filterable
event timeline. Actions per run: share, delete. Global action: delete all. Logging is local-only;
nothing leaves the device except a log the user explicitly shares.

**Settings** — theme (system/light/dark), master default volume, per-category logging toggles
(playback / context / engine / errors), audio focus behaviour (duck vs. exclusive), **Period
presets** (T-shirt-sized `short` / `medium` / `long` period values that scripts reference as
`$short` / `$medium` / `$long` — §3.2), a
**Simulated context** panel (§4.3) for testing conditionals without a wearable, and a
**Voice interrupt** control (off / gentle / stop — §4.6).

Splash screen and adaptive icons already exist in the skeleton and are kept.

### 2.4 Non-functional expectations

- App survives an 8-hour run without crashing or being killed by the OS's power management.
- Battery draw with screen off is dominated by the wake lock; target < 8 %/night on a modern device.
- Cold start to interactive < 2 s.
- No network access is required once a run's signals are resolved — a run refuses to start unless
  every referenced signal is already saved locally or freshly resolvable.
- Timing accuracy target: **±250 ms** at a `wait` boundary — adequate for this experiment, not a
  real-time audio guarantee.
- A malformed script produces a readable error naming the failing node — never a crash.

---

## 3. The script format

The script is a YAML document that **is** the AST directly — there is no separate grammar or parser
to maintain, and no embedded language (Lua, sandboxed JS) to bundle, sandbox, or bridge. This keeps
the engine small, pure, and fully unit-testable, at the cost of a syntax that reads more like
structured data than a scripting language. A friendlier text syntax can compile to the same AST later
without touching the engine.

### 3.1 Shape

A script's `body` is a list of **statements**, executed in order. Every statement is a single-key
mapping whose key names the node type — the parser is a validator, not a grammar.

```yaml
name: MILD with REM targeting
version: 1
volume: 0.4 # master gain for this script, 0..1

body:
  - log: "run started"
  - wait: 90m # let the first sleep cycle pass

  - repeat: 6 # finite loop
    body:
      - play: chime
      - wait: 10s
      - play: bell
      - wait: 20m

  - with: { gain: 0.6 } # scoped effect — applies to everything inside
    body:
      - repeat: infinite # until stopped, or until the condition holds
        until: { elapsed: { gte: 8h } }
        body:
          - if: { all: [{ rem: true }, { hr: { lt: 60 } }] }
            then:
              - play: { signal: chime, gain: 0.8, wait: true }
              - wait: 3s
              - play: chime
            else:
              - wait: 5m
```

### 3.2 Statements

| Statement | Form                                                      | Semantics                                                                                                                                                                                                                        |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play`    | `play: <name>` or `play: { signal, gain?, rate?, wait? }` | Plays a signal. `gain` multiplies the enclosing scope's gain. `wait: true` blocks until playback finishes; default is fire-and-forget.                                                                                           |
| `wait`    | `wait: 10s` \| `2m` \| `1h30m`                            | Suspends for a duration.                                                                                                                                                                                                         |
| `repeat`  | `repeat: <n>` \| `infinite`, `body:`, optional `until:`   | Loop. `until` is evaluated **before** each iteration; an `infinite` loop without `until` runs until the user stops.                                                                                                              |
| `if`      | `if: <condition>`, `then:`, optional `else:`              | Branch.                                                                                                                                                                                                                          |
| `with`    | `with: { gain?, rate? }`, `body:`                         | Pushes an effect scope for its body. Nested scopes multiply. `gain` and `rate` are the only effects in v1 — reverb, EQ and spatial audio need native DSP Expo doesn't provide, and land in v2; the grammar leaves room for them. |
| `set`     | `set: { volume: 0.3 }`                                    | Changes master volume for the rest of the run.                                                                                                                                                                                   |
| `log`     | `log: "text"`                                             | Writes a user marker into the event log.                                                                                                                                                                                         |
| `stop`    | `stop:`                                                   | Ends the run cleanly.                                                                                                                                                                                                            |

**Durations** are `<number><unit>` with units `ms|s|m|h`, concatenable (`1h30m`). Anywhere a
duration is accepted (`wait`, `elapsed` conditions), a script may instead use a bash-style
**period preset macro** — `$short`, `$medium`, or `$long` — which expands at parse time to the
corresponding Period preset value configured in Settings (§2.3). Referencing a preset name with
no configured value is a parse error naming the macro and the failing node, per §2.4.

### 3.3 Conditions

Conditions are mappings over context fields, with comparators `eq|ne|lt|lte|gt|gte` and the
combinators `all` / `any` / `not`.

| Field        | Type                      | Source in v1                             |
| ------------ | ------------------------- | ---------------------------------------- |
| `elapsed`    | duration                  | Engine (time since run start)            |
| `clock`      | `"HH:MM"`                 | Device clock                             |
| `iteration`  | number                    | Index of the enclosing `repeat`, 0-based |
| `hr`, `hrv`  | number                    | Context provider                         |
| `rem`        | boolean                   | Context provider                         |
| `sleepStage` | `awake\|light\|deep\|rem` | Context provider                         |

A condition over a field with no reading available evaluates to **false**, and the engine logs a
`context.unavailable` event. Scripts therefore degrade quietly rather than stalling.

### 3.4 Explicitly deferred from the script language

User-defined variables and arithmetic, in-script function/macro definitions, parallel branches,
`goto`, and importing one script from another. Each is a clean addition later; none is needed to
express the experiments described in the requirements. (Settings-level period presets — §3.2 —
are expansion of named constants, not in-script macro definitions.)

### 3.5 Bundled example scripts

Shipped in the APK, visible in the Library, and doubling as documentation and as engine test
fixtures: `01-single-beep.yaml`, `02-interval-chime.yaml`, `03-mild-cycles.yaml`,
`04-rem-conditional.yaml`, `05-effects-demo.yaml`.

---

## 4. Engineering design

### 4.1 Module structure

The overriding constraint here is the one from the requirements: **each module should be workable
with only its own folder in context.** That means the engine must not import React, React Native, or
Expo — anything it needs from the outside arrives through a port interface.

```
src/
  engine/          ← pure TypeScript. No RN, no Expo, no I/O. 100% unit-testable.
    ast.ts           node type definitions
    parse.ts         YAML → AST, with validation and readable errors
    duration.ts      duration parsing/formatting
    conditions.ts    condition evaluation against a context snapshot
    interpreter.ts   the executor — walks the AST, calls out through ports
    ports.ts         AudioPort · ClockPort · ContextPort · LogPort interfaces
  audio/           ← AudioPort over expo-audio; signal resolution and caching
  runtime/         ← ContextPort implementations (mock, later Health Connect)
  session/         ← run lifecycle: foreground service, wake lock, audio focus
  logging/         ← LogPort → JSONL files; run index; export
  storage/         ← settings and library persistence (AsyncStorage + FS)
  ui/              ← themed components (exists)
  app/             ← expo-router screens (exists)
```

Dependency rule, enforced by an ESLint `no-restricted-imports` rule: **`engine/` imports nothing
from any sibling folder.** Everything else may import `engine/`.

### 4.2 The interpreter

An `async` recursive walk over the AST. `wait` is the only suspension point and resolves against a
**ClockPort**, which is real timers in the app and a virtual clock in tests — so an eight-hour script
can be tested in milliseconds, deterministically.

Timing uses **absolute deadlines**, not accumulated `setTimeout` deltas: each `wait` computes
`target = now + duration` and sleeps in bounded slices toward it, re-reading the wall clock each
slice. This is what keeps drift from compounding over hundreds of iterations and lets the engine
recover correctly when Android throttles timers during doze.

Execution state (call stack, loop counters, scope stack) is held in one serialisable object, so a
run can be checkpointed and resumed if the process is restarted mid-night.

Cancellation is cooperative: `stop()` sets a flag checked at every statement boundary and aborts the
current sleep, so stopping is immediate rather than waiting out a 20-minute `wait`.

The v1 session layer runs the three fixed phases as separate interpreter executions over shared
audio, context and logging ports. This preserves phase-local elapsed time, loop state and volume
state without adding script imports or calls to the language. It emits one overall run lifecycle and
phase boundary events into the same log. Empty phases are skipped; normal completion advances, while
`stop:`, user cancellation or an error terminates the entire run.

### 4.3 Context providers

```ts
interface ContextPort {
  snapshot(): Promise<ContextSnapshot>; // { hr?, hrv?, rem?, sleepStage?, at }
}
```

v1 ships two implementations: **`ManualContextProvider`** (values set from sliders on the Settings
debug panel — lets you drive a conditional by hand while watching the engine) and
**`ScriptedContextProvider`** (a timeline fixture like _"REM from t+95m for 12m"_ — used by
automated tests and for realistic dry runs). Real wearable data is out of scope for v1.

v2 adds `HealthConnectContextProvider`. One caveat worth recording now, because it affects whether
the feature can ever work as written: Health Connect data is written by the wearable's companion app
in _batches after sync_, so near-real-time sleep-stage triggering during the night may simply not be
available. The mock-first approach means we find out without having built the app around it.

### 4.4 Overnight execution

Android: a **foreground service** (via `expo-notifications` plus the audio background mode) holds the
process alive with a persistent, non-dismissable notification carrying the current step and a Stop
action; `expo-keep-awake` holds a partial wake lock. `enableBackgroundPlayback` is `true` in
`app.json`. Battery-optimisation exemption is requested once, with an explanation screen, because
OEM power management is the single biggest threat to an 8-hour run.

Audio focus defaults to **duck** rather than exclusive so alarms still cut through.

### 4.5 Local persistence of remote signals and scripts

Distinct from the mid-run cache (§2.4): that cache exists so a run never depends on the network, but
it is not guaranteed to survive an app update or a low-storage cleanup. **Save offline** is the
user-visible guarantee on top of it — a deliberate, permanent copy, for the common case of "I found
this on a URL, but I want it available with no network next time."

Layout: `documentDirectory/library/{signals,scripts}/<id>/`, where `<id>` is derived from the source
URL and the file is stored under its original extension alongside a small sidecar (`meta.json`:
source URL, saved-at timestamp, display name). The Library screen's list is built by merging this
saved set with the bundled examples and the in-memory session cache, so "is this available offline"
is always a direct filesystem check, not an inference.

There is no automatic eviction in v1 — storage is small (short audio clips, text scripts) and the
user is in full control via **Remove local copy**. A saved copy is never re-downloaded automatically;
re-fetching happens only when the user explicitly re-adds the same URL.

### 4.6 Voice/sound-triggered interruption

**The problem:** the primary failure mode of an unattended overnight run is a half-asleep user who
wants the playback to stop or quiet down _right now_ and cannot reliably find, unlock, and tap the
phone in the dark. A voice trigger needs no coordination, which is what makes it worth having.

**Design — on-device voice-activity detection, no speech recognition.** `expo-audio`'s existing
recorder/metering monitors mic input _level_ — no new dependency, no words parsed, no audio stored.
A burst of sustained loud input near the device (any voice, a cough, "hey, stop that") lowers volume
and pauses briefly, then the run resumes on its own. It **never fully stops the run** on its own:
since this is a level threshold and not real word recognition, a false positive (snoring, a partner
talking, rolling into the phone) must be recoverable rather than silently ending the night's
experiment. A full stop still requires an explicit tap on the phone or the persistent notification
(§4.4).

This is the gentler alternative to true command recognition: rather than distinguishing the _word_
"stop" from "quieter" — which needs a real recognizer — v1 treats every trigger as the gentle action
and reserves the more consequential outcome for a physical interaction.

Real speech recognition was considered and set aside for v1 specifically: cloud STT needs network
overnight and sends bedroom audio off-device; on-demand OS recognizers (Android `SpeechRecognizer` /
iOS `Speech`) are built for short, user-initiated sessions rather than multi-hour listening and iOS
restricts background mic access heavily; dedicated offline keyword-spotters (e.g. Porcupine) would
work but add a new, often commercially-licensed native dependency — a real v2 candidate, not a POC
default. True keyword differentiation is deferred to v2 as its own dependency decision.

**Settings & privacy:** off by default. Turning it on requests microphone permission with an
in-context explanation ("used only to detect a spoken interruption, never recorded or transmitted").
`RECORD_AUDIO` is requested lazily, not declared as always-on, so users who never touch the setting
see no new permission prompt at all. This entire feature may be scoped out to v2 if real overnight
use shows it triggers on ambient noise too often to be worth the false-positive rate.

### 4.7 Testing

- **Engine (the bulk of it):** unit tests over parse → validate → execute against a virtual clock and
  fake ports. Every bundled example script is a fixture asserting an exact expected event sequence.
  Target ≥ 90 % line coverage in `src/engine/`, which is achievable precisely because it is pure.
- **Adapters:** thin, tested against the port contract with mocked Expo modules.
- **UI:** smoke tests on the Run screen states via `@testing-library/react-native` (existing setup).
- **Manual overnight checklist** in `doc/`, run before each release tag: 8-hour run on a physical
  device with the screen off, verified log completeness and battery draw.

---

## 5. Distribution

Android and iOS use genuinely different mechanics — Apple has no equivalent of "download a signed
binary and tap to install." Each platform gets its own channel below; §5.3 covers what they share.

### 5.1 Android — sideloaded APK via GitHub Release

**Channel:** signed APK attached to a **GitHub Release**, as the requirements specify. Users install
by downloading the APK from the release page and allowing install-from-unknown-sources. This is
adequate for v1's small, known audience and avoids Play Console review latency entirely. This flow
is verified manually against a real build before being treated as validated.

**Build:** EAS cloud build, `preview` profile (`buildType: apk`, `distribution: internal`).

**Signing:** EAS generates and stores the upload keystore. Immediately after the first build we
export it (`eas credentials`) and store it outside the repo — losing it means users must uninstall
and reinstall to take an update.

**Play Store:** out of scope for v1. The existing `eas-submit-android.yml` workflow is kept, unused,
as the on-ramp.

### 5.2 iOS — TestFlight

There is no iOS equivalent of "APK on a release page." Apple's two options for getting a build to
users outside the App Store are:

|                    | TestFlight (chosen)                                          | Ad Hoc                                                                                                                                       |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| How users get it   | Install the TestFlight app once, accept a link/email invite  | Receive a signed `.ipa`, install via Mac + Xcode/Apple Configurator                                                                          |
| Tester ceiling     | 10,000 external testers                                      | 100 devices per device type per year, and every device's UDID must be registered in the Apple Developer account **before** the build is made |
| Review             | Light App Review for external testers (usually fast)         | None                                                                                                                                         |
| Build lifetime     | Expires **90 days** after upload — needs periodic re-upload  | Up to 1 year                                                                                                                                 |
| Fit for LucidDream | Matches the "share a link, tap install" feel of the APK flow | Collecting UDIDs up front is real friction for a rolling group of testers                                                                    |

**TestFlight** is the closer analog to the Android flow's ease of distribution, and EAS already has
first-class support for it (`eas submit --platform ios`). The cost accepted in exchange: **a build
must be re-submitted at least every 90 days**, or existing testers silently lose access to a working
app. §6's `release-ios.yml` automates the re-submit so this is not a manual chore.

**Prerequisites, one-time setup, outside CI:**

1. Enroll in the **Apple Developer Program** ($99/yr) — required for both TestFlight and Ad Hoc.
2. In App Store Connect, create the app record (bundle ID `com.vladsadovsky.luciddream`, already set
   in `app.json`) and add external testers by email or generate a public TestFlight link.
3. Generate an **App Store Connect API key** (Users and Access → Keys) for EAS to submit
   non-interactively; store its `.p8`, key ID and issuer ID as CI secrets (§6).

**Build:** EAS cloud build, a new `ios-testflight` profile in `eas.json` (`distribution: store`,
auto-managed signing via EAS). Submission is `eas submit --platform ios --latest`, which uploads to
App Store Connect and puts the build in the "ready to test" state for existing testers automatically
— no manual step in the App Store Connect UI once secrets are configured.

**Versioning:** iOS build numbers must strictly increase per submission, same as Android's
`versionCode` — `eas.json`'s `appVersionSource: "local"` (§5.3) covers both.

### 5.3 Shared distribution mechanics

**Versioning:** `app.json` `version` is the single source of truth; `eas.json` switches to
`appVersionSource: "local"` so Android `versionCode` and iOS build number both derive from it plus
the CI run number. A release is cut by tagging `v<version>`, and the release workflow fails if the
tag and `app.json` disagree — enforced once, shared by both platforms.

**Build budget:** the EAS free plan gives 15 builds **per platform** per billing cycle. Comfortable
because **releases are built on version tags only** — never on every push — for both platforms.

### 5.4 Web — Cloudflare Workers Static Assets

The Expo static export (`npx expo export --platform web`) is deployed from the repository's `deploy`
branch to the `luciddream-web` Worker and served from `luciddream.countinglight.com`. The same static
deployment publishes public, cross-origin-readable customer content under `/content/scripts/` and
`/content/signals/`, catalogued by `/content/manifest.json`. Individual assets remain below the
Workers Static Assets 25 MiB limit. The exact setup, release, verification and rollback procedure is
maintained in `BUILD.md` at repository root.

The hosted build matches the browser behavior of `npm run web`; it does not claim the native mobile
foreground service's reliability when a browser throttles or suspends an inactive tab.

---

## 6. CI/CD pipeline

Five workflows: one gate, two release paths (one per platform, since they hit different services),
two manual ad-hoc builds.

**1. `ci.yml` — on every push and PR to `master`.** Steps: `npm ci` → `lint` → `typecheck` → `test:ci` → upload
coverage. Add `npx expo-doctor` to catch dependency drift, and the `engine/` import-boundary lint
rule from §4.1. This must be green before anything merges; branch protection on `master` enforces it.
Runs on `ubuntu-latest` — it never needs a Mac, since nothing here builds a binary.

**2. `release-android.yml`** (renamed from `release.yml`) **— on `v*` tag push.**

```
checkout → npm ci → verify tag matches app.json version
  → eas build --platform android --profile preview --non-interactive --wait --json
  → download the APK artifact from the returned URL
  → gh release create <tag> --notes-from-tag  (attach luciddream-<version>.apk)
```

Runs with `--wait` (unlike the current manual workflow's `--no-wait`) because the job must have the
artifact in hand to attach it. Budget ~15 min of runner time per release on the free queue.

**3. `release-ios.yml` — on the same `v*` tag push, running alongside `release-android.yml`.**

```
checkout → npm ci → verify tag matches app.json version
  → eas build --platform ios --profile ios-testflight --non-interactive --wait
  → eas submit --platform ios --latest --non-interactive
```

No GitHub Release artifact here — the deliverable is the build landing in App Store Connect, visible
to testers through the TestFlight app. This is also the workflow responsible for the 90-day
freshness requirement from §5.2: **run it on a schedule (e.g. monthly, via `on: schedule`) in
addition to tag push**, even with no code changes, so testers are never more than one cycle from
losing access. EAS builds entirely in the cloud, so this still runs on `ubuntu-latest` — no
self-hosted Mac needed despite iOS being the target.

**4. `eas-build-android.yml` — manual dispatch, kept as-is.** Ad-hoc Android preview builds during
development, with a profile picker. Not a release path.

**5. `eas-build-ios.yml` — manual dispatch, new, mirrors #4 for iOS.** Lets a one-off TestFlight
build go out outside the monthly/tag schedule, e.g. right after a fix worth testing immediately.

**Secrets:** `EXPO_TOKEN` (an Expo access token) covers all EAS-driven workflows. iOS submission
additionally needs `APPLE_API_KEY` (the `.p8` contents from §5.2), `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER_ID` — EAS uses these instead of an interactive Apple ID login. `GITHUB_TOKEN` is
ambient. `GOOGLE_SERVICE_ACCOUNT_KEY` stays unset until Play Store distribution is on the table.

**Branching:** `master` remains the long-term stable branch. Development happens on feature/release
branches and reaches `master` through review. Web production is promoted separately by merging an
approved release branch into the protected `deploy` branch; Cloudflare watches only that branch.

---

## 7. Delivery plan

| Milestone                  | Contents                                                                                                                                                                      | Exit criterion                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M1 — Engine**            | `src/engine/` complete: AST, parser, conditions, interpreter, virtual clock. No UI.                                                                                           | All 5 example scripts execute correctly under test; ≥ 90 % coverage.                                                                                   |
| **M2 — Audio & library**   | AudioPort over expo-audio, signal resolution/caching, save-offline persistence (§4.5), Library screen.                                                                        | A script can be loaded from a URL, saved offline, and played end to end in the foreground with the network off.                                        |
| **M3 — Run & session**     | Run screen, foreground service, wake lock, master volume, Stop, voice/sound interrupt (§4.6) — Android first; iOS background-audio equivalent follows once Android is proven. | An 8-hour script runs on a physical Android device with the screen off; a loud sound near the device audibly quiets playback without stopping the run. |
| **M4 — Logging & context** | JSONL event log, Log screen, export, mock/scripted context providers, conditionals wired.                                                                                     | A conditional script branches on simulated REM; log exports and reads correctly.                                                                       |
| **M5 — Android release**   | `release-android.yml`, versioning, README install instructions, overnight checklist run.                                                                                      | A `v1.0.0` tag produces a GitHub Release with an installable APK.                                                                                      |
| **M6 — iOS release**       | Apple Developer Program enrollment, App Store Connect app record + API key, `ios-testflight` EAS profile, `release-ios.yml` + `eas-build-ios.yml`, scheduled re-submit.       | The same `v1.0.0` tag (or the next tag once Android is stable) produces a TestFlight build installable by an external tester.                          |

M1 through M4 each end with something demonstrable and are platform-agnostic where the code allows
it. M1 deliberately has no UI at all — the engine is the risky part and it is fully testable without
one. M5/M6 are split because they hit different services on different schedules (§5.2) and because
iOS needs one-time account setup that has no Android counterpart — M6 can slip a milestone without
blocking the Android release.
