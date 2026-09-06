# Design Session — 2026-09-04 — LucidDream v1 Specification

This is the process record of how [`doc/plans/luciddream-v1-spec.md`](../plans/luciddream-v1-spec.md)
was produced and reviewed: the questions asked, the answers given, and why each decision landed
where it did. The spec itself carries none of this — it states the settled design only. Kept here so
the reasoning behind a decision is still findable later without cluttering the document people
actually build from.

---

## Round 1 — Reverse briefing on [manual_requirements.txt](../plans/manual_requirements.txt)

The rough requirements left four implementation-defining choices open. Each was a genuine fork with
different cost/complexity trade-offs, so they were put to Vlad before drafting rather than assumed.

| # | Question | Options presented | Answer | Decision |
|---|---|---|---|---|
| D1 | Script language: Lua / real JS / own DSL? | (a) YAML doc that *is* the AST, tiny pure-TS interpreter (b) embedded Lua via native module (c) sandboxed JS via QuickJS | "If conditionals and looping primitives can be encoded in option 1 (YAML AST), then this is my choice for POC v1." | YAML-as-AST. No parser to maintain, no native dependency, no sandbox — confirmed loops/conditionals are expressible as node types before locking it in. |
| D2 | How much background capability, given the app runs all night screen-off? | (a) Foreground service + background audio + wake lock (b) foreground-only + keep-awake (c) local notifications as the timer | "Foreground service + background audio (Recommended)" | Foreground service. Local notifications can't drive loops/conditionals; foreground-only risks the run dying on any interruption. |
| D3 | How real should wearable conditionals be in v1? | (a) interface + mock/manual provider (b) real Android Health Connect (c) defer entirely to v2 | "Interface + mock/manual provider (Recommended)" | Interface + mock. Flagged that Health Connect data arrives in post-sync batches, so near-real-time triggering may not be achievable even in v2 — worth knowing before building around it. |
| D4 (initial) | Distribution pipeline for the APK? | (a) EAS cloud build → GitHub Release (b) self-hosted Gradle build in Actions (c) both | "EAS build (option 1) — do I need to pay for a new account?" | EAS → GitHub Release. Checked Expo's current pricing rather than assuming: free plan covers 15 Android builds per billing cycle, low-priority queue, 1 concurrency — confirmed no payment needed since releases only build on tags, not every push. |

Two issues found while reading the existing skeleton to ground the spec in reality, fixed in the same
pass:

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) triggered on branch `main`; the repo's
  branch is `master` — CI had never actually run. Fixed to trigger on `master`.
- [app.json](../../app.json) had `enableBackgroundPlayback: false`, incompatible with the screen-off
  requirement. Fixed to `true`.

Vlad confirmed `master` is his permanent default branch convention (recorded to persistent memory,
not project-specific), and that specs and process docs belong in git under `doc/plans/` as markdown,
not as published artifacts (also recorded to memory).

---

## Round 2 — Where do specs live?

Vlad asked that specs move from an initial `doc/spec/` location into `doc/plans/`, alongside the
requirements they derive from, so there's a single documents directory rather than a spec/plan split
with no real boundary. Applied, and recorded as a standing convention in memory.

---

## Round 3 — iOS distribution follow-up

Asked independently, ahead of formally scoping iOS in: *"what is the equivalent of an APK for iOS
sideloading, assuming binaries are distributed directly to users?"*

Researched current (2026) Apple distribution mechanics rather than answering from pre-2026-01
knowledge, since this materially affects a recommendation:

- **TestFlight** — install the TestFlight app once, accept a link/email invite; up to 10,000 external
  testers; light App Review; builds expire 90 days after upload.
- **Ad Hoc** — signed `.ipa` handed directly to users; every device's UDID must be pre-registered
  (100 devices/type/year cap); installed via Mac + Xcode/Apple Configurator; valid up to a year.

Recommended TestFlight as the closer analog to the APK-on-GitHub-Release flow (no UDID collection
step), while flagging the real cost: a build must be re-submitted at least every 90 days or testers
lose access. Vlad then asked for this to be formalized in the spec.

---

## Round 4 — Adding iOS to v1 scope

Instruction: *"add proper iOS/TestFlight section to the spec, update target requirements to both iOS
and Android."*

Added to the spec: §6.2 (iOS — TestFlight) with the TestFlight-vs-Ad-Hoc comparison and decision,
one-time Apple Developer Program setup steps, a shared versioning/build-budget section, two new CI
workflows (`release-ios.yml` — tag push **and** a monthly schedule, to outrun the 90-day expiry —
and `eas-build-ios.yml` for manual ad-hoc builds), and a new milestone **M6 — iOS release** placed
after M5 so iOS can slip without blocking the Android release. Target platform updated everywhere
from "Android" to "Android + iOS."

---

## Round 5 — Offline save, dropping folder-watching, voice interrupt

Three pieces of feedback on the draft, addressed together:

**1. Save signals/scripts fetched from a URL to local storage, for offline reuse.** Distinguished
from the existing mid-run cache (ephemeral, exists only so a run doesn't depend on the network
mid-night): "save offline" is a user-visible, permanent copy the user asks for explicitly, so content
found on a URL is available with no network on a future night. Added as §5.5 in the spec (persistence
layout, no auto-eviction in v1) and as a Library-screen action.

**2. No folder-watching, ever.** The original assumption had left "watching a whole folder for
changes" as a possible v2 nice-to-have. Vlad: *"I don't want dynamic folder watching even in future
releases, scratch this altogether. Unnecessary complication."* Removed from scope permanently, not
deferred — signals and scripts are always added one file at a time.

**3. Voice control to stop or quiet playback for a half-asleep user.** Asked to analyze feasibility,
or alternatively add a "quieter verb interpretation." Options weighed:

| Approach | Verdict |
|---|---|
| Cloud speech-to-text | Rejected — needs network overnight, sends bedroom audio off-device. |
| OS on-demand recognizer (Android `SpeechRecognizer` / iOS `Speech`) | Rejected for v1 — built for short user-initiated sessions, not multi-hour continuous listening; iOS restricts background mic heavily. |
| Dedicated offline keyword-spotter (e.g. Porcupine) | Real v2 candidate, but a new native/commercially-licensed dependency — too much for a POC. |
| On-device voice-activity level detection (no transcription) | **Chosen for v1** — reuses `expo-audio`'s existing metering, zero new dependencies. |

Decision (D5): v1 detects sustained loud input near the device and responds with the *gentle*
action only — pause + lower volume, then auto-resume — never a full stop, since a level threshold
can't distinguish an actual "stop" from snoring or a partner talking. This is literally the "quieter
verb interpretation" Vlad asked about: every trigger maps to the gentle outcome; true word-level
recognition (distinguishing spoken "stop" from "quieter") is deferred to v2 as its own dependency
decision. Off by default; mic permission requested lazily, only if the user enables it.

Added as §5.6 in the spec, wired into the Settings screen and the M3 milestone.

---

## Round 6 — Final review answers

Vlad's verdicts on the spec's review checklist (§9 in the pre-split draft):

1. **Script grammar (§4)** — approved as-is, no changes requested.
2. **Four-tab UI structure (§3.3)** — approved, with the expectation that the UI gets redesigned
   based on real user feedback once the app is in use. Not a v1 blocker; noted as an expected
   follow-up, not a defect in the current design.
3. **APK-on-GitHub-Release for Android (§6.1)** — approved, with the proviso that Vlad wants to test
   the distribution flow himself once there's a running build to test with, before treating it as
   fully validated.
4. **90-day TestFlight re-submit obligation (§6.2)** — accepted as the cost of choosing TestFlight;
   revisit the process later only if it turns out to be a real burden.
5. **Voice/sound interrupt (§5.6)** — approved for now, explicitly contingent on user feedback once
   real overnight use starts; the whole feature may move out to v2 if it doesn't earn its keep or
   produces too many false positives.
6. **Milestone order (§8)** — approved as-is, including iOS (M6) trailing Android (M5).

Following this review, Vlad asked that the specification document be split: a clean spec with no
meeting-style Q&A content, and this process log capturing the interaction history separately under
`doc/dev_process/`.


# Design session 2026-09-05 - prep for Cloudflare

Implementation report (Sol 5.6 Medium)

mplemented on vlads-dev. No Cloudflare account changes or deployment were performed.
Three-phase run changes:
- Fixed phases: Pre-sleep Training → Early Sleep → Wake Up.
- Training may be empty.
- Early Sleep or Wake Up may be empty, but not both.
- Selections persist between launches; duplicate scripts are allowed.
- Each phase has its own Test button.
- One master volume initializes every phase; internal volume changes reset at phase boundaries.
- All scripts and signals are preflighted before starting.
- One continuous wake lock/audio session and one run log cover the entire night.
- Phase start/end events appear in the log.
- Normal completion advances; stop:, errors, and manual Stop terminate the entire run.
- Browser wake-lock denial now degrades safely instead of preventing web execution.
- Narrow-screen web navigation no longer overflows.
Cloudflare support:
- Added [wrangler.jsonc](/Users/vlads/ws/git/vlads/luciddream/wrangler.jsonc) for luciddream-web and luciddream.countinglight.com.
- Added production web build/preview/deploy scripts.
- Added public CORS and cache rules.
- Added /content/scripts, /content/signals, and /content/manifest.json.
- Added the complete operational procedure to [BUILD.md](/Users/vlads/ws/git/vlads/luciddream/BUILD.md).
- Updated [README.md](/Users/vlads/ws/git/vlads/luciddream/README.md) and the [v1 specification](/Users/vlads/ws/git/vlads/luciddream/doc/plans/luciddream-v1-spec.md).
- Restored package-lock.json exactly as requested.
Your next Cloudflare steps are:
1. Commit and push these changes.
2. Create/push the deploy branch using the commands in BUILD.md.
3. In Cloudflare, choose Workers & Pages → Create application → Import a repository.
4. Select vladsadovsky/luciddream.
5. Use:
   - Worker: luciddream-web
   - Production branch: deploy
   - Root directory: empty
   - Build: npm run build:web
   - Deploy: npx wrangler@4.129.0 deploy
   - Preview deploy: npx wrangler@4.129.0 versions upload
   - Build variable: NODE_VERSION=22
6. Confirm no existing DNS record occupies luciddream.countinglight.com.
7. Deploy and verify the application and content URLs listed in BUILD.md.
Cloudflare will create the Custom Domain DNS record and TLS certificate from the committed configuration. Cloudflare Git integration, Custom Domains.
Verification completed:
- Lint passed.
- TypeScript passed.
- 22 suites / 158 tests passed.
- Expo production export succeeded with six static routes.
- Wrangler dry-run accepted all 56 assets.
- Browser-tested selection validation, persistence, one-run logging, phase markers, web execution, and 390 px responsive layout.
