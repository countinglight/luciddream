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

## 3. Decisions needed from you

Each one changes what I do next. My recommendation comes first.

**F1. Android releases: automate, or accept manual for v1?**
Today: merge to `deploy`, bump the version, build the APK, then on GitHub create the release, write
notes, attach the APK. The iOS equivalent is already one tag push. Options:

1. **(Recommended) A tag-driven `release-android.yml`.** EAS builds the APK with the `preview`
   profile; the workflow downloads it from EAS and attaches it to a GitHub Release it creates, with
   notes from a file in `doc/release/`. A single `npm run release -- <version>` on your machine bumps
   `package.json`, commits, tags and prints the push command. The push then releases **both**
   platforms, because `release-ios.yml` fires on the same tag. EAS is only where the APK is built;
   GitHub Releases stays where it is published, so the website's download links keep working. Costs
   one of the 15 free Android EAS builds per month per release.
2. A local `npm run release` script that does everything, including the GitHub Release through the
   `gh` CLI. Needs the APK downloaded from EAS to your machine; slower and leaves more on your PC.
3. Keep releases manual for v1, record that as an accepted deviation from M5 in the v1 spec, and
   leave automation to v2 (F9.2).

Merging into `deploy` stays a separate, deliberate step in every option: it publishes the website
and the web app.

**F2. Which build goes to testers? (R-015)**
BUILD.md says testers must get the EAS `preview` build. `npm run android:apk:release` is signed with
the debug keystore, and a tester moving between the two signatures has to uninstall and loses their
data. Which one produced 0.5.1 and v0.6.0 decides whether testers need a one-time reinstall, and it
must be settled before F1.

**F3. Beta diagnostics on or off in tester builds?**
The ingest service is live, but no build carries its address (the EAS build logs show no
environment variables). Switching it on means adding two EAS environment variables
([luciddream-telemetry.md §7.2](../plans/luciddream-telemetry.md)), a rebuild, and changing the App
Store Connect App Privacy answers to declare crash and diagnostic data. Within Cloudflare's free
plan. Without it, every field fact comes through you.

**F4. TestFlight: public link, or invitations only?**
The website's iOS buttons point to `https://testflight.apple.com/join/PLACEHOLDER` in 10 places
(`site/assets/js/release.js` sets them all). A public link needs an **external** tester group and one
Beta App Review. Otherwise the buttons should say "ask for an invitation" instead.

**F5. Issue #3 in v1?**
Reported on an APK before the redesign: Import from URL kept its button disabled until both text fields were filled. Not rechecked on the current build. For a new tester this
is a likely first-hour dead end. Small fix; my recommendation is v1.

**F6. Issue housekeeping.**
#4 (redesign) looks done: the redesign is on `master`. #7 (polish) belongs in v2. #8 (Always Use
HTTPS for `countinglight.com`) is a Cloudflare dashboard setting only you can change.

## 4. Documentation and small fixes (agent, after §3)

Found in the review; none is a show-stopper.

- **v1 spec §1 and §7 M5** say Android releases come from a tag and iOS is "built by CI". Align with
  F1.
- **BUILD.md §5 iOS release** lists `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER_ID` as
  required secrets. EAS created and stored an App Store Connect API key during the first manual
  submit (E-006), so the workflow may not need them. Prove on the first tag push, then correct.
- **BUILD.md troubleshooting: iOS build fails with "Runtime version mismatch".** On 2026-09-16 a
  file inside `node_modules` edited by Android tooling changed the local `expo-updates` fingerprint
  and EAS refused the build. `npm ci` before an iOS build prevents it. Not documented yet.
- **`preandroid:apk:*` scripts** run `expo prebuild` every time, which fails with `EBUSY` while a
  Gradle daemon holds `android/`. Proposed on 2026-09-10 and not yet answered: prebuild only when
  `android/` is missing, and make `versionCode` read `package.json` at build time like `versionName`.
- **Web app security headers (review AR-17)** are still missing from `public/_headers`. Cheap; v1 or
  v2 is your call.
- **Review findings with no recorded destination:** AR-13, AR-18, AR-21, AR-22, and the voice
  interrupt's 500 ms status poll from AR-24 (the elapsed-time ticker part is fixed). Move them to the
  v2 plan §7.4.
- **Stale status in dated documents:** the redesign note still names its branch and a "Not done"
  list; the hardening summary's §3 checklist shows the push and the `format` commit (C5, done in
  `f22a134`) as open; the website plan's "no release workflow exists" note. Each gets a short dated
  pointer, per AGENTS.md.
- **Issue #7 item 3:** `npm run reset-project` is still the Expo template script that deletes `src/`.

## 5. Order to the finishing line

1. You: answer F1–F6 and R-015. Start usability sessions (§2) in parallel.
2. Me: F5 if approved, §4, and F1's automation. One commit per item.
3. You: cut the release with the new flow; the first tag push also proves `release-ios.yml` (§1).
4. You: triage `BLOCKER v1:` issues with me; I fix them; repeat 3 for each fix.
5. Hand the release to testers with the release notes. v1 is finished when feedback is flowing.
