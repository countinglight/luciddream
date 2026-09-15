# v1 architectural review — 2026-09-14

**Reviewer: OpenAI Codex (GPT-6), AI coding agent.** This is my independent code review, not an owner sign-off or a physical-device validation report.

**Baseline:** `vlads-dev`, commit `97d14743138e1bc6f4ba6ef8ea0ba402b8ab247b`, clean working tree at review start. Remote verified as `git@github.com:countinglight/luciddream.git`. Installed audio dependencies inspected: `expo-audio` 57.0.4 and `expo-keep-awake` 57.0.1.

**Scope:** application architecture, security/privacy boundaries, maintainability, product alignment, and the cost of entering v2 hardening. The owner's remaining process/build work is outside this review. No application code was changed.

## 1. Assessment

**Keep the architecture's core. Fix several lifecycle and privacy defects before expanding it.** The declarative language, pure interpreter, injected ports, phase sequencer, and local storage model are appropriate for the v1 experiment and the v2 phone/host split. A native-engine rewrite, cloud backend, general plugin system, or new state-management framework is not justified by this review.

The weak boundary is between an executing experiment and its UI/platform resources. React currently owns orchestration; completion does not mean audio and disk writes have finished; historical records omit information needed to reconstruct an experiment. These are manageable problems, but checkpoint/resume cannot be added merely by serializing the existing state object.

**Recommended v1 scope:** a bounded correction pass for microphone retention, reliable Stop/cleanup, Android service activation, actual deletion, and script resource limits. Pull forward append-only logging if it fits a separately tested storage change. Keep interpreter continuation, full recovery, observation schemas, and native alarms in v2.

### Sound foundations to preserve

- `src/engine/` actually stays independent of React, Expo, and sibling modules. The AST and ports can support a visual author, host-side validation, and a future executor without changing the product language wholesale.
- `session/sequence.ts` executes phases with fresh interpreter state while sharing audio/context/logging and emitting one run lifecycle. This fits the fixed v1 phases without introducing script imports.
- `use-session.ts` parses all selected scripts and resolves their referenced signals before session acquisition. This is the correct preparation boundary, subject to A10 below.
- Cache versus explicit offline storage, copied file imports, pure context providers, and virtual-clock tests are useful separations. Existing abstractions should be extended rather than replaced.
- Lucid answers are separate from engine events and support `unsure`; absent answers are not automatically converted to `no`. Diagnostics are opt-in, bounded, and outside the engine. The ingest service has bound SQL parameters and no public read API.

## 2. Product and v1-spec alignment

The [research/product vision](../plans/luciddream-research-and-product-vision.md) is strategic guidance. The [v2 plan](../plans/luciddream-v2-plan.md), including D19's fresh v2 data/semantics decision, controls forthcoming implementation. The [redesign note](../plans/luciddream-v1-redesign.md) explicitly supersedes the original tab layout; the sheets and morning question are intentional evolution, not architectural noncompliance.

| Requirement or direction | Assessment |
| --- | --- |
| v1 §1: author and run local audio experiments; no accounts or journal backend | Strong fit. The optional diagnostics service is the explicit §4.8 exception. No need to add future journal/AI features to finish v1. |
| v1 §§3, 4.1–4.3: declarative engine, ports, simulated context, phase isolation | Strong structural fit. Parser guardrails and missing-value semantics need attention (A4, A9). |
| v1 §§2.2, 2.4, 4.4: offline execution, immediate Stop, screen-off operation | Preflight is present; cancellation and Android runtime assumptions have concrete gaps (A2, A3, A10). |
| v1 §4.2: serializable execution state | Not implemented as described: statement position and continuation live in recursive async calls (A7). This is planned v2 F2.1 work, not a cheap v1 addition. |
| v1 §§2.3, 4.6: deletion and microphone privacy | Current implementation conflicts with the user-facing guarantees (A1, A6). |
| v1 §§1–2: useful morning log and context readings | Logs capture execution requests and unavailable fields, but not successful context readings or actual ducking. Persistence also has completion races (A5, A8). |
| Vision §§6.2, 8.2, 11.2: interpretable experiments and faithful reports | The run identity and separate answer are a start. Immutable protocol/settings snapshots and observed-versus-requested events must precede host analysis (A8). |
| v2 D2/D3/D7/D23: TypeScript hardening, separate host, file transport | Current ports support this direction. Extract a session service and version the export contract; do not turn the telemetry backend into the personal archive. |

Field evidence is not absent: [v1 evidence E-001/E-002](../evidence/v1-evidence.md) records an external TestFlight install and two reported eight-hour runs without crashes. Their platform/build, screen state, battery, and log completeness are not established. Existing R-001–R-005 cover those uncertainties. R-003's suspicion about missing recorder preparation is stale relative to this commit: `prepareToRecordAsync()` now exists; actual device behavior remains an open observation. New R-009 requests a specific Android service/Stop check, without discounting the successful runs.

## 3. Prioritized findings

P1 means a correction is recommended before wider v1 use because it affects the core night or a privacy promise. P2 means material follow-up, with the release placement stated explicitly. P3 means inexpensive maintenance protection. These are review recommendations, not a claim that the entire v2 quality gate now blocks v1.

### A1 — P1: voice metering retains bedroom audio

**Evidence:** [`use-voice-interrupt.ts`](../../src/hooks/use-voice-interrupt.ts), lines 29–62, starts a normal recorder and only stops it on cleanup. There is no recording-file deletion. `app.json` promises “Nothing is kept or sent”; v1 §4.6 says never recorded. In the installed SDK, Android `AudioRecorder.kt` creates a cache file and calls `setOutputFile`; iOS `AudioRecorder.swift` selects the cache directory. Stop/release does not delete those files. Expo also documents [cache-backed recordings](https://docs.expo.dev/versions/latest/sdk/audio/).

**Consequence:** an enabled overnight microphone can leave a recording in app cache until eviction and consume storage. This is local retention, not evidence of upload. Cache is not equivalent to “never recorded.”

**Follow-up:** for v1, own the temporary recording URI, stop and delete it on every exit, clean up owned remnants after interrupted sessions, and disclose temporary recording accurately. Cleanup must handle cancellation during recorder preparation. If literal no-recording semantics are required, disable this feature pending a metering-only adapter; that adapter is larger work. The hook's permission/error result is currently discarded by `SessionProvider`, so also expose failure to enable the feature. Test denied permission, preparation races, normal stop, and recovery cleanup.

### A2 — P1: Stop and completion do not own resource termination

**Evidence:** [`interpreter.ts`](../../src/engine/interpreter.ts), line 128, awaits `handle.finished` without cancellation. [`expo-audio-port.ts`](../../src/audio/expo-audio-port.ts), `release()`, also waits for every latest playback before removing players. [`session.ts`](../../src/session/session.ts), lines 87–125, launches cleanup without awaiting it and returns only the interpreter's `done`.

**Consequence:** Stop during `play: { wait: true }` waits for the clip; if no completion arrives, it never finishes. With fire-and-forget playback, the UI can report stopped while sound continues. A paused/failed player can strand cleanup and notification dismissal. A new run can begin while old cleanup still touches the shared wake-lock tag/notification. Setup failure after acquisition can leak resources because setup has no encompassing rollback.

**Follow-up:** make playback waits abortable, distinguish graceful completion from immediate stop/error disposal, and make session `done` include teardown. Use a single idempotent cleanup path for startup failure and terminal exit; serialize/catch notification updates before final dismissal. Preserve the intended final fire-and-forget clip on normal completion, with a bounded failure path. Add lifecycle tests, including stop while ducked, missing playback completion, acquisition failure, and immediate restart. A direct probe confirmed that Stop cannot settle a never-finishing playback today.

### A3 — P1: Android background-service ownership is assumed, not activated

**Evidence:** [`keep-alive-track.ts`](../../src/session/keep-alive-track.ts), line 30 onward, creates and plays a loop but never calls `setActiveForLockScreen`. No application source calls it. In installed Expo Android `AudioPlayer.kt:100`, that call binds the playback service; `AudioPlaybackServiceConnection.kt` starts/binds `AudioControlsService`, which promotes itself to foreground. The separate local notification does not perform this operation. [Expo's background-playback documentation](https://docs.expo.dev/versions/latest/sdk/audio/) specifies lock-screen activation for sustained Android playback.

Also, [`wake-lock.ts`](../../src/session/wake-lock.ts) calls `expo-keep-awake`: the installed Android implementation sets `FLAG_KEEP_SCREEN_ON`. It does not acquire the partial CPU wake lock claimed by the comment and v1 §4.4. The [KeepAwake documentation](https://docs.expo.dev/versions/v55.0.0/sdk/keep-awake/) describes screen wakefulness.

**Follow-up:** explicitly activate/deactivate the session's Android playback-service owner and verify its interaction with the existing Stop notification and system play/pause controls. Correct the wake-lock terminology and decide whether keeping the display on is actually desired. This is a small adapter correction with meaningful device regression risk, not a reason to build the v3 native engine. Validate with voice interrupt off so its recording service cannot mask the issue (R-009). Do not claim these code gaps prove the reported overnight runs failed.

### A4 — P1: declarative scripts have no resource budget

**Evidence:** [`parse.ts`](../../src/engine/parse.ts) recursively traverses YAML without source-size, node-count, depth, or alias-cycle limits; `requireNumber` rejects NaN but accepts infinity. Unknown option keys are ignored and any numeric script version is accepted. [`interpreter.ts`](../../src/engine/interpreter.ts), `execRepeat`, can run entirely through immediately resolved promises.

**Consequence:** an accidentally malformed or untrusted imported script can exhaust stack/memory or monopolize the JS event loop. `repeat: infinite` containing only `log`/`set` has no timer yield; UI Stop and timers cannot get a turn. This is a denial-of-service boundary even though there is no embedded arbitrary-code execution.

**Follow-up:** add bounded parsing, cycle detection, finite numeric/duration validation, supported-version validation, and a cooperative execution budget that yields to the platform after bounded work. Do not rely on an `await` alone as a scheduling yield. Preserve legitimate overnight waits/infinite loops. Reject unknown execution options with a node path, while defining whether harmless root metadata is permitted. Test cyclic aliases, huge/deep input, `.inf`, option typos, and responsiveness during a tight loop. These guards also protect the future AI/visual-author import path.

### A5 — P2: log durability has neither a completion boundary nor a bounded cost

**Evidence:** [`jsonl-log-port.ts`](../../src/logging/jsonl-log-port.ts), lines 19–40, keeps the whole log in memory and rewrites it per queued event; errors are swallowed. There is no public drain/close or failure status. [`use-session.ts`](../../src/hooks/use-session.ts), lines 253–279, publishes terminal UI state and starts index persistence without waiting for the log. `useRunEvents` rereads on that state change, not when persistence finishes.

**Consequence:** Good morning/export can read a prefix or missing file and remain stale; a run can appear successfully logged after disk failure. Repeated full writes have quadratic total write cost for spaced events and risk damaging the existing record during interruption. Future sensor events make the “few hundred lines” assumption untenable.

**Follow-up:** the best direct hardening pull-forward is **F2.2 plus a drain/close and log-health contract**. Implement ordered append on native and equivalent ordered records on web, with shared adapter contract tests. Finalize the summary/readable result after writes settle; surface incomplete logging without stopping audio. Treat a truncated final line explicitly during recovery. Append alone is not a transaction or a guarantee against all data loss. If the append change exceeds the v1 budget, add drain/failure visibility now and leave the writer replacement as the first v2 storage task.

### A6 — P2: Delete removes indexes but leaves private content

**Evidence:** [`nights.tsx`](../../src/app/nights.tsx), lines 126–140, deletes run summaries and lucid answers but never deletes `logs/<id>.jsonl`. [`library-context.tsx`](../../src/context/library-context.tsx), `removeItem`, uses `removeOfflineCopy`, which deliberately does nothing for imported `file` sources and leaves URL caches.

**Consequence:** removed runs/files remain on disk, become inaccessible through normal UI, and accumulate. This conflicts with the meaning of Delete and with v2's “every stored thing can be deleted.” Removing an offline copy and deleting a library item are different operations.

**Follow-up:** move deletion into small repository operations that remove owned content plus metadata, report/retry failures, and refuse deletion of active-run resources. Serialize against run finalization so a deleted active run is not resurrected. Recommend this bounded privacy/storage fix in v1. Test individual/all run deletion, imported files, URL cache/document copies, partial failure, and active-run protection.

### A7 — P2: run ownership and continuation need an explicit service

**Evidence:** [`use-session.ts`](../../src/hooks/use-session.ts) owns preflight, settings, storage, telemetry, lifecycle, and many UI projections. Its one-run guard is a ref populated only after async startup, so concurrent starts during preparation are not guarded; Stop during preparation is ineffective. `SessionProvider` above navigation usefully survives screen changes, but does not provide process recovery. [`interpreter.ts`](../../src/engine/interpreter.ts), `ExecState`, contains ports and an AbortController and omits the current statement/call stack. [`lib/nights.ts`](../../src/lib/nights.ts), line 52, calls any summary without `endedAt` “running.” Telemetry recovery does not repair that summary and exists only for opted-in diagnostics.

**Follow-up:** add a synchronous startup guard/cancellation token and wait for teardown in v1. For v2 F2.1/F2.9, introduce a React-independent session service with a subscribable snapshot, explicit `preparing/running/stopping/terminal` states, and a serialized run repository. Local interrupted-run detection must work without telemetry consent. Checkpoints need versioned explicit execution frames, phase index, loop/scope state, deadlines, and a frozen run plan. Recovery must define late-cue handling and reconcile checkpoint/log progress. A crash between playback and durable acknowledgement cannot be solved by JSON serialization alone; record uncertainty and avoid blindly replaying a possibly delivered cue.

### A8 — P2: today's run record cannot reproduce or fully explain a night

**Evidence:** `RunSummary` stores a display name, timestamps, counts and reason; [`parseRunName`](../../src/lib/nights.ts) reconstructs phase metadata by splitting that display name. There is no durable source/AST, preset/settings snapshot, content identity, or structured phase plan. Engine `play` records a successful adapter call, not confirmed acoustic delivery. Successful context snapshots are discarded by `evalCondition`; voice duck/resume bypasses logging. Disabling playback logs makes Good morning's count-from-events report zero even when the in-memory play count was nonzero.

**Consequence:** renamed/replaced scripts cannot be tied reliably to historical behavior. The host cannot distinguish a requested cue from interrupted output, or absent measurements from measurements never recorded. Parsing display text also breaks on user names containing its separators.

**Follow-up:** before F4.3 export/host work, define a versioned `RunPlan` plus immutable run manifest: structured phases, exact script sources/normalized versions, expanded presets, settings, and signal content identities. Define events with sequence/statement identity and requested/started/finished/interrupted outcomes where observable; preserve “unknown” where not observable. Store actual observations and ducking changes. Keep essential experiment records independent of optional diagnostic verbosity; user-facing counts must say unavailable when omitted. Keep original user reports, later edits, and model annotations separate. Full schema work belongs in v2; D19 means no v1 migration framework is needed.

### A9 — P2: missing context can enable a negated cue gate

**Evidence:** [`conditions.ts`](../../src/engine/conditions.ts), lines 47–56, maps a missing field to false and then negates it to true. The probe `not: { rem: true }` with no REM reading returned true plus `missingFields: ['rem']`. Existing tests cover negation with available values, not this case. `ContextSnapshot.at` is not used to assess freshness, and snapshots lack source/provenance.

**Follow-up:** implement v2 **F3.1 before F3.2/F3.3**, with explicit true/false/unknown truth tables and branch policy, then F3.5 availability/time/provenance. Preserve the missing-reading event. Do not quietly pull the new truth semantics into v1: the plan explicitly treats them as v2 behavior, and changing branches can change which cues existing experiments play. In v1 documentation, explain the current limitation and avoid examples treating negated missing readings as evidence.

### A10 — P2: prepared content is not protected from mutation or partial persistence

**Evidence:** [`library-content.ts`](../../src/storage/library-content.ts), line 25, accepts imported-file paths without checking existence. Native download writes directly to the final destination; later resolution accepts existence as validity. `LibraryProvider.persist` updates UI then discards the storage promise; async mutations use captured `persisted` snapshots. `resolveSignalMap` maps by name and silently lets later duplicate names win. Library removal/offline actions are not coordinated with an active run's lazily created players.

**Consequence:** missing/partial audio can pass preflight; library changes can invalidate a later phase; concurrent imports can lose metadata; a duplicate signal name can change what an existing script plays. An offline badge does not prove persistence succeeded.

**Follow-up:** in v1, check local existence, stage downloads before promotion and remove failed partials, await/report writes, and reject ambiguous signal names. Protect resources referenced by an active plan. In v2, consolidate mutation queues in a library repository and pin immutable resolved assets for each run; add schema validation at stored-data/import boundaries. Add download size/time limits as part of A4's import boundary. This is application-local integrity work; no server-side request-forgery claim is implied by user-selected URLs.

### A11 — P3: enforce the boundaries that already work

**Evidence:** [`eslint.config.js`](../../eslint.config.js), line 23, blocks selected `@/folder/*` patterns but misses bare barrel imports, relative sibling imports, `@/lib`, `@/context`, and `@/hooks`. Current engine code respects the rule's intent anyway. Storage composition is exported from a React context, and `session.ts` imports the whole Settings type for one audio-focus field. Existing tests cover pure units much better than the session composition boundary.

**Follow-up:** tighten engine import enforcement, move platform-store creation into a small composition module, and let adapters accept narrow options. Add a session-level fake-resource harness for preparation, cancellation, cleanup and persistence ordering. Do not split cohesive files solely by line count or add interfaces with no concrete consumer. For v2, the useful boundaries are engine, session orchestration, platform adapters, repositories, and read-only UI projections.

### Diagnostics security boundary

The optional ingest token is correctly documented as public inside the app, not a user-authentication mechanism. Keep it that way. Before broader diagnostics activation, limit request bodies while reading them (the worker currently buffers `request.text()` before its second size check), apply an appropriate ingest quota/rate limit, and project an allowlisted payload rather than retaining arbitrary extra submitted keys. Sanitize free-form error messages before upload: truncation alone does not remove a local path, URL credential, or user text. These are bounded follow-ups around [`telemetry/worker`](../../telemetry/worker/index.js) and `src/telemetry`; deployment configuration was not audited. Do not add personal journal or recording upload to this service.

## 4. v2 hardening: dependencies and pull-forward decision

The [v2 plan §4.2](../plans/luciddream-v2-plan.md) makes the complete package release-blocking for **v2** (D14). Its items are not equally cheap or independent.

| Item | Architectural dependency / mismatch | Placement |
| --- | --- | --- |
| F2.1 checkpoint/resume | Explicit continuations, immutable plan, local recovery, ordered durable progress; current recursive promises cannot resume. | Keep in v2. Stabilize ownership first (A7). |
| F2.2 append-only log | FileStore lacks append/drain and readers race the writer. Shared native/web contract needed. | Best direct v1 pull-forward, isolated from resume (A5). |
| F2.3 Android exact alarms | Requires a recoverable next deadline and native-to-JS startup path independent of mounting the Run screen. Registering an alarm alone cannot resume this interpreter. | Keep in v2, after F2.1; honor the owner's pending platform-policy review. |
| F2.4 night ambience | A platform audio owner already exists but needs A2/A3. Turning ambience off creates a reliability question during silent gaps, especially on iOS. | Fix ownership in v1; keep the audible feature, off-mode behavior and device validation in v2. |
| F2.5 cue-time notifications | Arbitrary conditionals, infinite loops and playback waits prevent computing every future cue at start. | Keep in v2. Specify notifications for known deadlines/a rolling horizon; do not imply they execute missed cues. |
| F2.6 route handling | Playback handles have no interrupted/error outcome; release can wait forever. | Pull forward A2's bounded termination, not the complete route policy. Keep route events and continuation behavior in v2. |
| F2.7 device gate | Unit fakes cannot establish screen-off behavior. Existing reported runs are useful but incomplete evidence. | Reuse targeted v1 device checks after runtime changes; retain the full both-platform v2 matrix. |
| F2.8 battery measurement | Needs platform reader and persistent start/end observations, including an unknown end after process loss. | Keep in v2; small code is not sufficient reason to add a new measurement feature to v1. |
| F2.9 honest interruption report | Local unfinished-run reconciliation is currently absent; optional telemetry is not the product record. | Keep full report in v2. A local “interrupted/unknown” summary is a possible bounded early slice, with no resume promise. |

**Recommended v2 implementation order:** session ownership and termination → durable log/run repository → immutable plan/event/checkpoint schemas → explicit interpreter continuation and recovery → Android alarm bridge → route/ambience/notification integration → observation/battery and morning reporting → physical-device gate. F3.1 must precede real condition sources. Design F4.3's bundle schema alongside the run schemas so the host does not acquire a second incompatible record format.

## 5. Follow-up queue

Effort estimates cover implementation and focused automated checks, not device nights: **S** roughly half a day or less, **M** roughly one to two days, **L** several days or more. They are planning estimates, not commitments. Multiple small items still form a meaningful release change; do not silently expand this into the whole v2 program.

| Order | Action | Release | Effort / regression risk | Acceptance evidence |
| --- | --- | --- | --- | --- |
| 1 | A1: temporary mic-file ownership, cleanup and truthful disclosure; surface unavailable voice interrupt | v1 correction | S–M / medium | Preparation/stop race fixtures; owned files absent after stop and relaunch cleanup; device mic check |
| 2 | A2 + small A7 guard: abortable Stop, rollback, awaited teardown, prevent overlapping starts | v1 correction | M / medium | Stop during playback/duck/startup; cleanup failure; no-completion callback; next run unaffected |
| 3 | A3: explicitly own Android playback service; correct screen-wake assumptions | v1 correction | S / medium on device | R-009 plus relevant existing overnight evidence requests |
| 4 | A6: delete owned log/library content; protect active resources | v1 correction | S–M / low–medium | Files and metadata removed; partial failures visible; no resurrection |
| 5 | A4: bounded input and execution; A10's missing/partial-file and name checks | v1 correction, split into focused patches | M / medium | Malformed input rejected readably; Stop remains responsive; invalid content fails before acquisition |
| 6 | A5: F2.2 with drain/failure visibility | Pull into v1 if budget permits | M / medium | Ordered append, burst load, interrupted write, disk failure, immediate morning read/export; both storage adapters |
| 7 | A11: import-boundary rule | v1 if convenient | S / low | Fixture violations blocked; current engine permitted |
| 8 | A7/A8/A9/A10: session repository, resumable interpreter, immutable records and condition semantics | First v2 architecture work | L / high if bundled | Kill/relaunch at each boundary; no cue burst; unknown preserved; bundle round-trip fixtures |

If v1 timing is tight, prioritize 1–3 and the deletion correction, and explicitly track remaining guardrails/logging work. Do not describe checkpoint/resume, native alarms, or tri-state semantics as low-regression v1 cleanup. No v1-to-v2 migration project is recommended under D19.

## 6. Review validation and limits

- Read the relevant vision/spec/redesign/v2 plans, current field evidence, runtime and persistence code, diagnostics client/worker, and their test seams. Checked installed native source where comments depended on Expo behavior. This is a source-level architectural review, not a dependency vulnerability audit or penetration test.
- Ran nine targeted existing suites directly through Jest, avoiding the generating `pretest` hook: engine parse/interpreter/conditions; session sequence/clock; audio adapter; library content; JSONL log; telemetry. **78 tests passed, nine suites passed.** The full pre-push suite, lint, typecheck, and formatting sweep were not run; no application code changed.
- Ran disposable in-memory Node probes against the actual TypeScript modules. Results: version `999`, `gain: .inf`, and misspelled `wiatt` accepted; a cyclic YAML body alias raised `RangeError` rather than a node-specific parse error; negated missing REM returned true; stopping a never-finishing blocking playback left `done` unresolved; 10,000 log-only iterations completed before an already scheduled timer could run. These support A2/A4/A9 and are not device performance measurements.
- No physical-device run, battery measurement, cloud deployment inspection, or store-rule approval was performed. Existing evidence remains authoritative for reported observations. Proposed tests in the findings are acceptance work for future fixes, not claims that those fixes already exist.
