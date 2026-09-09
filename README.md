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

See [doc/plans/luciddream-v1-spec.md](doc/plans/luciddream-v1-spec.md) for the functional and
engineering specification.

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm start          # Expo development server
npm run web        # browser development server
npm run android    # connected Android device/emulator
npm run ios        # macOS + Xcode simulator/device
```

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
src/runtime/     context providers
src/session/     three-phase run lifecycle and platform keep-alive behavior
src/logging/     JSONL logs, filtering, index, and export
src/storage/     library persistence and web/native file stores
src/app/         Expo Router screens
public/          static assets copied into the web export (PWA manifest, icons)
site/            the marketing website — hand-authored static HTML, no build step
site/content/    customer-hosted scripts, signals, and manifest
```

The engine imports no React Native, Expo, or sibling application modules. External behavior reaches
it only through port interfaces, which keeps overnight script behavior deterministic under tests.

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

Native Android/iOS distribution is specified in sections 5–7 of the v1 specification. The current
Android build is published as an APK on the repository's
[releases page](https://github.com/countinglight/luciddream/releases).

The hosted web app matches normal browser behavior, but browsers may throttle inactive tabs. Native
mobile builds remain the target for reliable unattended overnight execution.
