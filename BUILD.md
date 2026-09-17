# Building, releasing and operating LucidDream

How to set up a development environment, build and run the app on each platform, release it, and
operate the services behind it. For what the app does and how to use it, see [README.md](README.md).

## Contents

1. [Overview](#1-overview)
   - [What gets published where](#what-gets-published-where)
   - [Branches](#branches)
2. [Development setup](#2-development-setup)
   - [Toolchain](#toolchain)
   - [Install and run](#install-and-run)
   - [Quality checks](#quality-checks)
   - [Versioning](#versioning)
   - [Repository layout](#repository-layout)
3. [Web](#3-web)
   - [Build and preview](#build-and-preview)
   - [Debugging and the lock-screen demo](#debugging-and-the-lock-screen-demo)
   - [Deploying with Cloudflare](#deploying-with-cloudflare)
   - [Prototype deployment](#prototype-deployment)
   - [Verification](#verification)
   - [Rollback and troubleshooting](#rollback-and-troubleshooting)
4. [Android](#4-android)
   - [Build](#build)
   - [Install on a USB phone](#install-on-a-usb-phone)
   - [Emulator](#emulator)
   - [Debugging](#debugging)
   - [Release to testers](#release-to-testers)
5. [iOS](#5-ios)
   - [Development without a Mac](#development-without-a-mac)
   - [Troubleshooting the development connection](#troubleshooting-the-development-connection)
   - [Release to testers (TestFlight)](#release-to-testers-testflight)
6. [Updates without a new binary](#6-updates-without-a-new-binary)
7. [Device smoke tests (Maestro)](#7-device-smoke-tests-maestro)
8. [Website and published content](#8-website-and-published-content)
9. [Diagnostics service](#9-diagnostics-service)

---

## 1. Overview

### What gets published where

| Surface                       | Address or channel                                                             | Built from                   | Published by                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------- |
| Web app                       | `luciddreamapp.countinglight.com`                                              | Expo static export (`dist/`) | Cloudflare Workers Build `luciddream-web`, on push to `deploy`  |
| Website and published content | `luciddream.countinglight.com`                                                 | `site/` (static, no build)   | Cloudflare Workers Build `luciddream-site`, on push to `deploy` |
| Prototype web app             | `luciddream-prototype.countinglight.com`                                       | Expo static export           | `npm run deploy:prototype` only                                 |
| Diagnostics ingest            | `luciddream-telemetry.countinglight.com`                                       | `telemetry/worker/`          | `npm run deploy:telemetry` only                                 |
| Android app                   | APK on [GitHub Releases](https://github.com/countinglight/luciddream/releases) | EAS `preview` profile        | Attached to a GitHub Release                                    |
| iOS app                       | TestFlight                                                                     | EAS `ios-testflight` profile | `release-ios.yml` on a version tag, and monthly                 |

Every Wrangler command in this guide uses the pinned version `npx wrangler@4.129.0`. Run
`npx wrangler@4.129.0 whoami` and confirm the account that owns `countinglight.com` before any deploy.

### Branches

- Development and release preparation happen on working branches.
- `master` is the long-term stable branch. It is not a deployment trigger. Before work is merged into
  it, the documents in `doc/plans/` and `doc/dev_process/` are brought into a coherent state (see
  [AGENTS.md](AGENTS.md)).
- `deploy` is deployment-only: **a push to it publishes the web app and the website.** Never use it
  for development work or direct commits. Protect it in GitHub (Settings > Branches): require pull
  requests and the CI status check, and disallow force pushes and deletion.

Update `deploy` through a reviewed pull request from the approved release branch. Where a local
fast-forward is permitted:

```bash
git switch deploy
git pull --ff-only origin deploy
git merge --ff-only <approved-release-branch>
git push origin deploy
```

---

## 2. Development setup

### Toolchain

Node 22 and npm 10, pinned in five places that must agree:

| Where                         | Value                        | Read by                                      |
| ----------------------------- | ---------------------------- | -------------------------------------------- |
| `.nvmrc`                      | `22.20.0`                    | nvm, and Cloudflare's tool detection         |
| `engines` in `package.json`   | `node 22.x`, `npm 10.x`      | npm, enforced by `engine-strict` in `.npmrc` |
| `packageManager`              | `npm@10.9.8`                 | corepack, and Cloudflare's tool detection    |
| `volta`                       | `node 22.20.0`, `npm 10.9.8` | Volta                                        |
| `NODE_VERSION` build variable | `22.20.0`                    | Cloudflare Workers Builds only               |

**Every Node pin names an exact version, never a bare major.** Cloudflare resolves `22` to the newest
release in that line and its build image may not have it yet. A build that fails at
`Installing nodejs <version>` for a version written nowhere in the repository is this problem.

If `npm ci` fails with `EBADENGINE` reporting npm 11, a globally installed npm is shadowing the one
Node ships. Fix it with `npm i -g npm@10.9.8`.

Platform tooling:

- **Android:** Android Studio, which provides the SDK, `adb`, the emulator and a JDK.
- **iOS:** no Mac is needed. Builds run in EAS; see [section 5](#5-ios).

### Install and run

```bash
npm ci
npm start
```

`npm start` runs the Expo development server. From it, or directly:

| Command                    | Runs                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| `npm run web`              | The app in a browser                                                        |
| `npm run android`          | A debug build on a connected Android phone or running emulator              |
| `npm run android:emulator` | The same, creating and booting an emulator first ([4. Emulator](#emulator)) |
| `npm run ios`              | macOS with Xcode only; without a Mac use [section 5](#5-ios)                |

Before each of these, `generate:bundled-scripts` regenerates `src/storage/bundled-scripts.ts` from
`assets/scripts/`. That file is generated: edit the YAML, not the TypeScript.

`npm run clean:build` removes build output (`dist/`, Android build folders, coverage, `.expo`) and
leaves source untouched.

### Quality checks

```bash
npm run check
```

Runs, in order: `format:check`, `line-endings:check`, `lint`, `typecheck`, and the full test suite.
Run it before pushing. The individual steps are also scripts: `npm run lint`, `npm run typecheck`,
`npm test`, and `npm run test:ci` for coverage. `npm run format` rewrites formatting.

CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests with coverage on pushes and pull
requests to `master`.

### Versioning

`version` in `package.json` is the single source of truth for the app version. `app.config.js`
derives the Android `versionCode` and the iOS build number from it plus the `LUCIDDREAM_BUILD`
counter, which release workflows set from the workflow run number. Local builds use counter `0`, so
they can never be uploaded to a store by accident.

```bash
npm run version:info
```

prints the version and build number the working tree will produce.

To release a version: update `version` in `package.json`, commit, and tag the commit `v<version>`
(for example `v0.6.0`). Release workflows refuse to build when the tag and `package.json` disagree.
The full rules are in [doc/plans/luciddream-ios-support-plan.md](doc/plans/luciddream-ios-support-plan.md)
§3.

### Repository layout

```text
src/engine/      pure TypeScript script parser and interpreter
src/audio/       Expo Audio adapter and signal resolution
src/runtime/     composition root (services.ts) and context providers
src/session/     the night: session service, preparation, recovery, platform keep-alive
src/logging/     run logs, record types, filtering, index, deletion, and export
src/storage/     library persistence and web/native file stores
src/telemetry/   opt-in diagnostics client
src/lib/         pure helpers: settings, night grouping, formatting
src/context/     React providers over the services
src/hooks/       React views of the session, library, and run logs
src/components/  shared UI, including the root error boundary
src/constants/   theme tokens
src/app/         Expo Router screens
assets/scripts/  bundled example scripts (YAML)
telemetry/       diagnostics ingest Worker and D1 schema
scripts/         build, deploy and emulator helpers
public/          static assets copied into the web export
site/            the website: hand-authored static HTML, no build step
site/content/    published scripts, signals, and manifest
.maestro/        device smoke-test flows
doc/             specifications, plans, release notes, process records, field evidence
```

The engine imports only its own files and `js-yaml`, enforced as an allowlist in `eslint.config.js`;
everything else reaches it through the port interfaces in `src/engine/ports.ts`. A night is owned by
`src/session/night-session.ts`, a plain TypeScript service with no dependency on React, which
`src/hooks/use-session.ts` subscribes to. Code that must run without the UI reaches storage through
`src/runtime/services.ts`. The design is specified in
[doc/plans/luciddream-v1-spec.md](doc/plans/luciddream-v1-spec.md) §4.

---

## 3. Web

The web app is the same Expo application as `npm run web`, exported as static files. Browsers throttle
and suspend inactive tabs, so the web app is not a substitute for a phone for unattended overnight
runs.

### Build and preview

```bash
npm run build:web
```

writes the static export to `dist/`. To serve it through Cloudflare's local static-asset server,
exactly as production will:

```bash
npm run preview:web
```

No Cloudflare login is needed for local preview.

The website in `site/` has no build step. Preview it the same way, including `/content/*` and the
rules in `site/_headers`:

```bash
npm run preview:site
```

Two things to know when reviewing the website locally:

- The download button and version badges call GitHub's public releases API. No version, size or
  date is written into the pages: offline or rate-limited, they are simply omitted, and download
  links point to the latest release page. No site edit is needed when a release is published.
- The `/scripts/` page is rendered from `/content/manifest.json`. A published file missing from the
  manifest does not appear there.

### Debugging and the lock-screen demo

Use the browser's developer tools against `npm run web`.

The lock-screen demo shows the Sleeping screen's controls without locking anything. Locally:

```bash
npm run demo:web
```

In production, open `https://luciddreamapp.countinglight.com/?demo=lock`. Start a night first, then:

- **Simulate Lock** shows the dark lock-screen presentation with the active phase, current step,
  elapsed time, **Stop run**, **Wake / Unlock** and **Simulate loud noise**.
- **Stop run** uses the real stop path. **Wake / Unlock** returns to the running screen.
- **Simulate loud noise** uses the real voice-interrupt behaviour: playback is lowered and restored
  after 15 seconds.

With **Settings > Voice interrupt > Gentle** on, the demo also shows the live microphone level and
the −30 dB trigger threshold when the browser supports metering.

The demo does not lock the device and says nothing about whether a browser run survives with the
screen off.

### Deploying with Cloudflare

The web app and the website are two Workers, each with **its own** Workers Build project connected to
this repository:

| Worker            | Configuration         | Build command       | Deploy command                                       |
| ----------------- | --------------------- | ------------------- | ---------------------------------------------------- |
| `luciddream-web`  | `wrangler.jsonc`      | `npm run build:web` | `npx wrangler@4.129.0 deploy`                        |
| `luciddream-site` | `wrangler.site.jsonc` | none                | `npx wrangler@4.129.0 deploy -c wrangler.site.jsonc` |

**One build project per Worker.** A Workers Build deploys to the Worker its project is connected to,
whatever configuration file it is given. Deploying `-c wrangler.site.jsonc` from the web app's build
uploads the website's files to `luciddream-web` and replaces the app. Each project's deploy command
names exactly one configuration. A push to `deploy` therefore produces two builds.

#### One-time setup

Before connecting Git, check Cloudflare > `countinglight.com` > DNS for existing A, AAAA or CNAME
records named `luciddreamapp` or `luciddream`. A Worker Custom Domain creates its own DNS record and
certificate, and conflicts with an existing one.

**Web app (`luciddream-web`):**

1. **Workers & Pages** > **Create application** > **Import a repository** > **Get started**.
2. Connect GitHub and grant access to `countinglight/luciddream` (repository-only access is enough).
3. Worker name: exactly `luciddream-web`, matching `name` in `wrangler.jsonc`.
4. Production branch: `deploy`. Root directory: empty or `/`.
5. Build command: `npm run build:web`. Deploy command: `npx wrangler@4.129.0 deploy`, nothing more.
6. Leave non-production branch builds off. If previews are wanted, their deploy command is
   `npx wrangler@4.129.0 versions upload`.
7. Build variable `NODE_VERSION` = `22.20.0`, exactly.
8. Accept the generated build API token. **Save and Deploy**.

**Website (`luciddream-site`):**

1. Create the Worker with one manual deploy from a release checkout:
   `npx wrangler@4.129.0 login`, then `npm run deploy:site`.
2. **Workers & Pages** > `luciddream-site` > **Settings** > **Builds** > **Connect** the repository.
3. Production branch: `deploy`. Root directory: `/`.
4. Build command: empty. Deploy command: `npx wrangler@4.129.0 deploy -c wrangler.site.jsonc`.
5. Leave previews off. If wanted, their command must also carry the flag:
   `npx wrangler@4.129.0 versions upload -c wrangler.site.jsonc`.

**Dismiss Cloudflare's "keep settings consistent" notice on `luciddream-site`.** It proposes setting
`"name": "luciddream-site"` in `wrangler.jsonc`, which is the web app's configuration; accepting it
would make the web app's build publish to the website's Worker. Close any pull request it opens.

The first deployment creates each custom domain from its configuration. Confirm under each Worker's
**Settings > Domains & Routes**; activation can take a few minutes. If a domain is missing, add it
there as a **Custom Domain**, not as a Route ending in `/*`. A hostname belongs to one Worker at a
time: remove it from one before attaching it to another.

#### Manual deployment

If the Git integration is unavailable, an authorised maintainer can publish the checked-out commit:

```bash
npx wrangler@4.129.0 login
npm run deploy:web
npm run deploy:site
```

The two are independent. **Never run a bare `npx wrangler deploy`:** the default configuration is the
production web app.

### Prototype deployment

`luciddream-prototype` lets invited users try an unreleased branch without touching production. It
has **no Git build project**; only this command publishes it:

```bash
npm run deploy:prototype
```

Run it from a clean checkout of the branch being previewed. It runs `build:web`, adds an
`X-Robots-Tag: noindex` header (`scripts/mark-prototype-headers.js`) and deploys with
`-c wrangler.prototype.jsonc`. The bundle is identical to production; the app recognises the
prototype by hostname and shows a **Prototype** badge on Tonight. Preview the badge locally with
`?variant=prototype`.

One-time setup: confirm no DNS record named `luciddream-prototype` exists, and use this one-level
subdomain (Universal SSL covers `*.countinglight.com` only). Optionally restrict it with Cloudflare
Access. Data entered on the prototype lives in that origin's browser storage, separate from
production. Delete the Worker when the branch ships.

### Verification

After a deployment, open in a private window:

- `https://luciddreamapp.countinglight.com/` and `/library`
- `https://luciddream.countinglight.com/`, `/scripts/`, `/install/`, `/privacy/`, `/about/`
- `https://luciddream.countinglight.com/content/manifest.json`
- `https://luciddream.countinglight.com/content/scripts/example.yaml`

```bash
curl -I https://luciddreamapp.countinglight.com/
curl -I https://luciddream.countinglight.com/content/scripts/example.yaml
```

The content response must include `access-control-allow-origin: *`. In the app, add the example
script by URL, test it, and reload to confirm the library and phase selection persist. On the website,
confirm the download button points at the current GitHub release and `/scripts/` lists the published
entries.

### Rollback and troubleshooting

**Roll back:** **Workers & Pages** > the affected Worker > **Deployments** > last good version >
**Rollback**. Then revert the bad commit, or the next push to `deploy` publishes it again.

| Symptom                                      | Cause and fix                                                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One surface serving the other's content      | A build project deployed the other Worker's configuration. Roll back, then correct that project's deploy command.                                                           |
| Prototype badge on production                | A prototype branch was deployed without `-c`. Roll back `luciddream-web`, then `npm run deploy:prototype`.                                                                  |
| Only one surface updated                     | Each Worker has its own build project; check both are connected and both ran.                                                                                               |
| Worker name mismatch                         | Dashboard name and configuration must agree: `luciddream-web`/`wrangler.jsonc`, `luciddream-site`/`wrangler.site.jsonc`, `luciddream-prototype`/`wrangler.prototype.jsonc`. |
| Custom domain conflict                       | Remove the hostname from the previous Worker and any conflicting DNS record first.                                                                                          |
| Wrong code built                             | Production branch must be `deploy`, root directory empty.                                                                                                                   |
| `dist` missing                               | The web app's build command must be `npm run build:web`.                                                                                                                    |
| Build fails at `Installing nodejs <version>` | A Node pin is a bare major; see [Toolchain](#toolchain).                                                                                                                    |
| Content URL works directly, not in the app   | The response lacks the CORS header from `site/_headers`.                                                                                                                    |
| Audio upload rejected                        | A file exceeds the Workers Static Assets limit of 25 MiB.                                                                                                                   |

---

## 4. Android

### Build

| Command                       | Produces                                                                  | Use for                                                              |
| ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `npm run android`             | Debug development build, installed and launched                           | Daily development; needs Metro (`npm start`) running                 |
| `npm run android:apk:debug`   | `android\app\build\outputs\apk\debug\`                                    | A debug APK to install by hand; needs Metro                          |
| `npm run android:apk:release` | `android\app\build\outputs\apk\release\luciddream-v<version>-release.apk` | Testing on your own phone, including full nights; runs without Metro |

The APK name carries the version from `package.json` (`plugins/withCanonicalVersion.js`). The local
release APK is built for ARM phones only (`armeabi-v7a`, `arm64-v8a`) and is signed with the **debug
keystore**, not the release key EAS holds. Do not give it to testers: a tester who later installs the
EAS-built APK would have to uninstall first and lose their data. Testers get the EAS build
([Release to testers](#release-to-testers)).

### Install on a USB phone

**One-time phone setup:** enable Developer options (Settings > About phone, tap **Build number**
seven times), turn on **USB debugging**, connect the cable, unlock the phone and accept **Allow USB
debugging**.

`adb` is usually not on `PATH`. The commands below use its full path from Command Prompt (`cmd`). In
PowerShell, replace `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` with
`& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"`.

1. Check the phone is visible. A line ending in `device` means ready; `unauthorized` means accept the
   prompt on the phone.

   ```bat
   %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe devices
   ```

2. Install, replacing any existing copy:

   ```bat
   %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe -d install -r android\app\build\outputs\apk\release\luciddream-v0.6.0-release.apk
   ```

   `-d` targets the USB phone, which matters when an emulator is also running. `-r` replaces an
   existing install and keeps its data. Adjust the version in the file name to match `package.json`.

If install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the installed copy was signed with a
different key. Uninstalling it **deletes the app's data on the phone**, including nights and library
items:

```bat
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe -d uninstall com.vladsadovsky.luciddream
```

**Before a full-night test**, set LucidDream's battery setting to **Unrestricted** in the phone's app
settings. Many Android makers stop background apps overnight otherwise.

### Emulator

`scripts/android-emulator.js` creates, boots and inspects an emulator with the SDK tools Android
Studio installed. Its `adb` calls target the emulator only (`adb -e`), so a connected phone is never
touched.

| Command                            | What it does                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `npm run emulator:plan`            | Shows the SDK, system image and emulator it would use. Changes nothing.    |
| `npm run emulator:start`           | Creates the `luciddream` emulator if missing, boots it, waits for Android. |
| `npm run android:emulator`         | Starts it, then builds and installs the debug app (needs Metro).           |
| `npm run android:emulator:release` | Starts it, then builds and installs a release build.                       |
| `npm run emulator:check`           | Boot, Doze, install and foreground-service state.                          |
| `npm run emulator:doze`            | Screen off, battery unplugged, forced into deep Doze.                      |
| `npm run emulator:wake`            | Undoes `emulator:doze`.                                                    |

The emulator is created from the newest complete, stable Google APIs x86_64 system image. If none is
installed: Android Studio > **Settings > Languages & Frameworks > Android SDK**, tick **Show Package
Details**, and under a released Android version install **Google APIs Intel x86_64 Atom System
Image**. On the **SDK Tools** tab, keep **Android SDK Command-line Tools (latest)** installed; older
tools cannot read what current Android Studio installs. Do not install ARM system images on an x86
PC. Set `LUCIDDREAM_AVD` to use an emulator you created yourself.

**Checking a night survives Doze:** start a night, run `npm run emulator:doze`, wait through a silent
stretch, then `npm run emulator:check`. `Foreground service: RUNNING` is the result wanted: without
it, Android stops background playback after about three minutes. A full night still belongs on a
phone.

`android:apk:release` output will not install on an x86_64 emulator; use `android:emulator:release`.

### Debugging

- **JavaScript logs** from a USB phone:

  ```bat
  %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe -d logcat *:S ReactNative:V ReactNativeJS:V
  ```

- **Debug builds** (`npm run android`) connect to Metro; press `j` in the Metro terminal to open the
  debugger, or shake the phone for the developer menu.
- **Background behaviour:** `npm run emulator:check` reports whether the media foreground service is
  running, on the emulator.
- **Run logs:** every night's log can be shared from **Nights** in the app.

### Release to testers

Testers install an APK attached to a
[GitHub Release](https://github.com/countinglight/luciddream/releases). It is built by EAS with the
`preview` profile (`buildType: apk`), so every release is signed with the same EAS-managed key and
installs over the previous one.

1. Update and tag the version ([Versioning](#versioning)).
2. Run the **EAS Build (Android)** workflow (`eas-build-android.yml`, manual dispatch) with profile
   `preview`, or `npx eas-cli build --platform android --profile preview` locally.
3. Download the APK from the build page on expo.dev and attach it to a GitHub Release for the tag.

Export the upload keystore once with `npx eas-cli credentials` and keep it outside the repository:
losing it forces every tester to uninstall to update.

The workflows need the `EXPO_TOKEN` repository secret. Play Store submission (`eas-submit-android.yml`,
`production` profile, needs `GOOGLE_SERVICE_ACCOUNT_KEY`) exists but is not a v1 distribution channel.

---

## 5. iOS

### Development without a Mac

iOS has two separate kinds of build, and they share no runtime path:

| Build                 | Profile          | Who uses it   | Where its JavaScript comes from                   |
| --------------------- | ---------------- | ------------- | ------------------------------------------------- |
| **Development build** | `development`    | the developer | the development server on the workstation, live   |
| **TestFlight build**  | `ios-testflight` | testers       | compiled into the app; no workstation is involved |

Everything in this section concerns the development build. Testers never register devices, enable
Developer Mode or connect to a server.

Use `npx eas-cli`, not `npx eas`, which does not resolve to the EAS CLI.

#### One-time setup

1. **Expo account.** Create one at [expo.dev](https://expo.dev) — `login` signs in but does not create
   an account — then sign in:

   ```bash
   npx eas-cli login
   ```

   The project is already linked: its ID is `extra.eas.projectId` in `app.json`.

2. **Register the iPhone.** Development builds use Ad Hoc signing, which only installs on devices
   whose identifiers are compiled into the build.

   ```bash
   npx eas-cli device:create
   ```

   Choose the website method and open the link **in Safari** on the iPhone; install the offered
   profile. Confirm with `npx eas-cli device:list`. A device registered after a build needs a new
   build.

3. **Enable Developer Mode** on the iPhone: Settings → Privacy & Security → Developer Mode → on,
   restart, then confirm **Turn On**. Without it, the app shows _Developer Mode Required_ and will
   not open. TestFlight builds do not need it.

4. **Build and install:**

   ```bash
   npx eas-cli build --platform ios --profile development
   ```

   or the **EAS Build (iOS)** workflow (`eas-build-ios.yml`) with profile `development`. Open the
   link the build prints in Safari on the iPhone and install. The installed **LucidDream** app is the
   development client.

#### Daily loop

```bash
npm start
```

Open LucidDream on the iPhone. Its launcher lists development servers found on the network; if none
appears, choose **Enter URL manually** and type `http://<workstation Wi-Fi address>:8081`. The app
loads its JavaScript from the server, and saved changes appear through Fast Refresh.

The installed app is a shell: native modules, `Info.plist`, entitlements, icon and splash. What a
change needs:

| Change                                                                      | Needs                                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| TypeScript under `src/`                                                     | nothing — Fast Refresh                                                           |
| Images and sounds loaded with `require()` (for example `assets/sounds/`)    | reload the app                                                                   |
| `assets/scripts/*.yaml`                                                     | `npm run generate:bundled-scripts` while the server runs, or restart `npm start` |
| `assets/images/icon.png`, `splash-icon.png`                                 | a new development build                                                          |
| `app.json` plugins or permissions, a new native module, an Expo SDK upgrade | a new development build                                                          |
| A newly registered device                                                   | a new development build                                                          |
| `public/`                                                                   | nothing on iOS — web only                                                        |

The same split decides what [Expo Updates](#6-updates-without-a-new-binary) can deliver to installed
TestFlight builds.

The native iOS project cannot be generated on Windows (`expo prebuild --platform ios` requires macOS
or Linux). To inspect the resolved configuration — bundle identifier, version, build number,
`usesNonExemptEncryption` — run `npx expo config --type prebuild --json`. Entries added by plugins
while writing native files, such as `UIBackgroundModes`, do not appear there; check them in the EAS
build log.

### Troubleshooting the development connection

Test reachability from the iPhone first. In Safari open:

```
http://<workstation address>:8081/status
```

`packager-status:running` means the iPhone reaches the server, and a remaining problem is in the app.
A timeout means the network or the firewall is blocking it.

**Wrong address.** A workstation with several adapters (Ethernet and Wi-Fi, virtual switches) may
advertise an address the iPhone cannot use. List them:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress
```

Use the address on the network the iPhone is on — enter it manually in the app, or make the server
advertise it:

```powershell
$env:REACT_NATIVE_PACKAGER_HOSTNAME='<Wi-Fi address>'; npm start
```

**Windows Firewall.** Port 8081 must accept inbound connections, and a rule for the `Private` profile
does nothing while Windows classifies the network as `Public`. In an elevated PowerShell:

```powershell
Get-NetConnectionProfile
Set-NetConnectionProfile -Name "<network name>" -NetworkCategory Private
New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private
```

Only classify a trusted home or office network as `Private`.

**Different networks.** When the iPhone cannot route to the workstation at all, relay through Expo:

```bash
npx expo start --tunnel
```

It works across networks and firewalls, and is slower.

### Release to testers (TestFlight)

`release-ios.yml` builds with the `ios-testflight` profile and submits to App Store Connect:

- on a version tag (`v0.6.0` or `0.6.0`, which must match `package.json`), and
- monthly, because TestFlight builds expire 90 days after upload and testers would otherwise lose a
  working app. GitHub disables scheduled workflows in repositories inactive for 60 days; check that it
  still runs.

It needs the repository secrets `EXPO_TOKEN`, `APPLE_API_KEY`, `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER_ID`. A store build without submitting: `eas-build-ios.yml` with profile
`ios-testflight`.

Testers install **TestFlight** from the App Store, open the invitation link on the iPhone and tap
**Install**. The website's [install page](https://luciddream.countinglight.com/install/#ios) gives the
same steps.

Full nights on iPhone are tested through a TestFlight build, which behaves like an App Store install
for background audio.

---

## 6. Updates without a new binary

JavaScript-only changes can reach installed apps through Expo Updates:

```bash
npm run update:testflight -- --message "What changed"
```

for TestFlight builds, or `npm run update:preview` for APKs built with the `preview` profile. Native
changes (new native modules, `app.json` plugin or permission changes) always need a new build.

`EXPO_PUBLIC_*` variables are compiled into the bundle. An update published from a shell without the
variables a build was made with — for example the diagnostics endpoint — ships a bundle without them.
Set the same variables before publishing.

---

## 7. Device smoke tests (Maestro)

Flows in [.maestro/](.maestro/README.md) cover launch, opening each sheet, a night that begins and
stops, and a plan with nothing to play. Maestro is a standalone tool, not an npm dependency:

```bash
curl -fsSL https://get.maestro.mobile.dev | bash
```

On Windows, install it under WSL. Then, with an emulator or phone running the app:

| Command                 | Flow                                        |
| ----------------------- | ------------------------------------------- |
| `npm run e2e`           | All flows                                   |
| `npm run e2e:launch`    | App launches to Tonight                     |
| `npm run e2e:sheets`    | Library, Nights and Settings open and close |
| `npm run e2e:night`     | A night begins, runs and stops              |
| `npm run e2e:bad-input` | An empty plan refuses to start              |

Flows select controls by their accessibility labels. Screenshots go to `.maestro/artifacts/`, which
is ignored by git. Emulator flows cannot exercise an eight-hour night, Doze, screen-lock behaviour,
background audio or battery; those need a phone.

---

## 8. Website and published content

The website's content and design are specified in
[doc/plans/luciddream-website-plan.md](doc/plans/luciddream-website-plan.md). Published scripts and
signals live under `site/content/` and are served by the website Worker:

```text
site/content/
  manifest.json
  scripts/
  signals/
```

`manifest.json` is a **library extension**: its public URL,
`https://luciddream.countinglight.com/content/manifest.json`, can be imported in the app to add every
listed item at once. The format is described in [README.md](README.md#library-extensions).

File rules:

- lowercase, URL-safe names with no spaces
- scripts as `.yaml`; audio normally `.wav` or `.mp3`
- every file below 25 MiB
- every URL in the manifest must be `https://`

To publish:

1. Add the file under `site/content/scripts/` or `site/content/signals/` on the release branch.
2. Add its name and absolute production URL to `site/content/manifest.json`. An entry left out is
   published but invisible on `/scripts/`, and every script in a manifest must be valid, or the app
   refuses the whole import.
3. `npm run preview:site` and fetch the file locally.
4. Merge the release branch into `deploy`.
5. Fetch the production URL and add it in the app's Library.

Content is public and served with `Access-Control-Allow-Origin: *`. `site/_headers` makes browsers
revalidate `/content/*`, so a stable URL never serves stale content for long. There is no directory
listing: the manifest is the catalog. Removing a file breaks anyone still using its URL; prefer a
versioned replacement.

---

## 9. Diagnostics service

`luciddream-telemetry` receives opt-in night summaries from the app. Everything about it —
what is collected, the API, connecting builds, operations, queries and troubleshooting — is in
[doc/plans/luciddream-telemetry.md](doc/plans/luciddream-telemetry.md).

```bash
npm run telemetry:db:schema
npm run deploy:telemetry
```

Apply schema changes before deploying a Worker that depends on them. `deploy:telemetry` refuses a
placeholder database id and runs `wrangler whoami` first.
