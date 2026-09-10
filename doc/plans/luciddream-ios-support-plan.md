# LucidDream — iOS support plan

Status: **plan, not yet implemented.** This document expands milestone **M6** of
[`luciddream-v1-spec.md`](./luciddream-v1-spec.md) §7 into an executable plan. It is written to serve
two readers at once:

- **Vlad** — the numbered manual steps in Part A, Part E and Part G are console work that only a
  human with the Apple and Expo accounts can do. Follow them in order.
- **A coding agent** — Parts B, C and D are repository changes, each with a file, an intent, and an
  acceptance criterion. They are safe to implement without any Apple account access, and they can
  all be verified on Windows.

Where this plan disagrees with the v1 spec, the disagreement is called out explicitly in Part H
rather than silently resolved. **H2, H4 and H6 were decided on 2026-09-09 and are settled** — where
they contradict the spec, this document wins and the spec is to be amended.

Two remain open, deliberately:

**H1** was decided, then **revised and re-confirmed the same day** once the requirement "the build
number must be readable offline from the clone" was raised; §3 is the full treatment and the revision
is implemented. **H5** (`doNotMix` on iOS) is the one item still open — a product call that needs
device evidence. Decide at Part E step 5.

---

## 1. Context and constraints

### 1.1 Why this document exists

iOS support became a critical requirement because beta customers asked for it. The team's development
machine is Windows, and there is no Mac. The two questions that produced this plan were:

1. Can iOS work happen on Windows? — **Yes**, for everything this project actually contains.
2. Can intermediate builds reach beta customers the way the Android APK does? — **Yes, via
   TestFlight**, which the spec already chose in §5.2.

### 1.2 What genuinely requires a Mac

Nothing in the critical path. Specifically **not** required: signing, provisioning, building,
submitting, or distributing. EAS Build runs the iOS toolchain on Expo's cloud macOS workers, and EAS
stores the signing credentials server-side so CI never handles a certificate.

A Mac only becomes necessary for:

- the **iOS Simulator** (Mac-only) — on Windows, testing is on physical devices only;
- **Xcode Instruments / lldb** — native crash symbolication and native-level profiling;
- writing and iterating **custom native iOS code**. This project has none: every dependency in
  `package.json` is first-party Expo or a standard React Native package, and the only config plugin,
  [`plugins/withCanonicalVersion.js`](../../plugins/withCanonicalVersion.js), touches
  `app/build.gradle` only.

If a native crash appears that cannot be diagnosed from EAS build logs and device logs, rent a cloud
Mac by the hour rather than treating it as a blocker. Do not buy hardware pre-emptively.

### 1.3 Costs

| Item                                                   | Cost         | Required?                                                                  |
| ------------------------------------------------------ | ------------ | -------------------------------------------------------------------------- |
| Apple Developer Program                                | **$99/year** | **Yes.** Mandatory for TestFlight and for Ad Hoc alike.                    |
| Expo / EAS                                             | **$0**       | No. The free plan includes 15 iOS builds per billing cycle and EAS Submit. |
| Expo Starter, if the free queue becomes the bottleneck | $19/month    | Only if needed; month-to-month.                                            |

The free plan's real constraint is **queue latency (90+ minutes at peak)**, not the build count —
releases build on version tags only, so 15/cycle is comfortable. Confirm current numbers at
<https://expo.dev/pricing> at signup time; Expo's pricing has changed repeatedly.

---

## 2. The two flows

This is the central architectural decision of this plan, and it is deliberate: **the developer flow
and the customer flow share no runtime path.**

### 2.1 Developer flow — dev client over Metro

Used by Vlad on Windows for day-to-day iteration.

```
Windows: npx expo start --dev-client        iPhone: LucidDream dev client
   Metro on :8081  <--- LAN / WebSocket --->   requests index.bundle, holds socket open
```

The installed `.ipa` is a **shell**: Hermes, the compiled native modules, `Info.plist`,
entitlements, icon, splash — and no application JavaScript. On launch the phone downloads the bundle
from Metro; on every save, Metro re-transpiles the single changed module and Fast Refresh swaps it in
place with component state preserved. Sub-second.

Assets `require()`d from JS are served by Metro too — the bundle carries a numeric asset ID, and the
bytes stream from the workstation on demand. So these are **hot**, no rebuild:

| Asset                                       | Where                                                                                                       | Hot?                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Anything under `src/**` (`.ts`, `.tsx`)     | —                                                                                                           | Yes, Fast Refresh                                      |
| `assets/images/tabIcons/*.png`              | [`app-tabs.tsx:24`](../../src/components/app-tabs.tsx)                                                      | Yes, on reload                                         |
| `assets/sounds/*.wav`, `*.mp3`              | [`sounds.ts:2`](../../src/lib/sounds.ts), [`keep-alive-track.ts:11`](../../src/session/keep-alive-track.ts) | Yes, on reload                                         |
| `assets/scripts/*.yaml`                     | codegen → `src/storage/bundled-scripts.ts`                                                                  | Yes, **after** running the generator — see task **B7** |
| `assets/images/icon.png`, `splash-icon.png` | consumed by `expo prebuild`                                                                                 | **No — rebuild**                                       |
| `public/**`                                 | web export only; inert on iOS                                                                               | n/a                                                    |

Note the sharp edge: `assets/images/tabIcons/home.png` is hot and `assets/images/icon.png` is cold,
in adjacent directories. The difference is whether JS `require()`s it or whether `expo prebuild`
consumes it.

A **new EAS build** is required for: the `plugins` array in `app.json`; `expo-audio`'s
`enableBackgroundPlayback` (it writes `UIBackgroundModes`); `ios.bundleIdentifier`, scheme, or
entitlements; adding any native package; registering another device UDID (the Ad Hoc profile compiles
the UDID list in); an Expo SDK bump.

### 2.2 Customer flow — TestFlight release builds

Used by beta customers. **The workstation is not in this path at all.** A TestFlight build is a
release build: the JS bundle is compiled into the binary on the EAS worker. No Metro, no WebSocket,
no LAN. EAS builds it, Apple hosts it, testers pull it.

```
git tag v0.6.0 --> release-ios.yml --> eas build --> eas submit --> App Store Connect
                                                                        |
                                                          TestFlight app on customer iPhone
```

### 2.3 Why TestFlight and not Ad Hoc

Decided in spec §5.2 and unchanged here. Ad Hoc requires every tester's **UDID registered before the
build is made**, caps at 100 devices per device type per membership year with no reset until renewal,
and forces a rebuild for each new tester. TestFlight needs no UDIDs and no per-tester rebuild.

The cost accepted in exchange is real and recurring: **TestFlight builds expire 90 days after
upload**, after which testers silently lose a working app. Part C automates the re-submit; do not
skip that automation.

### 2.4 Internal vs external testers

A lever the spec's §5.2 table does not cover, and it materially changes iteration speed:

|                   | Internal testers                                                             | External testers                                              |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Ceiling           | 100 people, 30 devices each                                                  | 10,000 people                                                 |
| Who they can be   | Only users on the App Store Connect team                                     | Anyone, by email or public link                               |
| Beta App Review   | **None**                                                                     | Required on the first build of each `version`; usually < 24 h |
| Time to available | Minutes after processing                                                     | Hours to a day on a version bump                              |
| Downside          | Tester gets an App Store Connect account with visibility into the app record | None                                                          |

**Recommended split:** Vlad and any close collaborator as internal testers (fast loop, no review);
actual beta customers as external testers via a public link. See decision **H4**.

---

## 3. Versioning — the two numbers

This section is normative. Everything about release identity depends on keeping two distinct numbers
distinct, and conflating them is the single most likely way to get a submission rejected.

### 3.1 The two numbers

|                | **Marketing version**                       | **Build number**                                    |
| -------------- | ------------------------------------------- | --------------------------------------------------- |
| Example        | `0.5.0`                                     | `500017`                                            |
| iOS key        | `CFBundleShortVersionString`                | `CFBundleVersion`                                   |
| Android key    | `versionName`                               | `versionCode`                                       |
| Audience       | humans — release notes, the TestFlight list | the stores only; users never see it                 |
| Shape          | semver, `major.minor.patch`                 | a single integer                                    |
| Rule           | changes when **you** decide it changes      | **must strictly increase on every upload**, forever |
| Where it lives | `package.json` — unchanged by this plan     | computed; see §3.3                                  |

**The marketing version is not affected by anything in this plan.** `package.json` remains the one
canonical place you edit it. That was true before iOS and stays true after.

### 3.2 How the marketing version propagates (already working, do not change)

The chain is worth writing down because it is load-bearing and slightly non-obvious:

1. [`package.json`](../../package.json) — `"version": "0.5.0"`. The single source of truth.
2. [`app.config.js`](../../app.config.js) — sets `version: packageJson.version` on the Expo config,
   overriding whatever `app.json` says. Its comment already names package.json as canonical.
3. **iOS** — Expo writes that value to `CFBundleShortVersionString` during prebuild.
4. **Android** — [`withCanonicalVersion.js`](../../plugins/withCanonicalVersion.js) rewrites
   `versionName packageJsonVersion` into `app/build.gradle`, where the value is read from
   `package.json` **at Gradle evaluation time**. That is why it survives both `expo prebuild`
   regeneration and a direct local `gradlew` invocation.
5. The APK filename becomes `luciddream-v${versionName}-${buildType}.apk`.

So `npm run android:apk:release` on your clone already stamps the correct marketing version with no
network access and no EAS involvement. **Nothing in this plan touches step 2, 4 or 5.**

### 3.3 The build number — the actual open problem

Verified on 2026-09-09 against `npx expo config --type prebuild --json`:

```
version: 0.5.0
android.versionCode: undefined
ios.buildNumber: undefined
```

Neither is set anywhere. Today that means:

- **Local Gradle builds** get Android's default `versionCode` of **1**, on every build forever. Two
  different local APKs are indistinguishable to the package manager.
- **EAS cloud builds** get a number from EAS's servers, because
  [`eas.json`](../../eas.json) sets `appVersionSource: "remote"` and the `production` profile sets
  `autoIncrement: true`.

That split is the problem. The number that identifies a build is invisible to the clone that produced
it, and the two build paths disagree.

### 3.4 The three mechanisms, compared

|                                              | Readable offline from the clone?                        | Survives tag-triggered CI? | Local and cloud agree? |
| -------------------------------------------- | ------------------------------------------------------- | -------------------------- | ---------------------- |
| **A.** `appVersionSource: "remote"`          | **No** — needs `eas build:version:get` (network + auth) | Yes                        | **No**                 |
| **B.** `"local"` + `autoIncrement`           | Yes                                                     | **No** — see below         | Yes                    |
| **C.** `"local"` + computed in app.config.js | **Yes**                                                 | **Yes**                    | **Yes**                |

**Why B fails:** with `appVersionSource: "local"`, `autoIncrement` bumps the number _in the
repository_ and the change must be committed. A release is cut by pushing a `v*` tag, so CI would
have to commit onto an already-tagged commit — which either detaches the tag from its own build or
requires a second tag. There is no clean version of this.

### 3.5 Recommended mechanism — C, computed and deterministic

Derive the build number from the marketing version plus a counter, inside
[`app.config.js`](../../app.config.js), which is already a dynamic config and already reads
`package.json`:

```js
const [major, minor, patch] = packageJson.version.split(".").map(Number);
const buildCounter = Number(process.env.LUCIDDREAM_BUILD ?? 0);

// (major, minor, patch, counter) packed into one strictly-increasing integer.
// 0.5.0 with counter 17 -> 500017. Android's ceiling is 2_100_000_000.
const buildNumber = ((major * 100 + minor) * 100 + patch) * 1000 + buildCounter;
```

Then set `android.versionCode: buildNumber` and `ios.buildNumber: String(buildNumber)` on the
exported config.

Properties this buys:

- **Offline and readable.** Any script in the clone computes it from files already on disk. No
  network, no Expo login, no EAS state.
- **Identical everywhere.** A local Gradle APK, an EAS cloud APK and an EAS iOS build at the same
  version and counter carry the same number, because they all evaluate the same function.
- **No commit-back.** The repository stores the _rule_, not the number, so tag-triggered releases
  work untouched.
- **Monotonic by construction**, as long as the rules in §3.6 hold.

### 3.6 Rules for the repository maintainer

These are obligations, not suggestions. Breaking any of them produces a rejected submission or an
un-upgradable install.

1. **Bump `package.json` `version` for every release.** Never decrease it. This is the only version
   edit you ever make by hand.
2. **`minor` and `patch` must each stay ≤ 99**, and the counter ≤ 999. The packing in §3.5 overflows
   into the next field otherwise. `major` may go to ~209 before hitting Android's ceiling.
3. **CI sets the counter:** `LUCIDDREAM_BUILD=${{ github.run_number }}` in both release workflows.
   `github.run_number` increases monotonically per workflow, so successive builds at the same
   marketing version still get distinct numbers.
4. **Local builds default to counter `0`.** This is deliberate: a local build is always
   `<version>000`, so it is instantly recognisable, and it can never collide with a CI build (whose
   run number is ≥ 1).
5. **Never upload a locally built artifact to App Store Connect or Play.** Rule 4 guarantees local
   builds reuse the same number, and App Store Connect rejects a duplicate `CFBundleVersion`.
   Uploads come from CI only.
6. **Never reuse a (version, counter) pair for two uploads.** Following rules 1 and 3 makes this
   automatic; it is stated separately because it is the constraint the others exist to satisfy.
7. **Remove `autoIncrement` from `eas.json`** when adopting C — it would fight the computed value.

### 3.7 Reading the numbers from your own build scripts

Implemented as [`scripts/version-info.js`](../../scripts/version-info.js), sharing
[`scripts/build-number.js`](../../scripts/build-number.js) with `app.config.js` so what it prints
cannot drift from what Expo, Gradle and EAS actually use:

```bash
npm run version:info
```

It prints the marketing version and the computed build number for the current working tree,
honouring `LUCIDDREAM_BUILD` if set. It shells out to nothing and reads no network.
`npm run version:info -- --json` is the machine-readable form, for `android:apk:release` and any
future packaging script.

Verified 2026-09-09:

```
$ npm run version:info -- --json
{"version":"0.5.0","counter":0,"buildNumber":500000,"local":true}

$ LUCIDDREAM_BUILD=17 npm run version:info -- --json
{"version":"0.5.0","counter":17,"buildNumber":500017,"local":false}
```

and the same numbers reach Expo's resolved config, identically on both platforms:

```
$ npx expo config --type prebuild --json
version 0.5.0 | versionCode 500000 | buildNumber 500000
$ LUCIDDREAM_BUILD=17 npx expo config --type prebuild --json
version 0.5.0 | versionCode 500017 | buildNumber 500017
```

The §3.6 limits are enforced in code, not just documented — `LUCIDDREAM_BUILD=1000` fails with
`LUCIDDREAM_BUILD must be <= 999; got 1000.` rather than silently overflowing into the patch field.

**One subtlety, unresolved by design.** `withCanonicalVersion.js` makes Android `versionName` dynamic
— Gradle re-reads `package.json` at evaluation time — but `versionCode` is written into
`build.gradle` by prebuild and is therefore frozen at whatever the last `expo prebuild` computed. For
EAS builds this is irrelevant (every build prebuilds fresh). For a **local** `npm run android:apk:*`
against a stale `android/` directory, the APK can carry an out-of-date `versionCode` while its
`versionName` is current. Local builds are counter-`0` and never uploaded (§3.6 rules 4–5), so this
is harmless today. Extending the plugin to make `versionCode` dynamic too would close it — proposed,
not done, because it is beyond what this plan was asked to cover.

### 3.8 What this means for `expo-updates`

Unrelated, and worth stating so the two are never confused. `runtimeVersion` uses the
`fingerprint` policy (**H2**) — it is derived from the _native_ fingerprint of the build, not from
the marketing version and not from the build number. An OTA update lands only on builds whose native
fingerprint matches. Bumping `package.json` `version` does **not** by itself cut off existing builds
from updates; changing native dependencies or config does.

---

## Part A — Manual prerequisites (Vlad only)

None of this can be automated or done by an agent. Do it in this order. Record every value marked
**[record]** — Part B and Part C need them.

### A1. Enrol in the Apple Developer Program — $99/year

<https://developer.apple.com/programs/enroll>

Choose the entity type deliberately, because **migrating Individual → Organization later is
painful**:

- **Individual** — Apple ID with two-factor authentication, legal name, payment method. Approval
  typically 24–48 h. The seller name shown to testers and on the App Store is your personal legal
  name.
- **Organization** — requires a legal entity and a **D-U-N-S number**, and Apple vets applicants.
  Can take weeks. The seller name is the company name.

**Recommendation:** Individual, for a POC beta. Revisit before any public App Store release.

**[record]** your **Team ID** — Apple Developer portal → Membership details. A 10-character string
like `A1B2C3D4E5`.

> Do **not** consider the Apple Developer **Enterprise** Program ($299/yr) as an alternative. It is
> restricted to distributing in-house apps to your own employees; using it for external beta
> customers violates the agreement and gets certificates revoked.

### A2. Register the bundle identifier

Apple Developer portal → Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App.

- Description: `LucidDream`
- Bundle ID: **Explicit**, `com.vladsadovsky.luciddream` — must match
  [`app.json`](../../app.json)'s `ios.bundleIdentifier` exactly.
- Capabilities: enable **nothing** for now. The app uses local notifications only
  ([`notification.ts`](../../src/session/notification.ts)), which need no App ID capability.
  Background audio is an `Info.plist` key, not a capability. If remote push is ever added, enabling
  Push Notifications later forces a provisioning-profile regeneration.

EAS can create this App ID automatically during the first `eas build`. Doing it by hand first is
still worth it — it fails fast and visibly if the identifier is already taken by another account.

### A3. Create the App Store Connect app record

<https://appstoreconnect.apple.com> → Apps → **+** → New App.

- Platform: iOS
- Name: `LucidDream` — **App Store names are globally unique.** If it is taken, pick a fallback now
  (e.g. `LucidDream Sleep`) and note that the display name on the device still comes from
  `app.json`'s `name`, so only the store listing is affected.
- Primary language, Bundle ID (pick the one from A2), SKU (e.g. `luciddream-001`)
- User access: Full Access

**[record]** the app's **Apple ID** — the numeric value on the App Information page, e.g.
`6712345678`. This is `ascAppId` in task **B2**. It is not your email address.

### A4. Answer the App Privacy questionnaire

App Store Connect → your app → App Privacy. Required **before external TestFlight testing** is
allowed, and easy to forget until it blocks a submission.

Answer against what the app actually does today: local script execution, local JSONL event logging,
optional user-initiated export/share. Fetches scripts from user-supplied URLs. No analytics SDK, no
account system, no advertising identifier. Most likely answer: **no data collected**. Verify against
[`luciddream-v1-spec.md`](./luciddream-v1-spec.md) §4 before submitting, and re-check if any
telemetry is ever added.

### A5. Generate an App Store Connect API key

This is what lets CI submit without an interactive Apple ID login and 2FA prompt.

App Store Connect → Users and Access → **Integrations** → App Store Connect API → Team Keys →
**Generate API Key**.

- Name: `luciddream-ci`
- Role: **App Manager** (sufficient for TestFlight upload; Admin is more than needed)

Then download the `.p8` file. **Apple allows this download exactly once** — store it in the password
manager immediately, and never inside the repository. [`.gitignore`](../../.gitignore) already
covers `*.p8`, so an accidental `git add` is caught, but do not rely on that.

**[record]** the **Key ID** and the **Issuer ID** (the Issuer ID is shown once at the top of the Keys
page and is shared across all keys on the team).

### A6. Expo account and project linkage

```bash
npx eas login
npx eas project:info
```

If `project:info` reports no linked project, run `npx eas init`. Note that
[`app.json`](../../app.json) currently has **no** `extra.eas.projectId`, and
[`app.config.js`](../../app.config.js) spreads `appJson.expo` without adding one — so linkage very
likely still needs doing. `eas init` will write it.

**[record]** the **EAS project ID**.

If `EXPO_TOKEN` is not already a repository secret (the existing
[`eas-build-android.yml`](../../.github/workflows/eas-build-android.yml) uses it, so it probably is):
expo.dev → Account Settings → Access Tokens → create one → add as a GitHub Actions secret.

### A7. Create the iOS signing credentials

Run this on Windows. It is interactive once, then never again.

```bash
npx eas credentials --platform ios
```

Sign in with the Apple ID from A1 and complete 2FA. Choose the `ios-testflight` profile (after task
**B1** exists) and let EAS **generate and store** the Apple Distribution certificate and the App
Store provisioning profile. They live on Expo's servers, which is exactly why CI needs no
certificate handling.

Two things to know:

- Apple permits a limited number of Apple Distribution certificates per account (two at the time of
  writing). Do not regenerate casually.
- Distribution certificates **expire after one year**. Renewal is an `eas credentials` run, but put a
  calendar reminder on it — see **G3**.

Mirroring the keystore discipline of spec §5.1, immediately export a backup of the credentials via
`eas credentials` and store it outside the repository.

### A8. Add the GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions:

| Secret                | Value                                                                  | Source                        |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| `EXPO_TOKEN`          | Expo access token                                                      | A6 — probably already present |
| `APPLE_API_KEY`       | the full **contents** of the `.p8` file, including the BEGIN/END lines | A5                            |
| `APPLE_API_KEY_ID`    | Key ID                                                                 | A5                            |
| `APPLE_API_ISSUER_ID` | Issuer ID                                                              | A5                            |

`GITHUB_TOKEN` is ambient. `GOOGLE_SERVICE_ACCOUNT_KEY` stays unset — Play Store is out of scope per
spec §5.1.

### A9. Register your own device for the dev-client flow

Only for the developer flow (§2.1); **not** needed for any customer. Your own iPhone must be in an Ad
Hoc provisioning profile.

```bash
npx eas device:create
```

Choose the URL/QR method, open it in **Safari** on the iPhone, and install the offered profile. Then
the next `development`-profile build will include that device.

---

## Part B — Repository configuration changes (coding agent)

All of these are verifiable on Windows with no Apple account. Each task states its acceptance
criterion.

### B1. Add iOS build profiles to `eas.json`

[`eas.json`](../../eas.json) is Android-only today: all three profiles carry an `android` block and
none carry `ios`.

Add an `ios` block to the existing `development` and `preview` profiles, and add a new
`ios-testflight` profile as spec §5.2 names it:

```json
"development": {
  "developmentClient": true,
  "distribution": "internal",
  "android": { "buildType": "apk" },
  "ios": { "simulator": false }
},
"ios-testflight": {
  "extends": "production",
  "distribution": "store",
  "channel": "testflight",
  "autoIncrement": true,
  "ios": { "resourceClass": "m-medium" }
}
```

Critical detail: `ios-testflight` **must not** be `distribution: "internal"`. Internal distribution
yields an Ad Hoc build, which is the option §2.3 rejected. `"store"` is what produces a binary App
Store Connect will accept.

`"simulator": false` is explicit because a Simulator build is useless without a Mac — better to fail
loudly than to ship an unusable artifact.

The `channel` key is unconditional — `expo-updates` is adopted per decision **H2**.

**Acceptance:** `npx eas config --platform ios --profile ios-testflight` resolves without error and
reports store distribution.

### B2. Add the iOS submit configuration to `eas.json`

The `submit` block currently has only `production.android`. Add a sibling profile matching the build
profile name:

```json
"submit": {
  "production": {
    "android": {
      "serviceAccountKeyPath": "./google-service-account.json",
      "track": "internal"
    }
  },
  "ios-testflight": {
    "ios": {
      "ascAppId": "6810464846",
      "appleTeamId": "H6RLB65BLV"
    }
  }
}
```

**Done 2026-09-09** with the real values above: Team ID `H6RLB65BLV`, App Store Connect app Apple ID
`6810464846`.

`ascAppId` and `appleTeamId` are **not secrets** and belong in the repository. The API key must not
be: pass it through the environment in CI (`EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`,
`EXPO_ASC_ISSUER_ID`), written to a runner-local file and deleted in an `if: always()` step — exactly
the pattern [`eas-submit-android.yml`](../../.github/workflows/eas-submit-android.yml) already uses
for the Play Store key. Reuse that shape.

Note this changes the submit command from the spec's §6 sketch: it becomes
`eas submit --platform ios --profile ios-testflight --latest`.

**Acceptance:** `eas config --platform ios --profile ios-testflight` shows the submit config; no
secret material appears in any tracked file.

### B3. Declare export-compliance encryption in `app.json`

**This blocks unattended submission.** Without it, every upload stalls in App Store Connect waiting
for a human to answer the export-compliance question, and the build never reaches testers.

Add to [`app.json`](../../app.json)'s `ios` block:

```json
"config": { "usesNonExemptEncryption": false }
```

This becomes `ITSAppUsesNonExemptEncryption` in `Info.plist`. `false` is the correct answer for an
app whose only cryptography is standard HTTPS/TLS for fetching scripts — the standard exemption. If
custom cryptography is ever added, this must be revisited.

**Acceptance:** the key appears in the generated `Info.plist` — verify with **B6**.

### B4. Do not hand-write `UIBackgroundModes`

[`app.json`](../../app.json) already configures `expo-audio` with `enableBackgroundPlayback: true`,
and that plugin is what injects the `audio` background mode. **Do not also add
`ios.infoPlist.UIBackgroundModes`** — a duplicate or conflicting declaration is a plausible
submission rejection.

**Acceptance:** the generated `Info.plist` contains `UIBackgroundModes` with exactly one entry,
`audio`. Verify with **B6**, do not assume.

### B5. Resolve `appVersionSource` before wiring iOS

See decision **H1**. iOS build numbers must **strictly increase** on every upload; getting this wrong
means rejected submissions, and it is much cheaper to settle before the first build than after.

### B6. Verify the resolved config — on Windows

**Correction (2026-09-09).** An earlier draft of this plan claimed
`npx expo prebuild --platform ios --no-install` could generate the Xcode project on Windows for
inspection. **It cannot.** Attempted on this machine, it refuses:

```
⚠️  Skipping generating the iOS native project files.
   Run npx expo prebuild again from macOS or Linux to generate the iOS project.
CommandError: At least one platform must be enabled when syncing
```

iOS prebuild requires macOS **or Linux** — so a Linux CI runner or WSL can do it, but Windows cannot.

What **does** work on Windows is evaluating the resolved config with plugins applied:

```bash
npx expo config --type prebuild --json
```

Verified working; it confirms `ios.config.usesNonExemptEncryption`, `runtimeVersion`, `version`,
`android.versionCode` and `ios.buildNumber`.

**Known limitation:** this shows the config _object_, not the generated files. `expo-audio` injects
`UIBackgroundModes` as a prebuild **mod** — a file mutation applied while writing `Info.plist` — so
it does **not** appear in this output, and **B4 cannot be fully verified on Windows.** Three ways to
close that gap, in preference order:

1. Add an `npx expo prebuild --platform ios --no-install` step to a Linux CI job and assert on the
   generated `Info.plist`. Cheap, repeatable, no Mac.
2. Inspect the first EAS build's logs, which show the prebuild output.
3. Confirm empirically at Part E step 5 — background audio either survives or it does not.

**Acceptance:** `expo config --type prebuild --json` output recorded showing
`usesNonExemptEncryption: false` and `bundleIdentifier: com.vladsadovsky.luciddream`; `UIBackgroundModes`
confirmed by route 1, 2 or 3 and noted here.

### B9. Add `version:info`

Per §3.7. A small script printing the marketing version and the computed build number for the current
tree, honouring `LUCIDDREAM_BUILD`, with a `--json` mode for consumption by other build scripts.
Depends on **H1**'s revision being confirmed, since it prints the number that mechanism defines.

**Acceptance:** `npm run version:info` prints both numbers with no network access;
`LUCIDDREAM_BUILD=17 npm run version:info` reflects the counter.

### B7. Add a `prestart` hook for the bundled-script codegen

Independent of iOS, but it bites hardest in the dev-client loop this plan establishes.

[`scripts/sync-bundled-scripts.js`](../../scripts/sync-bundled-scripts.js) codegens
`assets/scripts/*.yaml` into `src/storage/bundled-scripts.ts`. [`package.json`](../../package.json)
wires it to `preweb`, `prebuild:web`, `prepreview:web`, `predeploy:web` and `pretest` — but there is
**no `prestart` and no `preios`**. So while running `expo start --dev-client` against an iPhone,
editing a YAML regenerates nothing and the app silently serves stale script text.

Add `"prestart": "npm run generate:bundled-scripts"`. Consider `preios` and `preandroid` for
`expo run:*` symmetry.

**Acceptance:** touching a file in `assets/scripts/` and running `npm start` regenerates
`src/storage/bundled-scripts.ts`.

### B8. Update `README.md`

[`README.md:40`](../../README.md) says `npm run ios  # macOS + Xcode simulator/device`, which is now
misleading — it is not the path this project uses. Document the Windows + EAS dev-client flow, and
add a customer-facing TestFlight install section mirroring the Android APK instructions (Part F is
the source text).

---

## Part C — CI workflows (coding agent)

Follows spec §6, with the submit command corrected for **B2**'s named submit profile. Both workflows
run on `ubuntu-latest` — EAS builds in the cloud, so no macOS runner and no self-hosted Mac.

### C1. `.github/workflows/eas-build-ios.yml` — manual dispatch

Mirrors [`eas-build-android.yml`](../../.github/workflows/eas-build-android.yml) exactly: same
`workflow_dispatch` profile picker (options `development`, `preview`, `ios-testflight`), same
`actions/setup-node@v4` with `node-version: 22`, same `expo/expo-github-action@v8` with
`secrets.EXPO_TOKEN`, same `--no-wait`.

Purpose: a one-off TestFlight build outside the tag/schedule cadence, and the `development`-profile
dev-client builds for **A9**.

Build this **first** and use it for the Part E verification round-trip.

### C2. `.github/workflows/release-ios.yml` — on `v*` tag push and on a schedule

```
checkout → npm ci → verify the tag matches the canonical version
  → eas build --platform ios --profile ios-testflight --non-interactive --wait
  → eas submit --platform ios --profile ios-testflight --latest --non-interactive
```

Three things to get right:

1. **`--wait` is required**, unlike C1 — the submit step needs a finished build. Budget ~20–30 min of
   runner time, more on the free queue.
2. **The version check reads `package.json`, not `app.json`.**
   [`app.config.js`](../../app.config.js) overrides `version` from `package.json` and documents it as
   "the single canonical version source". Spec §5.3's wording ("`app.json` `version` is the single
   source of truth") is stale — see **H3**.
3. **Add `on: schedule`, monthly.** This is what discharges the 90-day expiry obligation from §2.3.
   Without it, testers lose the app one quiet quarter at a time. Guard the job so a scheduled run on
   an unchanged tree still produces a fresh build.

There is no GitHub Release artifact on this path. The deliverable is a build landing in App Store
Connect, unlike Android's APK-on-a-release-page.

**Secrets consumed:** `EXPO_TOKEN`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`.

### C3. Leave `ci.yml` alone

[`ci.yml`](../../.github/workflows/ci.yml) is platform-agnostic — lint, typecheck, tests. It builds
no binary and needs no Mac. Adding `npx expo-doctor` per spec §6 is worthwhile but is not part of iOS
support.

---

## Part D — iOS runtime correctness (coding agent + device verification)

Everything above gets _a_ build onto _a_ phone. This part is about the build behaving correctly for
an overnight audio session on iOS, where the OS model differs substantially from Android's foreground
service. Facts below were checked against the installed `expo-audio` typings
(`node_modules/expo-audio/build/`), not assumed.

### D1. Set `playsInSilentMode` explicitly

[`session.ts:46`](../../src/session/session.ts) calls `setAudioModeAsync` with `interruptionMode` and
`shouldPlayInBackground` only.

`playsInSilentMode` **defaults to `true`** in this `expo-audio` version, so this is not currently a
bug. Set it explicitly anyway:

```ts
await setAudioModeAsync({
  playsInSilentMode: true,
  interruptionMode: audioFocus === "exclusive" ? "doNotMix" : "duckOthers",
  shouldPlayInBackground: true,
});
```

Rationale: the call passes a `Partial<AudioMode>`, so it leans on an implicit default for behaviour
that is completely load-bearing for a night-time app. A user asleep with the ringer switch on silent
is the _expected_ case, not an edge case. If that default ever changes, every run goes silent and the
failure is invisible in tests. One line of insurance.

**Acceptance:** unit test asserting the mode object includes `playsInSilentMode: true`.

### D2. Lock-screen controls — the iOS analog of the Android run notification

The most substantial iOS gap. Two facts drive it:

- iOS has **no persistent, ongoing notification**. Android's `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
  notification with a live-updating step and a Stop action (spec §4.4,
  [`notification.ts`](../../src/session/notification.ts)) has no equivalent. On iOS that notification
  is a dismissible banner plus a Notification Center entry — not a run status display.
- `expo-audio`'s `AudioPlayer` exposes `setActiveForLockScreen(active, metadata?, options?)`,
  `updateLockScreenMetadata(metadata)` and `clearLockScreenControls()`. That is the iOS-native
  affordance: Now Playing on the lock screen, with transport controls.

Proposed shape — the keep-alive player in
[`keep-alive-track.ts`](../../src/session/keep-alive-track.ts) is the natural owner, since it is the
one player alive for the whole run:

- on run start: `setActiveForLockScreen(true, { title: scriptName, artist: 'LucidDream' })`
- on step change: `updateLockScreenMetadata({ title: currentStepLabel, artist: scriptName })`
- on teardown: `clearLockScreenControls()`

**Constraint that needs a decision.** The typings state lock-screen controls require
`interruptionMode: 'doNotMix'`, or the OS may not associate the controls with the player. Today
`doNotMix` is only selected when `audioFocus === 'exclusive'`
([`session.ts:47`](../../src/session/session.ts)). So either force `doNotMix` on iOS regardless of
`audioFocus`, or accept that lock-screen controls appear only in exclusive mode. See **H5**.

Note also that the same typings say **Android** needs `setActiveForLockScreen` for sustained
background playback, or audio stops after roughly 3 minutes in the background. If the Android
overnight run currently works, something else is holding it — worth understanding before changing
this code path, because it means the two platforms may be relying on different mechanisms.

### D3. Add a notification handler

`setNotificationHandler` appears **nowhere** in `src/`. On iOS, a local notification delivered while
the app is in the foreground is suppressed unless a handler opts into presenting it. The §4.4 run
notification will therefore behave differently on iOS than on Android even before D2's lock-screen
work.

Add a handler at app entry. Also reconsider _when_ permission is requested:
`ensureRunNotificationSetup` ([`notification.ts:20`](../../src/session/notification.ts)) calls
`requestPermissionsAsync` at session start, which pops a system dialog just as the user is settling
in for the night. Moving it to onboarding or first library visit is better iOS UX.

### D4. Re-examine the keep-alive track's platform reasoning

[`keep-alive-track.ts`](../../src/session/keep-alive-track.ts) is documented entirely in terms of
Android's foreground service, and skips only `Platform.OS === 'web'` — so it does already run on iOS.
That is correct behaviour, but for a _different_ reason worth writing down: with the `audio`
background mode, iOS keeps the app alive only while audio is **actively rendering**. During a
script's silent `wait` gaps, the loop is what prevents suspension. It is arguably more load-bearing
on iOS than on Android.

Two things need device verification, not reasoning: that a 0.01-amplitude loop is not treated as
inaudible and optimised away, and that it survives a full 8-hour session. Update the comment once
verified.

### D5. Verify the iOS-conditional UI on real hardware

These branches have never run on an iOS device:

- [`theme.ts:38`](../../src/constants/theme.ts) — the `ios` font/theme block
- [`theme.ts:72`](../../src/constants/theme.ts) — `BottomTabInset = Platform.select({ ios: 50, android: 80 })`
- [`settings.tsx:141`](<../../src/app/(tabs)/settings.tsx>) — `KeyboardAvoidingView` `behavior` and
  `keyboardVerticalOffset` branches

Also: `expo-glass-effect` is a dependency, and its Liquid Glass effects are gated on recent iOS
versions. Confirm graceful degradation on whatever the oldest tester device is rather than assuming
it.

### D6. Confirm wake lock and tablet posture

`expo-keep-awake` works on iOS; `acquireWakeLock` in [`session.ts`](../../src/session/session.ts)
should need no change, but confirm during Part E. `supportsTablet: false` means iPad testers get a
scaled iPhone app — acceptable for beta, worth stating in the tester notes.

---

## Part E — First manual verification round-trip (Vlad)

Do this **before** wiring C2 and **before** inviting a single customer. Same discipline spec §5.1
applies to the Android flow: prove it by hand, then automate.

1. Complete Part A entirely.
2. Merge Part B and task C1.
3. Build a dev client: Actions → **EAS Build (iOS)** → profile `development`. Install it on your own
   iPhone (registered in A9) via the OTA link from the EAS build page.
4. `npx expo start --dev-client` on Windows. Confirm the phone reaches Metro. If it does not:
   - Windows Defender must allow **inbound TCP 8081** for Node on Private networks — first-run
     prompts are easy to miss and it fails silently.
   - Phone and PC must be on the **same subnet**; guest Wi-Fi with client isolation breaks LAN
     discovery. Fallback: `npx expo start --tunnel` (works anywhere, slower).
5. Walk Part D on the device: an overnight run with the screen off **and the ringer switch on
   silent**, lock-screen controls, notification behaviour, the D5 layout branches.
6. Build for TestFlight: Actions → **EAS Build (iOS)** → profile `ios-testflight`.
7. Submit by hand from Windows:
   `npx eas submit --platform ios --profile ios-testflight --latest`
8. Watch App Store Connect: processing takes 10–30 min. If it stalls on export compliance, **B3** did
   not take effect — go back to **B6**.
9. Add **yourself as an internal tester**, install through the TestFlight app, and confirm the
   release build works with the workstation powered off. This is the check that actually proves §2.2.
10. Only now implement C2 and invite external testers.

---

## Part F — What beta customers do

Draft text for `README.md` (task **B8**) and for the invitation email.

### F1. One-time setup

1. Install **TestFlight** from the App Store (free, made by Apple).
2. Open the invitation link on the iPhone — either from the email invite or the public link.
3. Accept, then tap **Install**. LucidDream appears on the home screen like any other app.

### F2. Updates

TestFlight sends a notification when a new build is available; tap **Update**. No re-download of a
file, no settings to change.

### F3. Compared to the Android flow

|                        | Android (existing)                     | iOS (this plan)           |
| ---------------------- | -------------------------------------- | ------------------------- |
| One-time setup         | Allow "install from unknown sources"   | Install TestFlight        |
| Getting the build      | Download the APK from a GitHub Release | Tap an invite link        |
| Updates                | Re-download the APK manually           | Notification → tap Update |
| Your effort per tester | Zero                                   | Zero                      |

Friction is comparable, and updates are actually easier on iOS.

### F4. What to tell testers up front

- A build **expires 90 days** after release. They will be prompted to update well before that; the
  monthly scheduled build in **C2** is what keeps this from ever biting.
- The app requests **notification permission** — needed for run status. Recommend allowing it.
- For overnight runs, keep the device charging. The ringer switch may be left on silent.
- iPad is not supported for v1 (`supportsTablet: false`); it runs scaled.
- Where to send feedback. TestFlight has built-in feedback (screenshot + note) that lands in App
  Store Connect — decide whether to use it or a direct channel.

---

## Part G — Ongoing operations

### G1. Routine release

Tag `v<version>` → `release-android.yml` and `release-ios.yml` run in parallel → APK on a GitHub
Release, TestFlight build in App Store Connect. Android testers re-download; iOS testers get a
notification.

### G2. The 90-day clock

`release-ios.yml`'s monthly schedule (**C2**) handles it. **Verify the schedule actually fires** —
GitHub disables scheduled workflows on repositories with no activity for 60 days, which is a
plausible failure mode for a POC between pushes. Check quarterly.

### G3. Annual renewals

| Item                                          | Cadence     | Consequence of lapse                                                |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| Apple Developer Program                       | Yearly, $99 | TestFlight builds stop being installable; app record can be removed |
| Apple Distribution certificate                | Yearly      | Builds fail; fix with `eas credentials`                             |
| Ad Hoc provisioning profile (dev client only) | Yearly      | Your own dev client stops launching                                 |

Put all three on a calendar. The Apple Developer lapse is the one that hurts customers.

### G4. Version bumps and Beta App Review

Every change to `version` in `package.json` triggers a new **Beta App Review** for external testers
on the first build of that version. Internal testers are unaffected. When iterating fast with
customers, batching fixes into one version bump costs less review latency than shipping each one
separately.

### G5. If `expo-updates` is adopted (H2)

JS-and-runtime-asset fixes can be pushed to installed TestFlight builds via
`eas update --branch testflight`, with no build, no submission, and no review. Native changes
(§2.1's rebuild list) still need the full path. Free-tier cap is 1,000 MAU, far above beta needs.

---

## Part H — Decisions

H1, H2, H4 and H6 were **decided by Vlad on 2026-09-09** and are settled — implement them as written,
do not re-litigate. H3 is a documentation correction, not a choice. **H5 remains genuinely open** and
is deliberately deferred until device testing.

### H1. `appVersionSource` — **decided: `local`, computed** (revised)

**Original decision (2026-09-09): keep `"remote"`.** The reasoning was that `"local"` +
`autoIncrement` requires committing the bumped number back into the repository, which collides with
tag-triggered releases.

**That reasoning was incomplete.** It weighed only "avoid commit-back" and never weighed "the build
number must be readable offline from the clone" — a requirement Vlad raised the same day. Under
`"remote"` the number lives only on Expo's servers and needs `eas build:version:get` (network plus
auth) to read, while local Gradle builds silently use `versionCode` 1 forever. See §3.3 for the
verified current state.

**Revised recommendation: `appVersionSource: "local"`, with the build number _computed_ in
[`app.config.js`](../../app.config.js) rather than stored** — mechanism C in §3.4, specified in §3.5,
with maintainer rules in §3.6. It satisfies both constraints at once: no commit-back, and a number
any script in the clone can derive offline.

**Accepted cost:** the packing rules of §3.6 (minor/patch ≤ 99, counter ≤ 999) become real
constraints on the version scheme, and `autoIncrement` must come out of `eas.json`.

**Status:** [`eas.json`](../../eas.json) still says `"remote"` — deliberately left unchanged pending
confirmation, so nothing is half-migrated. Spec §5.2/§5.3 already say `"local"`, so adopting this
revision makes the spec _correct as written_ and reduces **H3** to the `package.json`-vs-`app.json`
wording fix alone.

### H2. `expo-updates` — **decided: adopt now**

`expo-updates` is **not** in [`package.json`](../../package.json). Without it, every JS-only fix for
a beta customer costs a full EAS build plus a submission, plus (on a version bump, for external
testers) another Beta App Review.

**Decision: adopt it, before the first customer build,** because adding it is itself a native change
and doing it later costs an extra rebuild-and-resubmit cycle.

Implementation:

1. `npx expo install expo-updates`
2. `npx eas update:configure`
3. Set `runtimeVersion` to `{ "policy": "fingerprint" }` — an update can then only ever land on a
   build whose native fingerprint matches, which is the property that makes OTA safe alongside a
   native-changing project.
4. Add `channel` keys to the `eas.json` profiles (**B1** — the `channel: "testflight"` line is now
   unconditional).
5. Add an `update:testflight` npm script wrapping `eas update --branch testflight`.

The dev-client flow is unaffected: dev builds ignore updates.

**Accepted cost:** one more native dependency, a channel/branch concept to keep straight, and the
discipline to remember that an OTA update cannot fix a native problem — see §2.1's rebuild list for
what still requires a full build.

### H3. Fix the spec's version-source wording

Spec §5.3 says `app.json` `version` is the single source of truth;
[`app.config.js`](../../app.config.js) overrides it from `package.json` and says so in a comment.
`package.json` wins. Update §5.3, and make sure C2's tag check reads `package.json`.

### H4. Tester model — **decided: both**

Per §2.4. **Decision: both classes.** Vlad (and any close collaborator) as an **internal** tester for
a zero-review loop with builds live minutes after processing; beta customers as **external** testers
via a **public link**, so no UDIDs are collected and no customer receives an App Store Connect
account.

**Accepted cost:** external testers wait on Beta App Review for the first build of each `version` —
see **G4** on batching fixes into one version bump.

### H5. Force `doNotMix` on iOS? — **OPEN**

Per **D2**. Lock-screen controls want `interruptionMode: 'doNotMix'`, but `audioFocus` is a
user-facing setting that also selects `duckOthers`. Options: force `doNotMix` on iOS and drop the
shared-focus option there; keep the setting and accept no lock-screen controls in shared mode; or
make `audioFocus` iOS-specific in the UI.

**Deliberately deferred** — this is a product call that should be informed by how the lock-screen
controls actually behave on hardware. Decide at **Part E step 5**, not before.

### H6. Apple enrolment — **decided: Individual**

Per **A1**. **Decision: Individual enrolment** for the POC. Approval in ~24–48 h against
Organization's multi-week D-U-N-S process.

**Accepted cost:** the seller name shown to testers and on any future App Store listing is Vlad's
personal legal name. Revisit before a public App Store release; migrating Individual → Organization
later is possible but painful.

---

## Part I — Execution order

Dependencies matter; this order avoids rework.

| #   | Task                                                                                      | Owner        | Blocked by |
| --- | ----------------------------------------------------------------------------------------- | ------------ | ---------- |
| 1   | **A1** Apple Developer enrolment, **Individual** — starts a 24–48 h clock, so do it first | Vlad         | —          |
| 2   | DONE — **B3**, **B6** config correctness (B4 only partly verifiable on Windows, see B6)   | agent        | —          |
| 3   | DONE — **B7** `prestart` / `preios` / `preandroid` hooks                                  | agent        | —          |
| 4   | DONE — **H2** `expo-updates` + fingerprint policy (`update:configure` deferred to A6)     | agent        | —          |
| 5   | DONE — **D1**, **D3** audio mode and notification handler                                 | agent        | —          |
| 6   | DONE — **B1** `eas.json` build profiles, **C1** `eas-build-ios.yml`                       | agent        | —          |
| 7   | DONE — **H1** §3 mechanism applied, **B9** `version:info`, **H3** spec §5.2/§5.3 wording  | agent        | —          |
| 8   | **A2**, **A3**, **A4**, **A5**, **A6** Apple and Expo setup                               | Vlad         | A1         |
| 9   | DONE — **B2** `eas.json` iOS submit config (Team `H6RLB65BLV`, app `6810464846`)          | agent        | —          |
| 10  | **A7** signing credentials                                                                | Vlad         | B1         |
| 11  | **A8** GitHub secrets                                                                     | Vlad         | A5, A6     |
| 12  | _(C1 done at step 6)_                                                                     | —            | —          |
| 13  | **A9** register your device                                                               | Vlad         | A1         |
| 14  | **Part E** steps 1–5: dev client on device                                                | Vlad         | C1, A9     |
| 15  | **D2**, **D4**, **D5**, **D6** iOS runtime work, device-verified                          | agent + Vlad | E          |
| 16  | **Part E** steps 6–9: manual TestFlight round-trip                                        | Vlad         | B2, A8     |
| 17  | **C2** `release-ios.yml` with the monthly schedule                                        | agent        | E          |
| 18  | **B8** README, **Part F** tester instructions                                             | agent        | E          |
| 19  | Invite external testers                                                                   | Vlad         | 16, 17, A4 |

**Exit criterion for M6**, per spec §7: a version tag produces a TestFlight build installable by an
external tester, with the developer workstation powered off.
