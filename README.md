# LucidDream

LucidDream is a cross-platform self-study app for lucid-dreaming audio experiments. It uses Expo,
React Native, and TypeScript to target Android, iOS, and the web from one codebase.

The v1 Run screen executes three fixed phases in order:

1. **Pre-sleep Training**
2. **Early Sleep**
3. **Wake Up**

Each phase selects a script from the Library or is explicitly Empty. Training is optional, and
either sleep phase may be empty, but Early Sleep and Wake Up may not both be empty. Selections are
remembered between launches. The app validates every populated script and resolves all referenced
audio before starting one continuous session and one run log.

## Implemented v1 foundation

- YAML script parser/interpreter with waits, playback, loops, conditions, scopes, volume changes,
  logging, and cancellation
- Bundled, URL, and device-file scripts/signals with explicit offline storage
- Three-phase session orchestration with wake lock, background audio setup, notification progress,
  Stop action, and optional gentle voice/sound interrupt
- JSONL run logs, local run index, filtering, export, and simulated context
- Light/dark/system themes and Android/iOS/web adapters
- Static Expo web export and Cloudflare Workers Static Assets configuration
- Opt-in beta diagnostics (night start/end, device, crashes) for iOS and Android, dormant until a
  build is given an endpoint — see
  [doc/plans/luciddream-beta-telemetry.md](doc/plans/luciddream-beta-telemetry.md)

See [doc/plans/luciddream-v1-spec.md](doc/plans/luciddream-v1-spec.md) for the functional and
engineering specification.

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm start          # Expo development server
npm run web        # browser development server
npm run android    # connected Android device/emulator
npm run ios        # macOS + Xcode only
```

There is no Mac in this project's workflow. iOS development on Windows uses an EAS development build
on a registered iPhone, connected to `npm start`; the steps are in
[doc/plans/luciddream-ios-support-plan.md](doc/plans/luciddream-ios-support-plan.md) §2.1 and Part E.

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run test:ci
```

## Structure

```text
src/engine/      pure TypeScript parser and interpreter
src/audio/       Expo Audio adapter and signal resolution
src/runtime/     composition root (services.ts) and context providers
src/session/     the night: session service, preparation, recovery, platform keep-alive
src/logging/     JSONL logs, record types, filtering, index, deletion, and export
src/storage/     library persistence and web/native file stores
src/telemetry/   opt-in beta diagnostics: events, offline queue, crash/kill detection
src/lib/         pure helpers: settings, night grouping, formatting
src/context/     React providers over the services above
src/hooks/       React views of the session, library, and run logs
src/components/  shared UI, including the root error boundary
src/constants/   theme tokens
src/app/         Expo Router screens
telemetry/       diagnostics ingest Worker and D1 schema
public/          static assets copied into the web export (PWA manifest, icons)
site/            the marketing website — hand-authored static HTML, no build step
site/content/    customer-hosted scripts, signals, and manifest
```

The engine imports no React Native, Expo, or sibling application modules — only its own files and
js-yaml, enforced as an allowlist in `eslint.config.js`. External behavior reaches it only through
port interfaces, which keeps overnight script behavior deterministic under tests.

A night is owned by `src/session/night-session.ts`, a plain TypeScript service with an explicit
state machine and no dependency on React; `src/hooks/use-session.ts` subscribes to it. Anything that
must run before or without the UI — launch-time recovery of an interrupted night, and in v2 an
OS-initiated relaunch — reaches storage through `src/runtime/services.ts` rather than a React
context.

## Building and publishing

Two surfaces are published from the `deploy` branch, each by its own Cloudflare Workers Build — a
build deploys to the Worker its project is connected to, so the two cannot share one project:

| Surface                       | Address                           | Source                        |
| ----------------------------- | --------------------------------- | ----------------------------- |
| Web application               | `luciddreamapp.countinglight.com` | Expo static export in `dist/` |
| Website and published content | `luciddream.countinglight.com`    | `site/`                       |

See [BUILD.md](BUILD.md) for:

- production web export and local preview, and local website preview
- the exact Cloudflare Git integration settings for both Workers
- the `deploy` production branch workflow
- Custom Domain setup for both hostnames
- publishing customer scripts/signals
- production verification, rollback, and troubleshooting

The website's plan and content specification is
[doc/plans/luciddream-website-plan.md](doc/plans/luciddream-website-plan.md).

Native Android/iOS distribution is specified in sections 5–7 of the v1 specification.

- **Android:** an APK attached to the repository's
  [releases page](https://github.com/countinglight/luciddream/releases).
- **iOS:** TestFlight. `.github/workflows/release-ios.yml` builds with EAS and submits to App Store
  Connect on a version tag (`v0.6.0` or `0.6.0`, matching `package.json`), and monthly so tester
  builds never reach Apple's 90-day expiry. Testers install TestFlight from the App Store, open the
  invitation link on the iPhone and tap Install; the website's
  [install page](https://luciddream.countinglight.com/install/#ios) carries the same steps.
- **JavaScript-only fixes** can reach installed builds without a new binary:
  `npm run update:testflight -- --message "..."` (or `update:preview` for APK builds). Native changes
  still need a build.

`npm run version:info` prints the version and build number the working tree will produce.

The hosted web app matches normal browser behavior, but browsers may throttle inactive tabs. Native
mobile builds remain the target for reliable unattended overnight execution.

## Library extensions

A **library extension** is a public JSON manifest that adds a collection of custom signals and
scripts to LucidDream in one import. In **Library > Library Extensions**, choose **Import
extension** and enter the manifest URL. For example:

```text
https://luciddream.countinglight.com/content/manifest.json
```

A version 1 manifest lists named signal and script URLs. `baseUrl` is optional; when present,
relative item URLs are resolved against it:

```json
{
  "version": 1,
  "baseUrl": "https://example.com/luciddream/",
  "signals": [{ "name": "soft chime", "url": "signals/soft-chime.mp3" }],
  "scripts": [{ "name": "MILD practice", "url": "scripts/mild.yaml" }]
}
```

The manifest and every referenced file must be available over HTTP or HTTPS. Browser imports also
require the hosting server to permit cross-origin access. Re-importing or refreshing an extension
updates its items from the same manifest rather than creating duplicates.
