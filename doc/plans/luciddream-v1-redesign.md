# LucidDream v1 — Visual Redesign ("Dream Console")

Branch: `v1-redesign`. Supersedes the four-tab structure in
[luciddream-v1-spec.md §2.3](luciddream-v1-spec.md) for the UI only; every v1 function is kept.

## Why

Early users found the app "too bland and boring" on first open and during setup. The app still
used the Expo starter theme (pure black, grey cards, system blue) and never showed the owl brand.
Reference for energy and structure (not look): the Accelerating Metronome app — one hero
control, instrument-style labels, colour that carries meaning, a practice history worth revisiting.

## Structure

| Before (tabs) | After                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Home          | **Tonight** — the only home screen: night dial, three-phase timeline, volume, _Begin the night_ |
| Run (pushed)  | **Sleeping** while a run is active; **Good morning** once it ends                               |
| Library tab   | **Library** sheet (top-right books icon)                                                        |
| Log tab       | **Nights** sheet (moon icon) with a night detail sheet                                          |
| Settings tab  | **Settings** sheet (sliders icon)                                                               |

No bottom tab bar. Sheets are `presentation: 'modal'` stack screens over Tonight.

## Visual system

- Palette from the owl painting and the website (`site/assets/css/site.css`): ink, night slate,
  periwinkle, chalk. Tokens live in `src/constants/theme.ts`; light and dark share every key.
- One colour per phase, dusk → deep night → dawn: violet, cobalt, amber. Used on the dial, the
  timeline nodes, the _Begin_ gradient, phase bars in Nights and Good morning.
- Type: system serif for screen titles, letter-spaced monospace "eyebrow" labels, system sans body.
- The owl painting (`assets/images/owl.png`) as a medallion at the centre of the dial and on
  Good morning / empty states.
- No new dependencies: the dial, icons and hold-to-stop ring are plain Views; gradients use
  `experimental_backgroundImage` (native) / CSS `backgroundImage` (web) over a solid fallback.

## Behaviour changes

- **Sleeping is always dim and warm**, regardless of theme, to avoid lighting the room at night.
  The active phase arc sweeps once per 90-minute sleep cycle (scripts don't expose a total length).
- **Stop requires a ~2 s press-and-hold**; screen readers get a direct activate action.
- Tap anywhere on Sleeping to show recent activity. The web `?demo=lock` controls moved here.
- **Good morning** summarises duration, time range, per-phase bar, cues played, and asks
  _Did you have a lucid dream?_ (Yes / Not sure / No).
- **Nights** adds a Monday–Sunday strip (completed / stopped / lucid). A night belongs to the
  evening it started (starts before noon count as the previous night).
- **Settings** gains Appearance → Theme (System / Light / Dark), listed in spec §2.3 but not built
  before. Logging and Simulated context moved under a collapsed _Advanced_ section.

## New storage

- `luciddream.lucid.v1` (AsyncStorage): run id → `yes` | `unsure` | `no`. Removed with its run.
- `Settings.themePreference`, default `system`.

## Not done / open

- Swipe-to-remove in Library (explicit remove buttons remain).
- Haptics (would need `expo-haptics`, a native dependency and a new dev build).
- Custom fonts (would need font packages; system serif/mono used instead).
- Mockups: the Claude Design canvas was assembled locally, not published.
