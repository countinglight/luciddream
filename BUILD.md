# LucidDream build and deployment

This file is the operational guide for producing and publishing LucidDream. Native Android/iOS
release work remains described in the v1 specification; this guide covers local web builds and the
two Cloudflare Workers that serve the project.

| Worker            | Domain                            | Assets  | Serves                                               |
| ----------------- | --------------------------------- | ------- | ---------------------------------------------------- |
| `luciddream-web`  | `luciddreamapp.countinglight.com` | `dist/` | The Expo static web application                      |
| `luciddream-site` | `luciddream.countinglight.com`    | `site/` | The marketing website and published customer content |

Both are deployed from the same `deploy` branch, but by **two separate Cloudflare Workers Builds** —
one project per Worker, for the reason given under "One-time Cloudflare setup". Published customer
content lives on the site domain so that `/content/*` URLs already handed out keep working; see
[doc/plans/luciddream-website-plan.md](doc/plans/luciddream-website-plan.md) for the reasoning.

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

Five places state a version, and they must agree:

| Where                         | Value                        | Read by                                      |
| ----------------------------- | ---------------------------- | -------------------------------------------- |
| `.nvmrc`                      | `22.20.0`                    | nvm, and Cloudflare's tool detection         |
| `engines`                     | `node 22.x`, `npm 10.x`      | npm, enforced by `engine-strict` in `.npmrc` |
| `packageManager`              | `npm@10.9.8`                 | corepack, and Cloudflare's tool detection    |
| `volta`                       | `node 22.20.0`, `npm 10.9.8` | Volta                                        |
| `NODE_VERSION` build variable | `22.20.0`                    | Cloudflare only, set per Workers Build       |

**Every Node pin must name an exact version, never a bare major.** Cloudflare Workers Builds
resolves `22` to the newest release in that line and then installs it, and its image lags the Node
release feed. Two application builds failed on 2026-09-09 at `Installing nodejs 22.23.2` — a valid
release from 2026-07-28 that the image did not have — while `.nvmrc` and the `NODE_VERSION` variable
both said `22`. Changing `volta.node` alone did not fix it, which is how we learned Volta's pin is
not what Cloudflare reads.

If a build fails at `Installing nodejs <version>` for a version written nowhere in the repository,
it is the resolved newest of a major-only spec. Pin the exact version instead.

If `npm ci` fails locally with `EBADENGINE` reporting npm 11, a globally installed npm is shadowing
the one Node ships. No Node 22 release bundles npm 11 — 22.23.2 bundles 10.9.8 — so the fix is
`npm i -g npm@10.9.8`, matching `packageManager`.

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

## Local website preview

The marketing website in `site/` is hand-authored static HTML and has **no build step**. Preview it
with the same local static-asset server:

```bash
npm run preview:site
```

This serves `site/` exactly as the `luciddream-site` Worker will, including `/content/*` and the
rules in `site/_headers`. Because nothing is compiled, an edit is visible on reload.

Two runtime details are worth knowing when reviewing locally:

- The download button and version badges call GitHub's public releases API. If the call fails —
  offline, or rate-limited — the page falls back to the values hard-coded in
  `site/assets/js/release.js`, which must be kept roughly current.
- The `/scripts/` library is rendered from `/content/manifest.json` at page load. An entry missing
  from the manifest does not appear, even if the file is published.

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

The repository contains both Worker configurations:

- `wrangler.jsonc` — Worker `luciddream-web`, assets `dist/`, custom domain
  `luciddreamapp.countinglight.com`.
- `wrangler.site.jsonc` — Worker `luciddream-site`, assets `site/`, custom domain
  `luciddream.countinglight.com`.

Before connecting Git, open Cloudflare > `countinglight.com` > DNS > Records and confirm there is no
existing A, AAAA, or CNAME record named `luciddream` or `luciddreamapp`. A Worker Custom Domain is
the origin and Cloudflare creates its DNS record and TLS certificate. If a conflicting record
exists, decide where its current traffic should go before deleting it.

**One build project per Worker.** A Workers Build deploys to the Worker its project is connected
to, whatever the Wrangler configuration says. Passing `-c wrangler.site.jsonc` to a second
`wrangler deploy` inside the application's build changes which assets are uploaded but **not which
Worker receives them**, so the website's files land on `luciddream-web` and replace the application.
This was tried on 2026-09-08 and did exactly that. Each Worker therefore needs its own build
project, and each deploy command names exactly one configuration.

Configure the application's build:

1. Sign in to Cloudflare and select the account that owns `countinglight.com`.
2. Open **Workers & Pages** > **Create application**.
3. Under **Import a repository**, select **Get started**.
4. Connect GitHub. Grant the Cloudflare GitHub app access to
   `countinglight/luciddream` (repository-only access is sufficient).
5. Select the `countinglight/luciddream` repository.
6. Set the application/Worker name to exactly `luciddream-web`. It must match `name` in
   `wrangler.jsonc`.
7. Set **Production branch** to `deploy`.
8. Leave **Root directory** empty, or `/` (the project is at repository root).
9. Set **Build command** to `npm run build:web`.
10. Set **Deploy command** to `npx wrangler@4.129.0 deploy`. Nothing more — no second deploy.
11. Leave non-production branch builds disabled. If preview URLs are wanted, set their deploy
    command to `npx wrangler@4.129.0 versions upload`.
12. Add build variable `NODE_VERSION` with the **exact** value `22.20.0`. A bare major resolves to
    the newest release in that line, which the build image may not have.
13. Accept Cloudflare's generated build API token. No application runtime secrets are required.
14. Select **Save and Deploy**.

Then configure the website's build, on its own Worker:

1. Create the `luciddream-site` Worker if it does not exist. The simplest way is one manual deploy
   from a checkout of the release branch: `npx wrangler@4.129.0 login` then `npm run deploy:site`.
2. Open **Workers & Pages** > `luciddream-site` > **Settings** > **Builds** and **Connect** the
   `countinglight/luciddream` repository. (Alternatively, **Create application** > **Import a
   repository** with the Worker name set to exactly `luciddream-site`, which attaches to the
   existing Worker rather than creating a second one.)
3. Set **Production branch** to `deploy`.
4. Leave **Build command** empty. The website is static HTML and compiles nothing.
5. Set **Deploy command** to `npx wrangler@4.129.0 deploy -c wrangler.site.jsonc`.
6. Leave **Root directory** as `/`.
7. Leave preview builds disabled. If they are wanted, their command must also carry the
   configuration flag: `npx wrangler@4.129.0 versions upload -c wrangler.site.jsonc`. Without it,
   the build falls back to `wrangler.jsonc` — the application's configuration — and fails, because
   this project has no build command and therefore no `dist/`.

**Ignore Cloudflare's "keep settings consistent" notice on `luciddream-site`.** It advises setting
`"name": "luciddream-site"` in `wrangler.jsonc` and offers to raise a pull request doing so. That
advice assumes the project deploys the default configuration file; this one passes
`-c wrangler.site.jsonc`, which already carries the correct name. Merging that pull request would
rename the **application's** configuration and make the application's build publish to the website's
Worker. Dismiss the notice, and close the pull request if one appears.

A push to `deploy` should produce **two** builds, one per project.

The first production deployment reads each custom-domain route from its Wrangler configuration.
Cloudflare creates the DNS records and provisions TLS. Open **Settings > Domains & Routes** on each
Worker and confirm its `workers.dev` address and its custom domain appear. Certificate/DNS
activation can take a few minutes.

If a custom domain was not created, add it manually from **Settings > Domains & Routes > Add >
Custom Domain** on the correct Worker. Do not add a Worker Route ending in `/*`; these Workers are
origins, so Custom Domain is the correct routing mode.

**Moving the application off `luciddream.countinglight.com`.** A hostname can belong to only one
Worker. When migrating an existing single-Worker setup, remove `luciddream.countinglight.com` from
`luciddream-web` first, add `luciddreamapp.countinglight.com` to it, then attach
`luciddream.countinglight.com` to `luciddream-site`. Doing it in that order avoids a routing
conflict, at the cost of a short window in which the old address serves nothing.

## Production verification

Open these URLs in a private browser window.

Application:

- `https://luciddreamapp.countinglight.com/`
- `https://luciddreamapp.countinglight.com/library`

Website and published content:

- `https://luciddream.countinglight.com/`
- `https://luciddream.countinglight.com/scripts/`
- `https://luciddream.countinglight.com/install/`
- `https://luciddream.countinglight.com/privacy/`
- `https://luciddream.countinglight.com/about/`
- `https://luciddream.countinglight.com/content/manifest.json`
- `https://luciddream.countinglight.com/content/scripts/example.yaml`

Also verify headers from a terminal:

```bash
curl -I https://luciddreamapp.countinglight.com/
curl -I https://luciddream.countinglight.com/
curl -I https://luciddream.countinglight.com/content/scripts/example.yaml
```

The content response must include `access-control-allow-origin: *`. Exercise the app by adding the
example script from its full URL, running its Test action, and reloading the browser to confirm the
library and selected phase persist. On the website, confirm the download button resolves to the
current GitHub release and that the script library on `/scripts/` lists the published entries.

## Web lock-screen demo

The testing controls are available only at this exact production URL:

```text
https://luciddreamapp.countinglight.com/?demo=lock
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

Public customer files live here, served by the **site** Worker:

```text
site/content/
  manifest.json
  scripts/
  signals/
```

Use lowercase URL-safe filenames and avoid spaces. Script files should use `.yaml`; audio may use a
format supported by Expo Audio, normally `.wav` or `.mp3`. Every individual file must remain below
Cloudflare Workers Static Assets' 25 MiB limit.

To publish content:

1. Add the YAML file under `site/content/scripts/` or audio under `site/content/signals/` on the
   active release branch.
2. Add its display name and absolute production URL to `site/content/manifest.json`. The website's
   `/scripts/` page renders this manifest, so an entry omitted here is published but invisible.
3. Run `npm run preview:site` and fetch the file from the local preview.
4. Commit and push the release branch.
5. Test the Cloudflare preview version if branch previews are enabled.
6. Merge the release branch into `deploy`. Cloudflare publishes it automatically.
7. Fetch the production URL directly and test adding it in LucidDream's Library.

Content is intentionally public and receives `Access-Control-Allow-Origin: *`. The checked-in
`site/_headers` uses browser revalidation for `/content/*`, so keeping a stable URL is safe: after
a deployment clients revalidate it instead of retaining stale content indefinitely. Expo's hashed
application bundles receive a one-year immutable cache policy from `public/_headers`.

Static hosting has no directory listing. `manifest.json` is the discoverable catalog and must be
updated alongside files. Removing a file breaks customers who still reference its URL; prefer
adding a versioned replacement and retaining the old file unless removal is deliberate.

## Manual deployment (fallback)

Normal releases use Cloudflare's Git integration. If it is unavailable, an authorized maintainer
can publish the checked-out commit locally:

```bash
npx wrangler@4.129.0 login
npm run deploy:web
npm run deploy:site
```

Wrangler opens a browser for Cloudflare authorization. Confirm the selected account owns
`countinglight.com` before deploying. The two commands are independent — publishing only the website
does not require rebuilding or redeploying the application.

## Rollback and troubleshooting

To roll back immediately, open **Workers & Pages**, select the affected Worker (`luciddream-web` for
the application, `luciddream-site` for the website), open **Deployments**, choose the last
known-good deployment/version, and select **Rollback**. Then revert the bad commit in Git; otherwise
the next push to `deploy` will publish it again.

Common failures:

- **Worker name mismatch:** the dashboard application and the Wrangler configuration must agree —
  `luciddream-web` with `wrangler.jsonc`, `luciddream-site` with `wrangler.site.jsonc`.
- **Custom domain conflict:** a hostname can belong to only one Worker. Remove it from the previous
  Worker before attaching it to another, and remove any conflicting DNS record first.
- **Build uses the wrong code:** confirm the production branch is `deploy` and root directory is
  empty.
- **`dist` missing:** the build command must be `npm run build:web` and complete before deploy.
- **Only one surface updated:** each Worker has its own build project. Check that both projects are
  connected to the repository and that both ran for the commit in question.
- **One surface serving the other's content:** a build project deployed a configuration belonging to
  the other Worker. Roll the affected Worker back to its last good version, then correct that
  project's deploy command so it names only its own configuration.
- **A customer URL works directly but not in a browser app:** check that the response contains the
  CORS header from `site/_headers`.
- **Audio deployment is rejected:** verify that every individual file is below 25 MiB; larger files
  require a different store such as Cloudflare R2.

## Android install APK via USB

start %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe install android\app\build\outputs\apk\release\luciddream-v0.5.0-release.apk

The APK filename tracks `version` in `package.json` through
`plugins/withCanonicalVersion.js`, so it changes with each version bump.
