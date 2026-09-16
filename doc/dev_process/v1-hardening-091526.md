# v1 hardening session — 2026-09-15

Summary of what changed, what a user will notice, and what is left for the owner.

**Written by:** Claude Opus 5, during the unattended hardening session of **2026-09-15**, on branch
`v1-hardening`. **Status:** the code changes are committed and unpushed. Everything in §5 onwards is
work this session could not do, or deliberately did not do.

Source material: the two architectural reviews
([Claude](review-architectural-091426.md), [Codex](review-architectural-091426-codex.md)), the
[v1 spec](../plans/luciddream-v1-spec.md), the [v2 plan](../plans/luciddream-v2-plan.md) §4.2, and
the owner's answers recorded in §6 below.

---

## 1. What changed

24 commits on `v1-hardening`, ahead of `master`. 335 tests pass (up from 224); lint and typecheck
are clean. Grouped by what each was for:

**Ownership of the night** — `0061fd4`, `f419dc6`, `2c9616b`
A React-free `NightSession` with an explicit state machine now owns a run; `useSession` subscribes
to it. A composition root (`src/runtime/services.ts`) lets launch-time code reach storage without
the React tree. The engine's import rule became an allowlist. Two defects fell out of the old shape
and are fixed: Stop during preparation did nothing, and a failed start left the previous night's id,
cues and lucid question on screen.

**Staying alive overnight** — `52a5bdb`, `7611178`
Android now registers the keep-alive player for lock-screen controls, which is what binds the media
foreground service; without it, expo-audio's own types say background playback stops after about
three minutes. The screen is no longer held lit, and the run notification dropped to LOW importance
so it stops waking the screen on every event.

**Not hanging, not leaking** — `0061fd4`, `d15234a`
Playback waits, `release()` and teardown are all bounded; one cue whose completion callback never
arrived used to stall the night _and_ hold the wake lock, keep-alive track and notification until
the process died. Players are created at preflight. The log appends instead of rewriting, batches
bursts, exposes `drain()` and counts records it failed to write.

**Honesty about what happened** — `19e1b63`
A night the OS takes away is closed as `interrupted` at the next launch, for every user, with an end
time that says how precisely it is known.

**Privacy** — `c59fa1d`, `1bcdcb0`
The voice-interrupt recording is owned and deleted, including after a kill. Delete now removes log
files and library content in both roots, and orphaned logs are swept at launch.

**Bad input and crashes** — `6c7bf16`, `39fb84c`, `d20481a`
Parse budgets (size, depth, node count, alias cycles), finite numbers only, unsupported versions and
unknown keys refused by name, and a cooperative yield so a loop that never waits cannot freeze the
app. Persisted settings are validated field by field. A root error boundary means a render crash
cannot leave the app permanently unopenable. Missing imported files and half-finished downloads are
caught at preflight.

**Consistency and diagnostics** — `7315c31`, `257bdbe`
One definition of the period presets. Telemetry redacts messages before queueing, shares the single
open-run marker, and its Worker projects an allowlisted payload with a bounded body read and a
per-install daily quota.

**Docs and harness** — `6b4fdfd`, `0cf5538`, `2cd50f1`
Spec corrections, README structure, Maestro flows, this document.

## 2. What a user will actually notice

Everything else above is invisible if it works. These are not.

| Change                                                 | What they see                                                                                                             | Deliberate?                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **The screen no longer stays lit** during a night      | The phone dims and locks normally instead of glowing all night                                                            | Your hard requirement                                       |
| **Android notifications stop waking the screen**       | The run notification sits silently in the shade rather than flashing up on every cue                                      | Follows from the same requirement                           |
| **Interrupted nights**                                 | A night the OS killed shows an **Interrupted** pill and "last seen 03:12" instead of claiming to still be running forever | You selected this                                           |
| **Stop works while a night is starting**               | Tapping Stop during "Beginning…" now actually stops it                                                                    | Bug fix                                                     |
| **A failed start is about _this_ night**               | The error screen no longer shows last night's cues or ask the lucid question for the wrong night                          | Bug fix                                                     |
| **Scripts with typos are refused**                     | `wiatt: 5m` now refuses to start, naming the key, instead of silently never waiting                                       | C2 below — your call                                        |
| **A script with an unknown version is refused**        | Clear message rather than running under the wrong rules                                                                   | Bug fix                                                     |
| **A missing imported file is caught at bedtime**       | "This file is no longer on the phone…" when starting, instead of a silent dead cue at 3am                                 | Bug fix                                                     |
| **Two sounds with the same name are refused**          | Named in the message, at start                                                                                            | Bug fix                                                     |
| **Delete removes more**                                | Deleted nights and library items actually free their disk space                                                           | Bug fix                                                     |
| **Exports are larger**                                 | The log now records every category; toggles filter display and export                                                     | C4 below — your call                                        |
| **A crash shows a recovery screen**                    | "Something went wrong… Try again", instead of a blank screen                                                              | Your requirement                                            |
| **A cue that never finishes no longer ends the night** | The night continues and the log says the cue timed out                                                                    | Departure from "failed cue ends the night", explained below |

**No layout changed.** No screen was redesigned, moved or restyled.

## 3. Your follow-up actions

**Before anything else**

- [ ] Read §4 — the Android pair. It is the one thing that can break nights.
- [ ] Run the full gate yourself: `npm run lint && npm run typecheck && npm test`.
      (`npm run check` also runs `format:check`, which fails on 91 pre-existing files — see C5.)

**Then**

- [ ] Build and exercise in the Android emulator: D1, D2, D3, D6, D7 in §5.
- [ ] Physical device for D4 (recording deleted) and D8 (battery).
- [ ] Answer C1–C6 in §6, or tell me to pick defaults.
- [ ] Push when you are satisfied:

```bash
git push origin v1-hardening
```

**Optional, when you choose**

- [ ] One isolated `npm run format` commit to unbreak `format:check` (C5).
- [ ] `npm run telemetry:db:schema` before the telemetry Worker is ever deployed (§7).
- [ ] Run the Maestro flows once and fix whichever selectors need it (`npm run e2e`).

## 4. The one thing to read before shipping

Two commits must travel together:

- `52a5bdb` makes the keep-alive player register for Android lock-screen controls, which is what
  binds expo-audio's media foreground service.
- `7611178` stops holding the screen on.

expo-audio's own types state that without that registration, **Android background playback stops
after about three minutes** (an OS limitation). Nothing in the app had ever called it, which means
the screen keep-awake was the only thing holding Android nights up. Taking the screen away without
the service fix would kill nights within minutes.

**Reverting `7611178` alone is safe. Reverting `52a5bdb` alone is not.**

## 5. Verify on a device before trusting a build

Nothing in this section was verified. Unit tests and code review are all that stand behind it.

| #      | What to check                                                                                                                                                                                                                     | Why it matters                                                                                                                                                       | Related                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **D1** | **An Android night survives with the screen locked**, voice interrupt off, through a long silent wait. Confirm a media foreground service is actually active and that notification Stop ends playback.                            | **The single highest-risk item of the whole pass.** Two commits changed how a night stays alive on Android, and they are a pair. See §4.                             | R-009, commits `52a5bdb` + `7611178` |
| **D2** | **The screen no longer stays lit** during a run, on both platforms, and the night still survives.                                                                                                                                 | Owner requirement. Liveness now rests entirely on the audio session.                                                                                                 | `7611178`                            |
| **D3** | **The run notification no longer wakes the screen** on Android, on an install upgraded from an earlier build (not a fresh install).                                                                                               | Android fixes channel settings at creation; the code creates a new channel id and deletes the old one, which is exactly the path that needs a real upgrade to prove. | `7611178`                            |
| **D4** | **The voice-interrupt recording is really deleted** — after a normal night, after Stop during startup, and after a kill mid-night. Check the app's cache directory is not growing by ~230 MB (iOS) or ~44 MB (Android) per night. | Privacy promise in `app.json` and spec §4.6.                                                                                                                         | `c59fa1d`, R-003                     |
| **D5** | **The run log appends on a real device** and a night killed mid-write leaves a readable log with at most a truncated last line.                                                                                                   | `appendText` is exercised only against the in-memory fake in CI; `ExpoFileSystemStore` needs a device.                                                               | `d15234a`                            |
| **D6** | **An interrupted night shows as "Interrupted"** in Nights after a force-quit, with a sensible "last seen" time.                                                                                                                   | New user-visible state.                                                                                                                                              | `19e1b63`                            |
| **D7** | **Delete removes the log file**, and an orphaned log is swept at launch.                                                                                                                                                          |                                                                                                                                                                      | `1bcdcb0`                            |
| **D8** | **Battery over a full night**, now that the screen is off.                                                                                                                                                                        | Spec §2.4 targets under 8 %; the previous figure was measured (if at all) with the screen on.                                                                        | R-002                                |

You mentioned Android Studio is installed — D1, D2, D3, D6 and D7 are all reachable in an emulator.
D4 and D8 need real hardware.

## 6. Decisions you still owe

| #      | Decision                                                                                                                                                                                                                    | What I did meanwhile                                                                                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | **Android cannot honour the Audio focus setting.** expo-audio requires exclusive focus (`doNotMix`) for the lock-screen registration that keeps a night alive. Spec §4.4 defaults to ducking "so alarms still cut through". | Forced exclusive on Android and wrote a line into the night's own log saying the setting was not applied. Note this does not stop a later alarm taking focus from us — it changes what happens to other apps' audio when we start. Spec §4.4 needs amending either way. |
| **C2** | **Unknown keys in a script are now rejected.** `wiatt: 5m` used to be ignored silently, so the script simply never waited.                                                                                                  | Rejected, naming the key. This is a behaviour change for any existing script carrying extra keys. If a tester has one, it will now refuse to start rather than quietly misbehave.                                                                                       |
| **C3** | **A fresh install's `$short` is five seconds.** You chose the Settings values as the single source (AR-20), which is now done. Five seconds is a demo cadence, not a night's.                                               | Unified as instructed and left the values alone. Changing them is a one-line edit in `src/engine/duration.ts`.                                                                                                                                                          |
| **C4** | **The durable log now records everything**; the category toggles filter display and export.                                                                                                                                 | Per your answer. Side effect: exports are larger for users who had categories switched off.                                                                                                                                                                             |
| **C5** | **`npm run format:check` fails on 91 files** — and it is the first step of `npm run check`, so your pre-push gate has been failing at step one. This predates this session.                                                 | Left alone deliberately. A repo-wide `prettier --write` would bury the hardening diffs in thousands of lines. Worth one isolated commit when you choose.                                                                                                                |
| **C6** | **HTTPS-only imports** (AR-14) — not done, because you did not select it and it would break a tester with a saved `http://` URL.                                                                                            | Plain HTTP still works.                                                                                                                                                                                                                                                 |

## 7. Manual steps outside the repo

Nothing in this session touched Cloudflare, EAS, or any deploy path, per your instruction.

- **Telemetry Worker**: hardened but still dormant. No `wrangler` command was run, no resource
  created, and `deploy:telemetry`, `wrangler.telemetry.jsonc` and `scripts/check-telemetry-config.js`
  are untouched. **One new setup step**: the per-install daily quota needs a new table, so
  `npm run telemetry:db:schema` must be run before this Worker is deployed. The schema file is
  idempotent, so re-running it is safe.
- **No push.** The branch is local. When you want it:

```bash
git push origin v1-hardening
```

## 8. Telemetry, in case you roll it back

It is the last commit (`257bdbe`) on purpose, so `git revert 257bdbe` removes the whole thing
without touching anything else. What it contains:

- Error messages are redacted before queueing — URIs, file paths and email addresses become
  placeholders. Script names survive, which is what the diagnostics plan allows.
- The duplicate open-run marker is gone. Interrupted-night detection is now always-on in
  `src/session/run-recovery.ts` and diagnostics report from it, so a user without diagnostics still
  gets an honest Nights screen. **If you revert this commit, that consolidation goes with it** and
  diagnostics lose their reporting path for interrupted nights — the local detection itself stays,
  since it lives in commit `19e1b63`.
- Worker: payload projected from known fields rather than stored as received; body read with a cap;
  per-install daily quota answering 429.

## 9. Minor inconsistencies, logged rather than fixed

Per your instruction not to chase polish.

1. **`expo lint` serves stale cross-file results.** Its cache is keyed on each file's own mtime, so
   a rule like `import/export` can report a dependency's old state indefinitely. `npx eslint src
--no-cache` is the truth. Cost me a detour; worth knowing before it costs you one.
2. **Jest reports "a worker process has failed to exit gracefully"** on every full run. Pre-existing,
   and not investigated.
3. **`npm run reset-project`** is still the Expo template script that moves or deletes `src/`
   (AR-25). It has no business being in this repo.
4. **Stop shows the Sleeping screen briefly** while the night winds down, rather than a distinct
   "stopping" state. The service models `stopping` properly; the screens collapse it onto
   `running` so no layout changed. Fine as it is, but it is a deliberate simplification.

## 10. Owner answers this session ran on

Recorded so a later reader knows these were decisions, not assumptions.

- Extract the night-session service in v1, overriding both reviews, which placed it in v2.
- Visible behaviour changes are allowed; do not regress working scenarios.
- Never hold the screen lit — hard requirement.
- Build for the emulator, do not exercise fully.
- Worker-side telemetry may be designed and coded, but not wired into anything deployable.
- No new native dependencies.
- The bar is embedded-system UI semantics: the user may be half asleep and must never be confused.

## 11. Deferred, with reasons

**Still open from the reviews, deliberately not started:**

- **Run manifest** (AR-10 / A8) — the first log record pinning app build, platform, time zone,
  settings and each phase's script text. You rated it "not too important right now"; it is the
  thing that would make a shared beta log self-explanatory, and it is the natural next piece.
- **Checkpoint and resume** (F2.1), **Android exact alarms** (F2.3), **cue-time notifications**
  (F2.5), **night ambience** (F2.4), **battery measurement** (F2.8 — needs `expo-battery`, a new
  native dependency). All v2 by both reviews' own recommendation.
- **True/false/unknown condition semantics** (F3.1). Both reviews are emphatic this must not be
  slipped into v1: it changes which cues an existing script plays.
- **Clock conditions across midnight** (AR-23). `until: { clock: { gte: "06:00" } }` is already true
  at 23:00, so such a loop ends at bedtime. Documented, not changed.
- **Download size and time limits** (A4's import boundary). `downloadTo` is unbounded; staging now
  means a partial download is discarded, but nothing stops a huge one.
- **Session-level records beyond the interrupted one** (AR-11): ducking and resume, a write-failure
  count in the stop record, per-run sequence numbers. `SessionRecord` in `src/logging/records.ts` is
  the place they go, and `NightSession.note()` already writes one kind.

**Test coverage that is honestly absent:**

- `ExpoFileSystemStore` and `WebFileStore` are not covered by the `FileStorePort` contract test.
  The contract is written and the in-memory fake passes it; the native store needs a device and the
  web store needs a real IndexedDB (`fake-indexeddb` would be a new devDependency).
- No test covers `session.ts` itself — the real Expo wiring. The lifecycle above it is now tested
  through `NightSession` with injected fakes.
