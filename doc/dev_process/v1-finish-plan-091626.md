# v1 finish plan — 2026-09-16

What stands between the current state and the v1 finishing line, found by reading every v1 document
against the code, the GitHub issues and the evidence log.

**Written by:** Claude Opus 5, 2026-09-16, on branch `vlads-dev`. **Status:** plan; nothing in §3–§5
is done yet.

**The finishing line** (agreed 2026-09-15): a hardened build, verified by the owner on devices, is
in testers' hands through the two beta channels, and their feedback is being collected. Publishing
to Google Play and the App Store is **not** part of v1; it moved to the
[v2 plan](../plans/luciddream-v2-plan.md) (F9.1, decision D36) on 2026-09-16.

---

## 1. Where v1 stands

| Milestone              | State                    | Basis                                                                                                                  |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| M1 Engine              | Done                     | Tests; [hardening summary](v1-hardening-091526.md)                                                                     |
| M2 Audio and library   | Done                     | Tests; owner's completion report E-004                                                                                 |
| M3 Run and session     | Done, device checks open | E-002 (two 8-hour nights, before hardening); R-010 asks again for the hardened build                                   |
| M4 Logging and context | Done                     | Tests                                                                                                                  |
| M5 Android release     | Works **by hand**        | E-008. No `release-android.yml`, so the exit criterion "a version tag produces a GitHub Release" is not met as written |
| M6 iOS release         | Works                    | E-001, E-006, E-008. `release-ios.yml` has not yet been proven by a tag push                                           |

Evidence ids refer to [v1-evidence.md](../evidence/v1-evidence.md).

## 2. Your track: usability testing for show-stoppers

**A show-stopper** is anything that makes a tester's night fail or mislead them: the night stops
early, plays nothing, plays at the wrong time, cannot be stopped, loses or misreports the log, lights
the room, or confuses someone who is half asleep. Anything else is polish and goes to v2.

**Reporting:** one GitHub issue per show-stopper, titled `BLOCKER v1: …`, matching the existing
`POLISH v1:` convention, with platform and build. Tell me in chat what else you observed and I will
record it as evidence.

Checks worth folding into your sessions, because each also closes an open evidence request:

| Session                                     | Look for                                                                            | Closes              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| A full Android night, screen locked         | Survives 8 hours; notification Stop ends playback; battery start and end percentage | R-009, R-010, R-014 |
| The same on an **upgraded** Android install | The run notification does not light the screen on each event                        | R-011               |
| A full iPhone night, locked, ringer silent  | Survives; sounds audible; battery                                                   | R-005               |
| iPhone layouts                              | Fonts, Settings keyboard, glass effects on the oldest tester phone                  | R-006               |
| Voice interrupt on, one night per platform  | A loud sound lowers playback; afterwards the app's cache holds no recording         | R-003, R-012        |
| Force-quit mid-night                        | Nights shows **Interrupted** with a sensible time; the log is readable              | R-013; hardening D6 |
| First-time setup as a new tester            | Install page steps, adding a script and a sound, the first night — without help     | issue #3 (below)    |

Open questions about past runs that only testers can answer: R-001 (platforms of the two early
nights), R-004 (screen state then), R-008 (which path built the build the external tester installed).

## 3. Decisions (owner, 2026-09-17)

| #   | Decision                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Tag-driven release automation, as proposed: `release-android.yml` builds the APK on EAS and publishes it as a GitHub Release asset; `npm run release` prepares the version, commit and tag locally and never pushes. Expected cadence is one or two releases a week, well inside EAS's free allowance.  |
| F2  | Tester APKs come from the EAS `preview` profile from now on. R-015 was answered by inspecting the published asset (E-009): releases up to v0.6.0 were built locally and debug-signed, so the first workflow-built release costs testers one uninstall. After that, upgrades must never lose data again. |
| F3  | Beta diagnostics are to be switched on — see §4 for what that needs, including one step only the owner can do.                                                                                                                                                                                          |
| F4  | v1 testers are all internal (organisation members). No external TestFlight group, no public link, no Beta App Review. External testing is v2 (v2 plan F9.3).                                                                                                                                            |
| F5  | Issue #3 is fixed for v1.                                                                                                                                                                                                                                                                               |
| F6  | Answered 2026-09-17. #4 closed. #7 stays open and its four items are **v1 release blockers** — v1 ships when it is clean, not on a date. #8 stays open as the owner's reminder; it already names the Cloudflare setting. #3 was commented and closed.                                                   |

## 4. Work items

### Done 2026-09-17

- **F1.** `.github/workflows/release-android.yml` and `scripts/release.js` (`npm run release`), with
  `BUILD.md` §4 and §2 and v1 spec §5.1 rewritten around them, including the signing rule from F2.
- **F5.** The Library's URL import no longer requires a name: it falls back to the file name in the
  address, exactly as the file import already did. Test added.
- **F4.** The website's 10 TestFlight placeholder links now point at the install page; the install
  page's iOS steps say invitation-only and mention the junk folder (E-007); `release.js` lost its
  TestFlight handling. v1 spec §5.2 and v2 plan F9.3 record internal-only for v1.
- **Link rot:** the owner archived the iOS support plan in `88a05c3`; eight live documents and
  scripts still pointed at its old path. All now point at `doc/archive/` or at `BUILD.md`.

**Not yet validated:** `node_modules` is empty in the working tree, so lint, typecheck, tests and
Prettier have not run over any of this. `npm ci` first.

### Open

**Cleanup before the v1 release (issue #7) — done 2026-09-17.** Logged as polish during the
hardening pass, made release blockers by the owner. The full gate passes after all four: Prettier,
LF, lint, typecheck and 347 tests.

| #   | Item                                        | What changed                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | `expo lint` served stale cross-file results | `lint` and `lint:fix` now pass `--no-cache`. Replacing `expo lint` with plain `eslint .` was tried and rejected: it reports 83 errors, because Expo's wrapper sets the scope and environment the config expects.                                                                   |
| W2  | Jest "did not exit" on every full run       | A real leak, not a test artefact: `ExpoAudioPort.release()` raced pending plays against a timeout and never cleared the timer when the plays won, so the event loop stayed alive for the whole `RELEASE_TIMEOUT_MS` after teardown. The delay is now cancellable. Warning is gone. |
| W3  | `reset-project` could delete `src/`         | Script and its `package.json` entry removed; the deletion is staged.                                                                                                                                                                                                               |
| W4  | No distinct "stopping" state                | `stopping` is no longer collapsed onto `running`: Sleeping shows **ENDING THE NIGHT** and the hold button reads "Ending the night…", and Begin stays unavailable on Tonight until the previous night has finished winding down.                                                    |

W4 has no automated coverage: `src/app/` has tests for the Library screen only, so the Sleeping
screen's wording needs one look on a device or the emulator.

**Issue housekeeping (F6), settled 2026-09-17:** #4 closed as done; #3 commented and closed; #8 left
open for the owner, since its text already names the Cloudflare setting and its path; #7 stays open
until W1-W4 are done.

- **F3 diagnostics, owner step:** the two `EXPO_PUBLIC_TELEMETRY_*` variables are **EAS** environment
  variables, not Cloudflare ones, and only the owner has the token value, because a Wrangler secret
  cannot be read back. Set them on expo.dev or with `npx eas-cli env:create` for `preview` and
  `production`, then rebuild ([luciddream-telemetry.md §7.2](../plans/luciddream-telemetry.md)).
- **F3 diagnostics, agent:** a `telemetry:dump` script for a full export and an errors query, next to
  the existing `telemetry:nights`. The authenticated download tool stays v2 (F9.6).
- **F3 diagnostics, owner:** App Store Connect App Privacy must then declare crash and diagnostic
  data, not linked to the user, not used for tracking.
- **BUILD.md §5 iOS release** lists `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER_ID` as
  required secrets. EAS created and stored an App Store Connect API key during the first manual
  submit (E-006), so the workflow may not need them. Prove on the first tag push, then correct.
- **BUILD.md troubleshooting: iOS build fails with "Runtime version mismatch".** On 2026-09-16 a
  file inside `node_modules` edited by Android tooling changed the local `expo-updates` fingerprint
  and EAS refused the build. `npm ci` before an iOS build prevents it. Not documented yet.
- **`preandroid:apk:*` scripts** run `expo prebuild` every time, which fails with `EBUSY` while a
  Gradle daemon holds `android/`. Proposed on 2026-09-10 and still unanswered: prebuild only when
  `android/` is missing, and make `versionCode` read `package.json` at build time like `versionName`.
- **Release notes for the next release:** `doc/release/v<version>.md` now controls the GitHub Release
  title and notes. The next one must tell Android testers to uninstall once (F2).
- **Web app security headers (review AR-17)** are still missing from `public/_headers`. Cheap; v1 or
  v2 is the owner's call.
- **Review findings with no recorded destination:** AR-13, AR-18, AR-21, AR-22, and the voice
  interrupt's 500 ms status poll from AR-24 (the elapsed-time ticker part is fixed). Move them to the
  v2 plan §7.4.
- **Stale status in dated documents:** the redesign note still names its branch and a "Not done"
  list; the hardening summary's §3 checklist shows the push and the `format` commit (C5, done in
  `f22a134`) as open; the website plan's "no release workflow exists" note. Each gets a short dated
  pointer, per AGENTS.md.
- **Issue #7 item 3:** `npm run reset-project` is still the Expo template script that deletes `src/`.

## 5. Order to the finishing line

1. Owner: `npm ci`, then `npm run check` over the 2026-09-17 work.
2. Owner: the F3 diagnostics variables; usability sessions (§2) in parallel.
3. Me: the remaining §4 items, one commit each.
4. Owner: cut the first release with `npm run release`. That tag proves `release-android.yml` and
   `release-ios.yml` at once, and its notes carry the one-time uninstall.
5. Owner: triage `BLOCKER v1:` issues with me; I fix them; repeat step 4 per fix.
6. Hand the release to testers. v1 is finished when feedback is flowing.
