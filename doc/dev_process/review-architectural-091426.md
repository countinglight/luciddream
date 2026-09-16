# Architectural review of LucidDream v1

**Reviewer:** Claude Opus 5 (model id `claude-opus-5`), an Anthropic AI model working as a coding
agent in the Claude Code desktop app, at the owner's request. The session began on Claude Fable 5.1,
which did the first reading; the owner then switched models, and Opus 5 made the findings and wrote
this document.

**Date:** 2026-09-14. **Code:** branch `vlads-dev` at commit `97d1474`. **Status:** findings for
owner decision; no code was changed.

**Method:** reading only: source, configuration, installed dependency sources in `node_modules`
where a library's behaviour had to be confirmed, and the documents below. No tests, typecheck or
builds inform the findings. Tests and typecheck were run once early in the session without being
requested; the owner stopped further runs, and that output is not used.

**Scope:** the architecture of the v1 app; its fit with the research and product vision and with the
v1 spec; and the mismatches that would make the v2 hardening package (v2 plan §4.2) harder, with the
cheap items that could move into v1. Process and build items are out of scope except where they
touch architecture (§3.7).

**Documents read:** [research and product vision](../plans/luciddream-research-and-product-vision.md),
[v1 spec](../plans/luciddream-v1-spec.md), [manual requirements](../plans/manual_requirements.txt),
[v1 redesign note](../plans/luciddream-v1-redesign.md), [v2 plan](../plans/luciddream-v2-plan.md)
(§1.4, §4.2, §5.4, D14, D19 and the related F3.1, F3.5, F4.3, F6.3),
[v3 plan](../plans/luciddream-v3-plan.md) §2.5-§2.12,
[iOS support plan](../plans/luciddream-ios-support-plan.md) Part J and D4,
[telemetry session record](telemetry_session_091326.md), [v1 evidence](../evidence/v1-evidence.md).

**Conventions:** findings are numbered AR-01 to AR-25. Severity is judged against v1's own claims in
§3.1 and against the v2 hardening goals elsewhere. Effort: S up to 2 hours, M up to a day, L more than
a day. Risk means regression risk to a v1 night. Line references point at `97d1474`.

---

## 1. Verdict

- **The engine is the strongest part.** It is pure TypeScript with relative imports only, reaches the
  outside world through four ports, and has exact-sequence fixtures over the bundled scripts. It
  already fits the v2 plan's intent to share one parser and validator with the host (§5.4).
- **Ownership of the night is the weakest part.** The run lifecycle lives in a React hook, services
  are created in React context modules, and one night's data is spread over four storage locations.
  This is the main obstacle for F2.1, F2.3 and F2.9, and the opposite of v3 §2.6, where "the UI is
  not a second authority for progress".
- **Five defects contradict v1's own spec or privacy text, and each is cheap to fix.** Deleted nights
  keep their logs; voice interrupt keeps a full-night recording; the log is rewritten on every event;
  interrupted nights show as running forever; the "wake lock" only keeps the screen on.
- **The night record falls short of the vision's "traceable session behavior".** A log does not pin
  the script version, settings, build or time zone; voice ducking, branch decisions and write
  failures are not recorded; a Settings toggle can remove errors from the record.
- **Recommendation.** Take the six P0 items (about a day and a half) into v1 now, and the P1 items as
  the release window allows. Start v2.0 hardening with a plain TypeScript night-session service
  shaped like v3 §2.6, and only then checkpointing.

## 2. What to keep

- Engine purity, the port interfaces and the virtual clock. The same ports make session tests and a
  dry-run schedule projector possible without new abstractions.
- Absolute-deadline sleeping in bounded slices ([clock.ts:13-25](../../src/session/clock.ts#L13-L25))
  and cooperative cancellation through one abort signal.
- Preflight before resources: every phase is parsed and every signal resolved before the audio mode,
  keep-awake and notification ([use-session.ts:191-219](../../src/hooks/use-session.ts#L191-L219)).
- The library model: bundled, URL and file sources over a file store port with cache and document
  roots, save offline, and versioned manifests.
- Beta diagnostics: opt-in, invisible without an endpoint, a persisted outbox, idempotent ingest,
  validation kept separate for tests, no read endpoint, and a deploy guard for the placeholder
  database id.
- Release plumbing: one version source with a computed build number; separate Workers for site, app,
  prototype and diagnostics; the prototype recognised by hostname.
- Deep links: `luciddream://nights?run=` only preselects a night
  ([nights.tsx:94-99](../../src/app/nights.tsx#L94-L99)); no destructive action is reachable from a
  link.

## 3. Findings

### 3.1 Defects against v1's own spec and privacy text

**AR-01 Deleting a night leaves its log on disk.** High · S · Low risk · P0

- Evidence: `deleteRun` removes the index entry and the lucid answer, and `deleteAll` clears both;
  neither deletes `logs/<runId>.jsonl` ([nights.tsx:126-141](../../src/app/nights.tsx#L126-L141)).
- Impact: every deleted night stays in the app's document folder, unreachable from the UI and
  included in iOS device backups. Spec §2.3 offers delete and delete all; v2 F6.3 requires that every
  stored thing can be deleted. The deletion code lives in a screen, which is how the file was missed
  (AR-18).
- Recommendation: delete the log in both paths, and remove log files that have no index entry at
  launch. Move run deletion next to `run-index.ts`. `FileStorePort` needs a list or delete-directory
  call for delete all.

**AR-02 Voice interrupt keeps a full-night recording of the bedroom.** High · S · Low risk · P0

- Evidence: the detector measures loudness by recording
  ([use-voice-interrupt.ts:53-54](../../src/hooks/use-voice-interrupt.ts#L53-L54)). expo-audio
  writes every recording to a new UUID-named file in the cache folder (`AudioRecorder.kt` on Android,
  `AudioUtils.swift` on iOS, in `node_modules/expo-audio`) and never deletes it. The hook only stops
  the recorder ([use-voice-interrupt.ts:59-63](../../src/hooks/use-voice-interrupt.ts#L59-L63)).
- Impact: one file per voice-interrupt night, roughly 230 MB on iOS (the preset's 64 kbps AAC) and
  44 MB on Android (AMR-NB) for 8 hours. The iOS permission text says "Nothing is kept or sent"
  ([app.json:103](../../app.json#L103)), spec §4.6 says no audio is stored, and the privacy page calls
  it "a temporary file". v3 §2.12 states that raw bedroom audio storage is not required. An OS cache
  purge is not deletion.
- Recommendation: delete the file at `recorder.uri` after each stop. Keep that path in the open-run
  marker (AR-04) so launch recovery deletes it after a killed night, without depending on
  expo-audio's folder names. R-003 (does voice interrupt work on a device) stays open. For F9.1:
  `enableBackgroundRecording` adds Android's `FOREGROUND_SERVICE_MICROPHONE` permission, which the
  store checklist in v2 §9.2 does not list yet.

**AR-03 The run log is rewritten on every event (v2 F2.2).** High · S · Low risk · P0

- Evidence: `JsonlLogPort` keeps all lines in memory and rewrites the whole file per event
  ([jsonl-log-port.ts:32-41](../../src/logging/jsonl-log-port.ts#L32-L41)); `writeText` overwrites
  ([expo-file-store.ts:49-54](../../src/storage/expo-file-store.ts#L49-L54)). The installed
  expo-file-system already supports `write(text, { append: true })`.
- Impact: a kill during a rewrite can truncate the whole night, not only its last line. Writes grow
  with the square of the event count. Bundled scripts log little, but a script that tests a context
  condition every 10 seconds logs about 2,900 `context.unavailable` events a night
  ([interpreter.ts:197-199](../../src/engine/interpreter.ts#L197-L199)) and writes about 400 MB in
  total, assuming 100-byte lines. A second port instance for an existing run would overwrite it,
  which blocks recovery records (AR-04).
- Recommendation: add `appendText` to `FileStorePort` (native append; web and in-memory stores
  concatenate) and append one line per event. This is F2.2 in full.

**AR-04 Interrupted nights stay "running" forever (v2 F2.9).** Medium · M · Low risk · P0

- Evidence: a run's index entry gets `endedAt` only from a `run.stop` event
  ([use-session.ts:252-271](../../src/hooks/use-session.ts#L252-L271)). After a process death nothing
  closes it; `runState` reports it as running ([nights.ts:52-55](../../src/lib/nights.ts#L52-L55))
  and the week strip ranks running above stopped and error
  ([nights.ts:57-63](../../src/lib/nights.ts#L57-L63)). Kill detection exists, but only inside
  optional diagnostics ([telemetry.ts:134-173](../../src/telemetry/telemetry.ts#L134-L173)).
- Impact: Nights misreports exactly the failure v1 needs evidence about, for every user without
  diagnostics switched on. F2.9 and F2.1 both start from this detection.
- Recommendation: move the open-run marker out of `telemetry/` into the session or logging layer,
  always on. At launch, close unfinished runs as `interrupted` at their last-seen time and append a
  recovery record to the log (after AR-03); diagnostics report from that result. Add `interrupted` to
  `RunSummary.reason` and to the Nights status pills.

**AR-05 The "wake lock" keeps the screen on, not the CPU.** Medium · S for docs · behaviour needs a
decision · P0 (docs)

- Evidence: `expo-keep-awake` sets `FLAG_KEEP_SCREEN_ON` on Android and `isIdleTimerDisabled` on iOS
  (`node_modules/expo-keep-awake`). Spec §4.4 and
  [wake-lock.ts:8-10](../../src/session/wake-lock.ts#L8-L10) describe a partial CPU wake lock.
- Impact: with the app open, the screen does not time out during a run and stays lit until the user
  locks the phone, against the "Your screen can go dark" copy and the battery target. Overnight
  liveness actually rests on expo-audio's media foreground service and the keep-alive loop. An
  unlocked night also avoids Android Doze and keeps iOS in the foreground, so the two E-002 nights may
  have exercised neither background path (R-004 and R-005 are open).
- Recommendation: correct spec §4.4, the D4 notes and the code comments now. Do not remove keep-awake
  in v1 before R-004 and R-005 are answered: a screen held on may be what kept those nights alive.
  Treat a locked screen as a required condition of every validation night (F2.7 already lists it).

### 3.2 Readiness for the v2 hardening package

v2 §4.2 makes the whole package release-blocking (D14). The table maps each item, plus the related
context and data items, to v1 as it is today.

| v2 item                          | v1 today                                                                                        | What makes it harder                                                                | Into v1?                                                     | Findings            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------- |
| F2.1 Checkpoint and resume       | Recursive async interpreter; phase position in closures; scripts read from the library at Begin | No savable position; script version not pinned; no entry point before the UI mounts | No; pin the script through the run manifest (P1)             | AR-06, AR-07, AR-10 |
| F2.2 Append-only log             | Whole file rewritten per event                                                                  | File store port has no append; the native API has one                               | Yes (P0)                                                     | AR-03               |
| F2.3 Android alarm module        | Lifecycle in a React hook; the next cue time exists only inside a running `wait`                | No headless start path; no scheduled-time records                                   | No                                                           | AR-06, AR-08, AR-13 |
| F2.4 Night ambience              | Fixed 0.01 loop outside the audio port; no setting, not logged                                  | Ambience invisible to settings and log                                              | Only if R-005 shows iPhone nights dying                      | AR-11               |
| F2.5 Cue-time notifications      | No schedule projection                                                                          | Future cue times unknown at Begin                                                   | No; the engine's virtual clock makes a projector cheap in v2 | AR-13               |
| F2.6 Audio route handling        | A failing play ends the night; a missing finish status hangs it                                 | Terminate-on-error policy; no timeouts; players created mid-night                   | Preload and timeouts (P1); skip-and-log needs a decision     | AR-09               |
| F2.7 Validation gate             | Diagnostics dormant; logs carry no device or build                                              | A shared log cannot answer R-001                                                    | Run manifest (P1)                                            | AR-05, AR-10        |
| F2.8 Battery per night           | No battery module                                                                               | Needs `expo-battery`, a native dependency                                           | Only if a native build is planned anyway; it answers R-002   | AR-10               |
| F2.9 Honest interruptions        | Detection only in optional diagnostics; dead runs show "running"                                | Recovery is not part of the run record                                              | Local part (P0)                                              | AR-04               |
| F3.1 Unknown condition semantics | Boolean plus a list of missing fields                                                           | Contained in `conditions.ts`                                                        | No; a deliberate semantic change (D19)                       | AR-22, AR-23        |
| F3.2 Sound level source          | Metering inside a React hook                                                                    | Microphone pipeline tied to the UI tree (v3 §2.11)                                  | No                                                           | AR-06               |
| F3.5 Observation schema          | Snapshot with no per-field time or provenance                                                   | Field list repeated in six files                                                    | No                                                           | AR-22               |
| F4.3 Night bundle                | JSONL of engine events                                                                          | Not self-describing                                                                 | Manifest (P1); bundle in v2                                  | AR-10, AR-18        |
| F6.3 Delete everything           | Deletion code in screens                                                                        | Misses logs and recordings; no storage inventory                                    | Fix both leaks (P0)                                          | AR-01, AR-02        |

**AR-06 The night is owned by a React hook.** High · L · Medium risk · P2, with two S symptom fixes
in P1

- Evidence: `useSession` ([use-session.ts:90-372](../../src/hooks/use-session.ts#L90-L372)) does
  preflight, run identity, run-index writes, diagnostics calls, log composition and status.
  `SessionProvider` mounts voice interrupt and the diagnostics lifecycle
  ([session-context.tsx:18-31](../../src/context/session-context.tsx#L18-L31)). `startSession`
  imports Expo modules directly ([session.ts:1-14](../../src/session/session.ts#L1-L14)). No test
  covers `session.ts`, `use-session.ts` or `use-voice-interrupt.ts`.
- Impact: an OS relaunch (F2.3) or a resume before the UI mounts (F2.1) has no entry point, and the
  microphone source for F3.2 cannot run without the React tree (v3 §2.11). The most failure-prone
  code has no tests. Two symptoms today:
  - Stop while a night is still preparing is ignored, because the controller is stored only after
    `startSession` resolves ([use-session.ts:143](../../src/hooks/use-session.ts#L143),
    [291-303](../../src/hooks/use-session.ts#L291-L303),
    [323-325](../../src/hooks/use-session.ts#L323-L325)).
  - A start that fails in preflight, after an earlier night in the same app session, keeps that
    night's `runId`, `startedAt` and elapsed time
    ([use-session.ts:176-188](../../src/hooks/use-session.ts#L176-L188)). The error screen then shows
    the earlier night's cues and asks the lucid question for it
    ([run.tsx:241-243](../../src/app/run.tsx#L241-L243)).
- Recommendation: first v2.0 work, before checkpointing. Build a plain TypeScript night-session
  service in `src/session/` with the operations of v3 §2.6 (`start(plan)`, `stop(runId)`,
  `getSnapshot`, `subscribe(afterSequence)`). Put wake lock, keep-alive, notification and microphone
  behind small ports, and test eight-hour nights on the engine's `VirtualClock`. `useSession` becomes
  a subscriber. With that boundary, the v3 native host can later replace the implementation without
  touching the UI.

**AR-07 The interpreter's position cannot be saved (v2 F2.1).** High · M to L · Low risk (engine
only) · P2

- Evidence: spec §4.2 says execution state is "held in one serialisable object". The implementation
  is a recursive async walk whose position lives on the JavaScript call stack; `ExecState` holds only
  the scope stacks ([interpreter.ts:15-26](../../src/engine/interpreter.ts#L15-L26)). The phase
  position lives in closures ([sequence.ts:13-87](../../src/session/sequence.ts#L13-L87)).
- Impact: F2.1 needs the phase index, statement path, loop iterations, wait deadline, volume and phase
  start time, plus a missed-deadline policy (v3 §2.7: never replay missed cues as current).
- Recommendation: a short spike at v2 start between two options.
  - (a) Keep the walk, maintain an explicit cursor in `ExecState` at statement boundaries, and add a
    resume mode. This matches the F2.1 wording.
  - (b) Replay the pinned script (AR-10) through a catch-up `ClockPort` with audio muted until
    wall-clock time, logging skipped cues. This needs no interpreter restructuring, but works only
    while conditions are deterministic; v2 context sources would need journaled observations.
  - Correct the spec §4.2 wording now (P1 docs).

**AR-08 Services are created inside React context modules.** Medium · S · Low risk · P1

- Evidence: the file store singleton is created in
  [library-context.tsx:37-38](../../src/context/library-context.tsx#L37-L38) and handed out by
  `getLibraryFileStore()` ([library-context.tsx:311-313](../../src/context/library-context.tsx#L311-L313))
  to the session hook, the log reader, Nights and Library.
- Impact: code that must run without the UI (AR-04 recovery, AR-06, F2.3) has to import a React
  context module to reach storage.
- Recommendation: one plain composition module, for example `src/runtime/services.ts`, that creates
  the file store and later the run store and session service. Contexts and hooks import from it. The
  change is mechanical.

**AR-09 A failed or silent cue ends or stalls the night (v2 F2.6).** Medium · S · Low risk · P1 for
preload and timeout; the skip policy is a decision

- Evidence: an exception from `play` reaches the interpreter and ends the whole run
  ([interpreter.ts:55-65](../../src/engine/interpreter.ts#L55-L65), spec §2.2 step 4). `finished`
  resolves only on a "just finished" status, so `wait: true` can block forever, and `release()` waits
  for it, leaving players and the notification in place
  ([expo-audio-port.ts:54-67](../../src/audio/expo-audio-port.ts#L54-L67),
  [81-88](../../src/audio/expo-audio-port.ts#L81-L88)). Players are created at first play, possibly
  hours into the night ([expo-audio-port.ts:43-47](../../src/audio/expo-audio-port.ts#L43-L47)), and
  URL signals resolved into the purgeable cache root must still exist then
  ([library-content.ts:18-33](../../src/storage/library-content.ts#L18-L33)).
- Impact: a decode error, a lost audio route or a purged cache file ends or freezes the night without
  a clear record; v2 F2.6 says a night must "never stall".
- Recommendation: create every player during preflight, before keep-awake, and bound `finished` with
  a timeout derived from the player's duration. Whether a failed cue ends the night or is logged and
  skipped is decision 1 (§4.4).

### 3.3 Adherence to the v1 spec

| Spec                                                  | Status               | Note                                                                             |
| ----------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| §1 and §2.2 step 6: the log includes context readings | Not met              | Only missing readings are logged; values read and branches taken are not (AR-13) |
| §2.2 step 3: validate and resolve before resources    | Met                  | [use-session.ts:191-219](../../src/hooks/use-session.ts#L191-L219)               |
| §2.3 running screen: next scheduled event             | Not met              | Not shown on Sleeping; the redesign note says every v1 function is kept (AR-13)  |
| §2.3 Log: delete and delete all                       | Partly               | Log files remain (AR-01)                                                         |
| §2.4 a malformed script never crashes                 | Met                  | Parse errors name the failing node                                               |
| §2.4 eight-hour run; battery under 8 %                | Unverified           | E-002 passed without screen state or battery (R-002, R-004)                      |
| §3.3 a missing reading evaluates false                | Met                  | Replaced by v2 F3.1                                                              |
| §4.1 the engine imports nothing from siblings         | Met, weakly enforced | AR-19                                                                            |
| §4.2 absolute deadlines, cooperative stop             | Met                  | [clock.ts:13-25](../../src/session/clock.ts#L13-L25)                             |
| §4.2 serialisable execution state                     | Not met              | AR-07                                                                            |
| §4.4 partial wake lock                                | Not as described     | AR-05                                                                            |
| §4.4 battery-optimisation exemption screen            | Not built            | Already recorded in E-002                                                        |
| §4.5 save offline                                     | Met in intent        | Offline state is a stored flag, not a filesystem check; no `meta.json` sidecar   |
| §4.6 no audio stored                                  | Not met              | AR-02                                                                            |
| §4.7 adapter tests and Run-screen smoke tests         | Partly               | Only the audio adapter and the Library screen have tests                         |
| §6 CI gate and release workflows                      | Partly               | AR-25                                                                            |

### 3.4 The night record against the product vision

The vision's v1 foundation is "traceable session behavior". Its §11.2 asks for the protocol version,
the intended cue schedule, actual playback, interruptions and preserved technical failures, and v3
§2.5 asks that each run record the exact plan and version it used.

**AR-10 A night's log cannot be reproduced or read on its own.** High · M · Low risk · P1

- Evidence: the log holds engine events only, with no schema version
  ([ports.ts:58-74](../../src/engine/ports.ts#L58-L74)). A run's phases are stored as a display string
  ([use-session.ts:172-174](../../src/hooks/use-session.ts#L172-L174)) and parsed back
  ([nights.ts:28-39](../../src/lib/nights.ts#L28-L39)), so a script name containing " · " breaks the
  parse. Script content, period presets, master volume, audio focus, voice interrupt, app build,
  platform and time zone are not recorded.
- Impact: after a script edit or a preset change, an old log no longer says what ran. A shared log
  cannot answer R-001. The v2 host cannot compute local clock times without the time zone, and F2.1
  needs the pinned script to resume.
- Recommendation: write a `run.manifest` record as the first line of the log. It holds the schema
  version, run id, app version and build, platform and model, time-zone name and offset, playback
  settings, and for each phase the library id, source, name and full script text. `readAppInfo` and
  `readDeviceInfo` from diagnostics already read these locally. Store the phases structured in
  `RunSummary`. A shared log then describes itself with no new export path; the share copy or privacy
  page should say that it carries the phone model and time zone. Under D19 this is not about
  migration: it makes beta nights interpretable and gives the v2 host real fixtures.

**AR-11 Session facts and failures are missing from the log.** Medium · S · Low risk · P1

- Evidence: voice interrupt changes the real volume
  ([session.ts:120-126](../../src/session/session.ts#L120-L126),
  [expo-audio-port.ts:49](../../src/audio/expo-audio-port.ts#L49)) but is not logged, so a `play`
  record overstates its gain during a duck. Write failures are swallowed
  ([jsonl-log-port.ts:34](../../src/logging/jsonl-log-port.ts#L34)), unreadable lines are dropped
  silently ([nights.ts:154-165](../../src/lib/nights.ts#L154-L165)), and records carry no sequence
  number.
- Impact: v2 §1.4 requires the record to separate what was scheduled, played and sensed; vision
  §11.2 treats technical failures as results to keep.
- Recommendation: a session record type next to `EngineEvent`, so the engine stays unaware, starting
  with duck and resume; a write-failure count in the stop record; a per-run sequence number on every
  record (v3 §2.12).

**AR-12 Logging toggles remove events from the durable record.** Medium · S · Low risk · decision,
then P1

- Evidence: `FilteringLogPort` drops playback, context, engine or error events before they reach the
  file ([categories.ts:25-46](../../src/logging/categories.ts#L25-L46), wired at
  [use-session.ts:274-280](../../src/hooks/use-session.ts#L274-L280)), and Settings offers an Errors
  toggle ([settings.tsx:60](../../src/app/settings.tsx#L60)). Nights already filters by category when
  displaying ([nights.tsx:438-439](../../src/app/nights.tsx#L438-L439)).
- Impact: a user can switch off the errors that explain why a night ended. The original requirements
  ask for user control over logging; the v2 honesty goal asks for a complete record.
- Recommendation: decision 2 (§4.4).

**AR-13 Scheduled cues and branch decisions are not recorded.** Medium · M · Low to Medium risk · P2

- Evidence: `wait` emits no record, and a condition logs only its missing fields
  ([interpreter.ts:185-201](../../src/engine/interpreter.ts#L185-L201)), not the values read or the
  branch taken. The Sleeping screen shows no next scheduled event.
- Impact: F2.3 needs the next cue time, F2.5 needs future cue times at Begin, F2.9 needs missed cues,
  F5.5 needs a plain-language timeline, and the host needs to know why a cue played.
- Recommendation: in v2 and after AR-03, emit a wait record with its deadline and a condition record
  with its result and inputs. Build a dry-run projector from the engine's `VirtualClock` and fakes
  with an "unknown" context. The bundled-script fixtures change, which is why this is not a v1 item.

### 3.5 Security and privacy

**AR-14 URL imports accept plain HTTP and any scheme.** Low to Medium · S · Low risk · P1

- Evidence: manifests allow `http:`
  ([library-manifest.ts:12-22](../../src/storage/library-manifest.ts#L12-L22)); single-item imports
  only check that the fields are not empty ([library.tsx:297-301](../../src/app/library.tsx#L297-L301)).
- Impact: a script or signal fetched over HTTP can be replaced in transit. Scripts are data and gains
  are clamped ([interpreter.ts:114](../../src/engine/interpreter.ts#L114)), but a replaced script can
  still play loud cues all night, against G1. Behaviour also differs by platform: iOS and Android
  release builds block cleartext HTTP by default, and the web build does not.
- Recommendation: one URL validator in `storage/`, HTTPS only, used by every import.

**AR-15 Script parsing has no size or depth limit.** Low · S · Low risk · P2

- Evidence: `parseScript` passes any text to js-yaml and validates recursively
  ([parse.ts:96-128](../../src/engine/parse.ts#L96-L128)).
- Impact: a very large or alias-heavy YAML file can stall the JavaScript thread at Begin or in the
  viewer. The risk grows with host-drafted scripts (F8.10) and imported proposals (F5.2).
- Recommendation: cap the source length and nesting depth in `parseScript` before those features
  land.

**AR-16 Diagnostics send free-text errors to an open ingest.** Low · S · Low risk · P2, before
diagnostics reach a wider group

- Evidence: error messages are sent as raw strings
  ([run-tracker.ts:32-35](../../src/telemetry/run-tracker.ts#L32-L35),
  [telemetry.ts:236-243](../../src/telemetry/telemetry.ts#L236-L243)). The ingest checks a token that
  ships inside the app and has no rate limit
  ([index.js:34-44](../../telemetry/worker/index.js#L34-L44)).
- Impact: an error string can carry a signal name or a URL, beyond what the diagnostics plan promises
  (no library content besides script names). Anyone can use up the free D1 daily write allowance,
  which silences real reports for that day; on a paid plan the same traffic would be billed.
- Recommendation: strip URLs and file paths from messages before queueing, and add a rate limit
  before switching diagnostics on for more testers.

**AR-17 The web app sends no security headers.** Low · S · Low risk · P1, possibly already on the
build list

- Evidence: [public/\_headers](../../public/_headers) sets caching only; the website's `site/_headers`
  sets `nosniff` and `Referrer-Policy`.
- Recommendation: add `X-Content-Type-Options`, `Referrer-Policy` and a framing restriction for the
  app and the prototype.

### 3.6 Maintainability and extension

**AR-18 One night's code and data are spread across folders.** Medium · L, together with AR-06 · Low
risk · P2; README fix in P1

- Evidence: the lifecycle spans `session/`, `hooks/use-session.ts`, `hooks/use-voice-interrupt.ts`,
  `hooks/use-telemetry.ts` and `context/session-context.tsx`. One night's data lives in the run index
  and the lucid answers (both AsyncStorage), the JSONL file, and the diagnostics marker. `lib/` mixes
  pure helpers with storage. Screens hold data logic: Nights writes the index and lucid answers and
  performs deletion, and `library.tsx` has 1,049 lines with nine components. The README "Structure"
  section omits `hooks/`, `context/`, `lib/`, `components/` and `constants/`.
- Impact: this works against the requirement that each module be workable with only its own folder
  in context (manual requirements, spec §4.1, v2 §1.4). F4.1, F4.3, F4.5 and F6.3 would each add
  per-night storage code to screens.
- Recommendation: with AR-06, one record module, for example `src/record/`, that owns the manifest,
  the record schema and its version, the index, review answers, deletion and export. Keep `lib/` for
  pure helpers, and split screens only when a v2 feature touches them.

**AR-19 The engine boundary lint has gaps.** Medium · S · No risk · P0

- Evidence: the rule lists forbidden patterns ([eslint.config.js:23](../../eslint.config.js#L23)) but
  not `@/lib/*`, `@/hooks/*`, `@/context/*`, `@/telemetry/*`, `@/constants/*`,
  `@react-native-async-storage/*` or relative paths out of the folder. `@/lib/settings` imports
  AsyncStorage.
- Impact: the engine, the part v2 will share with the host, can reach storage without a lint error.
- Recommendation: turn the rule into an allowlist, so the engine may import only its own files and
  `js-yaml`.

**AR-20 There are two sets of period-preset defaults.** Medium · S · Low risk · decision, then P1

- Evidence: the engine defaults are 5 min, 20 min and 90 min
  ([duration.ts:23-27](../../src/engine/duration.ts#L23-L27)); the app defaults are 5 s, 20 s and
  5 min ([settings.ts:70-74](../../src/lib/settings.ts#L70-L74)). The fixture test plays the bundled
  Interval Chime (`$short`) five minutes apart
  ([examples.test.ts](../../src/engine/__tests__/examples.test.ts)); a fresh install plays it five
  seconds apart.
- Impact: the v2 host validates and previews scripts with the engine (v2 §5.4), so one script would
  describe two different nights.
- Recommendation: decision 4 (§4.4). Then define the defaults once in the engine, import them in
  settings, and record the presets used in the run manifest (AR-10).

**AR-21 Signal preflight walks the script by hand.** Low to Medium · S · Low risk · P1

- Evidence: `collectSignalNames` and `firstSignalName` each walk the syntax tree with a
  `default: break` ([resolve.ts:12-35](../../src/audio/resolve.ts#L12-L35),
  [41-65](../../src/audio/resolve.ts#L41-L65)).
- Impact: a future statement with a body would not have its signals resolved at Begin and would fail
  mid-night. The editor (F5.1), the projector (F5.5) and a serializer need the same walk.
- Recommendation: one child-statement walker in the engine with an exhaustive switch, used by
  `audio/resolve.ts`.

**AR-22 Context fields are listed in six places.** Medium · M · Low risk · P2

- Evidence: [ast.ts:14-21](../../src/engine/ast.ts#L14-L21),
  [parse.ts:39-47](../../src/engine/parse.ts#L39-L47),
  [ports.ts:10-16](../../src/engine/ports.ts#L10-L16),
  [conditions.ts:8-16](../../src/engine/conditions.ts#L8-L16),
  [context-providers.ts:3-8](../../src/runtime/context-providers.ts#L3-L8),
  [settings.ts:12-17](../../src/lib/settings.ts#L12-L17).
- Impact: F3.2 and F3.3 add four fields, and F3.5 with v3 §2.10 adds time, availability and
  provenance to each observation.
- Recommendation: one field registry in the engine that parsing, evaluation and snapshots derive
  from, built together with F3.1.

**AR-23 Clock conditions fail across midnight.** Medium · M · Low risk · docs in P1, semantics in P2
after decision 5

- Evidence: `clock` values are compared as "HH:MM" strings
  ([conditions.ts:25-40](../../src/engine/conditions.ts#L25-L40)).
- Impact: `until: { clock: { gte: "06:00" } }` is already true at 23:00, so the loop ends at bedtime.
  "No cues after my wake time" is the natural overnight rule (vision §12.5) and what a drafting model
  will write (F8.10).
- Recommendation: document the limitation in spec §3.3 now. In v2, compare on the night's timeline,
  using the noon boundary Nights already uses ([nights.ts:13-18](../../src/lib/nights.ts#L13-L18)),
  with fixtures.

**AR-24 The UI keeps re-rendering all night.** Medium, for power · S · Low risk · P1

- Evidence: the session context changes every second while a night runs
  ([use-session.ts:124-133](../../src/hooks/use-session.ts#L124-L133)). With voice interrupt on,
  expo-audio's recorder status poll also re-renders the provider about every 500 ms
  ([use-voice-interrupt.ts:30](../../src/hooks/use-voice-interrupt.ts#L30)). Tonight stays mounted
  under Sleeping.
- Impact: React work continues with the screen off for eight hours. The cost is unmeasured and counts
  against the battery target (spec §2.4, v2 §1.4).
- Recommendation: run the elapsed ticker only while the app is active, and derive elapsed time from
  the start time when rendering.

### 3.7 Build and deployment

These probably overlap the owner's process list and are listed for completeness only (AR-25, Low to
Medium).

- The production app uses the default `wrangler.jsonc`, so a bare `wrangler deploy` from any branch
  publishes production; the owner's deploy convention names one `wrangler.<name>.jsonc` per Worker.
- Only `deploy:telemetry` runs `wrangler whoami` before deploying.
- CI runs only for `master` and skips `format:check` and `line-endings:check`; spec §6's
  `release-android.yml` does not exist.
- `npm run reset-project` is the Expo template script that moves or deletes `src/`
  ([reset-project.js](../../scripts/reset-project.js)).

## 4. Prioritized follow-up

### 4.1 P0: into v1 before the next beta build

About a day and a half in total. Do item 1 before item 4, because the recovery record appends to an
existing log.

| #   | Item                                                                  | Findings | v2 item              | Effort | Risk |
| --- | --------------------------------------------------------------------- | -------- | -------------------- | ------ | ---- |
| 1   | Append-only JSONL log                                                 | AR-03    | F2.2                 | S      | Low  |
| 2   | Delete removes log files; remove orphaned logs at launch              | AR-01    | F6.3                 | S      | Low  |
| 3   | Delete the voice-interrupt recording after each night and on recovery | AR-02    | F6.3                 | S      | Low  |
| 4   | Close unfinished runs as interrupted at launch, for every user        | AR-04    | F2.9                 | M      | Low  |
| 5   | Engine import allowlist                                               | AR-19    | §1.4 maintainability | S      | None |
| 6   | Correct spec §4.4, iOS plan D4 and code comments about keep-awake     | AR-05    | F2.7                 | S      | None |

### 4.2 P1: into v1 as the release window allows

In order of value.

| #   | Item                                                                                                                   | Findings                   | v2 item          | Effort | Risk |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------- | ------ | ---- |
| 7   | Run manifest as the first log record; structured phases in the run index                                               | AR-10                      | F2.1, F2.7, F4.3 | M      | Low  |
| 8   | Session records for duck and resume, a write-failure count, per-run sequence numbers                                   | AR-11                      | F3.5             | S      | Low  |
| 9   | Create players during preflight; time out playback completion                                                          | AR-09                      | F2.6             | S      | Low  |
| 10  | Elapsed ticker only while the app is active                                                                            | AR-24                      | §1.4 power       | S      | Low  |
| 11  | Honour Stop while preparing; reset run state when a start fails                                                        | AR-06                      | §1.4 reliability | S      | Low  |
| 12  | Composition module for services                                                                                        | AR-08                      | F2.3             | S      | Low  |
| 13  | Engine child-statement walker                                                                                          | AR-21                      | F5.1, F5.5       | S      | Low  |
| 14  | HTTPS-only URL imports                                                                                                 | AR-14                      | G1               | S      | Low  |
| 15  | Apply decisions 2 and 4: logging toggles, preset defaults                                                              | AR-12, AR-20               | §1.4 honesty     | S      | Low  |
| 16  | Docs: spec §4.2 execution state, §3.3 clock across midnight, §2.3 next event and §1 context readings, README Structure | AR-07, AR-13, AR-18, AR-23 | F6.2             | S      | None |
| 17  | Web security headers, deploy guards, remove `reset-project`                                                            | AR-17, AR-25               | G6               | S      | None |

Conditional items from the hardening list:

- **F2.8 battery at start and end.** Only if a native build is planned anyway: it adds `expo-battery`
  and answers R-002 for v1's own battery target.
- **F2.4 night ambience.** Only if R-005 shows iPhone nights dying during long waits.

### 4.3 P2: first work of v2.0 hardening, in order

1. Night-session service with the v3 §2.6 operations, lifecycle ports and eight-hour virtual-clock
   tests (AR-06). L.
2. Record module owning manifest, schema, index, review, deletion and export; then the F4.3 bundle as
   a single JSON file, which needs no zip dependency (AR-18, AR-10). M to L.
3. Resume spike between a saved cursor and catch-up replay, then F2.1 and F2.3 (AR-07). L.
4. Wait and condition records plus a dry-run projector, serving F2.3, F2.5, F5.5 and the Sleeping
   screen (AR-13). M.
5. Microphone pipeline out of React before F3.2 (v3 §2.11); field registry with F3.1 and F3.5; clock
   semantics (AR-06, AR-22, AR-23). M to L.
6. Parser limits before F5.2 and F8.10; diagnostics hardening before a wider beta (AR-15, AR-16). S.

### 4.4 Decisions needed

| #   | Question                                           | Options                                                                             | Recommendation                                                                                                 |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Does a failed cue end the night? (AR-09)           | End the run, as spec §2.2 says; or log it and continue, as F2.6 implies             | Log and continue, with a failure count in the stop record                                                      |
| 2   | What do logging toggles control? (AR-12)           | What is recorded, per the original requirements; or only what is shown and exported | Record everything and filter on display and export; if toggles keep filtering the record, always record errors |
| 3   | Should a running night hold the screen on? (AR-05) | Keep; release once running; web only                                                | Keep until R-004 and R-005 are answered, then decide                                                           |
| 4   | Which period-preset defaults are intended? (AR-20) | Seconds, as the app has; minutes, as the engine and fixtures have                   | Minutes for real nights; a demo script can use literal seconds                                                 |
| 5   | How do clock conditions treat midnight? (AR-23)    | Night timeline with the noon boundary; explicit wrap syntax                         | Night timeline, matching how Nights assigns a night                                                            |
| 6   | How does a night resume? (AR-07)                   | Saved cursor, per the F2.1 wording; catch-up replay                                 | Spike both at v2 start; replay is cheaper while conditions are time-only                                       |

### 4.5 Field evidence

No Requests rows were added: the P0 items rest on code alone. Open requests that bear on these
findings are R-002 (AR-24 and the conditional F2.8 item), R-003 (AR-02), and R-004 and R-005 (AR-05,
decision 3 and the conditional F2.4 item).
