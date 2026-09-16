# Maestro flows

Device smoke tests for LucidDream, for an Android emulator on Windows and the iOS Simulator on a
Mac. Written during the v1 hardening pass; **never executed** — the owner runs device checks. Treat
the first run as part of writing them.

Maestro is a standalone binary, not an npm dependency: nothing here changes the app's dependency
tree or its build.

## Install

```bash
curl -fsSL https://get.maestro.mobile.dev | bash
```

On Windows, run that inside WSL, or use the installer from <https://maestro.mobile.dev>.

## Run

Start an emulator, install a debug build, then:

```bash
npm run e2e
```

Or one flow at a time:

```bash
npm run e2e:launch
```

## Selectors

Flows target accessibility labels and visible text, which the app already sets on every control
(`IconButton`, `Button` and `HoldToStop` all take a spoken `label`). No `testID` was added to the
screens, deliberately: the redesign is recent and this session did not want to touch its layout.

**Expect some selectors to need adjusting on the first real run.** The ones most likely to need it:

- `Begin the night` — the label passed to `Button`, assumed to render as text.
- `Stop the night` — `HoldToStop` needs a ~2 s press. Maestro's `longPressOn` is used, but the
  exact duration may need raising.
- The Good morning heading varies with the hour: "Good morning" between 04:00 and 12:00, otherwise
  "Night complete". `smoke-night.yaml` accepts either.

## What these do not cover

An eight-hour night, Doze, screen-lock behaviour, background audio, battery, and the Android media
foreground service. None of that is reachable from an emulator flow; it is in
[v1-hardening-091526.md](../doc/dev_process/v1-hardening-091526.md) §1 as manual device work.
