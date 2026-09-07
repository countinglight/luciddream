# LucidDream build and deployment

This file is the operational guide for producing and publishing LucidDream. Native Android/iOS
release work remains described in the v1 specification; this guide covers local web builds and the
Cloudflare Worker that serves both the web app and public customer content.

## Web behavior and limitation

The production web bundle runs the same Expo/React Native Web application as `npm run web`, using a
static export. Browser power-management rules still apply: an inactive or sleeping browser tab is
not an equivalent replacement for the Android foreground service. Treat the hosted web build as the
browser version of the app, not as a promise of native-quality unattended overnight execution.

## Local web build

Requirements: Node.js 22 and npm.

The repository pins Node 22/npm 10 through `.nvmrc`, `package.json`, and `.npmrc`. With nvm, run
`nvm use` before installing dependencies. The strict engine check prevents a newer npm release from
silently rewriting lockfile metadata.

```bash
npm ci
npm run build:web
```

To start the development server with the lock-screen demo enabled locally, run:

```bash
npm run demo:web
```

This opens the normal local web address with the same controls enabled by the production
`?demo=lock` query parameter.

Expo writes the production site to the ignored `dist/` directory. To exercise Cloudflare's local
static-asset server, run:

```bash
npm run preview:web
```

The first invocation downloads the pinned Wrangler CLI (`4.129.0`) through `npx`. No Cloudflare
login is required for local preview.

## Branch policy

- Feature and release preparation happens on development/release branches (currently `vlads-dev`).
- `deploy` is deployment-only. Never use it for development work, file edits, or direct commits.
  Update it only through the approved release/deployment process; a push to it publishes production.
- `master` remains the long-term stable branch and is not Cloudflare's deployment trigger.
- Other branches may produce Cloudflare preview versions when non-production builds are enabled.

Create the production branch once, after the release candidate is approved:

```bash
git fetch origin
git switch -c deploy vlads-dev
git push -u origin deploy
```

For later releases, update `deploy` through a reviewed pull request from the release branch. If the
repository permits a local fast-forward release, the equivalent commands are:

```bash
git switch deploy
git pull --ff-only origin deploy
git merge --ff-only <approved-release-branch>
git push origin deploy
```

Protect `deploy` in GitHub (Settings > Branches > Add branch protection rule): require pull requests
and the CI status check, and disallow force pushes/deletion.

## One-time Cloudflare setup

The repository already contains `wrangler.jsonc`. It defines:

- Worker name: `luciddream-web`
- Static output: `dist/`
- Production custom domain: `luciddream.countinglight.com`

Before connecting Git, open Cloudflare > `countinglight.com` > DNS > Records and confirm there is no
existing A, AAAA, or CNAME record named `luciddream`. A Worker Custom Domain is the origin and
Cloudflare creates its DNS record and TLS certificate. If a conflicting record exists, decide where
its current traffic should go before deleting it.

Then configure Workers Builds:

1. Sign in to Cloudflare and select the account that owns `countinglight.com`.
2. Open **Workers & Pages** > **Create application**.
3. Under **Import a repository**, select **Get started**.
4. Connect GitHub. Grant the Cloudflare GitHub app access to
   `vladsadovsky/luciddream` (repository-only access is sufficient).
5. Select the `vladsadovsky/luciddream` repository.
6. Set the application/Worker name to exactly `luciddream-web`. It must match `name` in
   `wrangler.jsonc`.
7. Set **Production branch** to `deploy`.
8. Leave **Root directory** empty (the project is at repository root).
9. Set **Build command** to `npm run build:web`.
10. Set **Deploy command** to `npx wrangler@4.129.0 deploy`.
11. Enable non-production branch builds if preview URLs are wanted. Set their deploy command to
    `npx wrangler@4.129.0 versions upload`.
12. Add build variable `NODE_VERSION` with value `22`.
13. Accept Cloudflare's generated build API token. No application runtime secrets are required.
14. Select **Save and Deploy**.

The first production deployment reads the custom-domain route from `wrangler.jsonc`. Cloudflare
creates the DNS record and provisions TLS. In the Worker, open **Settings > Domains & Routes** and
confirm both the `workers.dev` address and `luciddream.countinglight.com` appear. Certificate/DNS
activation can take a few minutes.

If the custom domain was not created, add it manually from **Settings > Domains & Routes > Add >
Custom Domain**, enter `luciddream.countinglight.com`, and select **Add Custom Domain**. Do not add a
Worker Route ending in `/*`; this Worker is the origin, so Custom Domain is the correct routing mode.

## Production verification

Open these URLs in a private browser window:

- `https://luciddream.countinglight.com/`
- `https://luciddream.countinglight.com/library`
- `https://luciddream.countinglight.com/content/manifest.json`
- `https://luciddream.countinglight.com/content/scripts/example.yaml`

Also verify headers from a terminal:

```bash
curl -I https://luciddream.countinglight.com/
curl -I https://luciddream.countinglight.com/content/scripts/example.yaml
```

The content response must include `access-control-allow-origin: *`. Exercise the app by adding the
example script from its full URL, running its Test action, and reloading the browser to confirm the
library and selected phase persist.

## Web lock-screen demo

The testing controls are available only at this exact production URL:

```text
https://luciddream.countinglight.com/?demo=lock
```

Start a run before using the controls. **Simulate Lock** replaces the normal page with a dark
lock-screen presentation showing the active phase, current step, elapsed time, **Stop run**,
**Wake / Unlock**, and **Simulate loud noise**. Stop uses the real session stop path. Wake returns to
the running Home screen. Loud noise uses the real duck/resume behavior: playback is reduced and
restored after 15 seconds.

For a live microphone reading, enable **Voice interrupt > Gentle** in Settings and start a run. The
demo panel reports the current dB level and the -30 dB trigger threshold when browser metering is
available. The HTTPS site will request microphone permission. The simulated-noise button remains
available when permission is denied or metering is unsupported.

This is a UI and session-control demonstration only. It does not lock the physical device and does
not prove that a browser run survives real screen-off/background execution.

## Publishing customer scripts and signals

Public customer files live here:

```text
public/content/
  manifest.json
  scripts/
  signals/
```

Use lowercase URL-safe filenames and avoid spaces. Script files should use `.yaml`; audio may use a
format supported by Expo Audio, normally `.wav` or `.mp3`. Every individual file must remain below
Cloudflare Workers Static Assets' 25 MiB limit.

To publish content:

1. Add the YAML file under `public/content/scripts/` or audio under `public/content/signals/` on the
   active release branch.
2. Add its display name and absolute production URL to `public/content/manifest.json`.
3. Run `npm run build:web` and confirm the file exists at the same relative path under `dist/`.
4. Commit and push the release branch.
5. Test the Cloudflare preview version if branch previews are enabled.
6. Merge the release branch into `deploy`. Cloudflare publishes it automatically.
7. Fetch the production URL directly and test adding it in LucidDream's Library.

Content is intentionally public and receives `Access-Control-Allow-Origin: *`. The checked-in
`public/_headers` uses browser revalidation for `/content/*`, so keeping a stable URL is safe: after
a deployment clients revalidate it instead of retaining stale content indefinitely. Expo's hashed
application bundles receive a one-year immutable cache policy.

Static hosting has no directory listing. `manifest.json` is the discoverable catalog and must be
updated alongside files. Removing a file breaks customers who still reference its URL; prefer
adding a versioned replacement and retaining the old file unless removal is deliberate.

## Manual deployment (fallback)

Normal releases use Cloudflare's Git integration. If it is unavailable, an authorized maintainer
can publish the checked-out commit locally:

```bash
npx wrangler@4.129.0 login
npm run deploy:web
```

Wrangler opens a browser for Cloudflare authorization. Confirm the selected account owns
`countinglight.com` before deploying.

## Rollback and troubleshooting

To roll back immediately, open **Workers & Pages > luciddream-web > Deployments**, select the last
known-good deployment/version, and choose **Rollback**. Then revert the bad commit in Git; otherwise
the next push to `deploy` will publish it again.

Common failures:

- **Worker name mismatch:** the dashboard application and `wrangler.jsonc` must both say
  `luciddream-web`.
- **Custom domain conflict:** remove an existing DNS record for `luciddream` before adding the
  Worker Custom Domain.
- **Build uses the wrong code:** confirm the production branch is `deploy` and root directory is
  empty.
- **`dist` missing:** the build command must be `npm run build:web` and complete before deploy.
- **A customer URL works directly but not in a browser app:** check that the response contains the
  CORS header from `public/_headers`.
- **Audio deployment is rejected:** verify that every individual file is below 25 MiB; larger files
  require a different store such as Cloudflare R2.

## Android install APK via USB

start %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe install android\app\build\outputs\apk\release\luciddream-v1.0.0-release.apk
