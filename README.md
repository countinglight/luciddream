# LucidDream

**Scripted sound cues through the night, for people experimenting with lucid dreaming.**

LucidDream plays audio cues on a schedule you write, all night, with the phone's screen off, and in
the morning shows you what actually happened. It runs on Android, iOS and the web, keeps everything on
your device, and has no account.

This is the v1 beta, for testers. See the [release notes](doc/release/luciddream-v1-release-notes.md)
for what to expect.

## Contents

1. [What it is for](#what-it-is-for)
2. [A night with LucidDream](#a-night-with-luciddream)
3. [Features](#features)
4. [Scripts](#scripts)
5. [Library extensions](#library-extensions)
6. [Getting the app](#getting-the-app)
7. [Privacy](#privacy)
8. [Limitations](#limitations)
9. [For developers](#for-developers)
10. [Documentation](#documentation)

## What it is for

Several lucid-dreaming techniques connect what you practise before sleep with what happens during it.
In targeted lucidity reactivation, a sound is associated with a lucid mindset while awake and played
again during sleep; in MILD, an intention rehearsed at bedtime is meant to be remembered in a dream.
Research on these methods is active and still unsettled: the timing, loudness and choice of cue all
matter, and more cueing is not automatically better, since a cue can also wake you.

LucidDream is a tool for running those experiments on yourself, carefully:

- **You decide the protocol.** A night is a small script: what to play, when, how often, how loud.
  Nothing is hidden inside the app.
- **It runs unattended.** Once started, the night plays out with the screen off; you do not touch
  the phone.
- **It keeps an honest record.** Every cue played, every volume change and how the night ended is
  logged, so the next morning you can see what really happened, including a night the phone cut short.
- **It stays out of the way.** A half-asleep user can quiet it with their voice, and stopping it is
  deliberate, never accidental.

It is not a dream journal, a sleep tracker, or medical advice. It does not analyse dreams, and it does
not send your data anywhere unless you turn on diagnostics.

## A night with LucidDream

1. **Tonight.** The home screen shows the night as three phases, dusk to dawn:
   - **Pre-sleep Training** — while you are still awake, for example to learn the cue.
   - **Early Sleep** — the first part of the night.
   - **Wake Up** — the later part of the night and waking.

   Each phase runs a script from your Library, or is left empty. Training is optional; at least one of
   Early Sleep and Wake Up needs a script. Choose a volume, use **Test** to hear a phase's first cue
   at that volume, and tap **Begin the night**. Your choices are remembered for next time.

2. **Before anything plays**, LucidDream checks every script and makes sure every sound is available
   on the phone, so a problem appears now, while you are awake, not at 3 am.

3. **Sleeping.** The screen goes dark and stays dark. The phases run in order, one continuous night.
   Tap the screen to see recent activity. To stop, **press and hold** the stop control for about two
   seconds, so a hand brushing the phone cannot end the night by accident. If voice interrupt is on,
   a sustained sound near the phone lowers and pauses the cues for a moment, then the night carries on.

4. **Good morning.** When the night ends, or when you stop it, you see how long it ran, when, each
   phase, and how many cues played, and you are asked **Did you have a lucid dream?** (Yes, Not sure,
   No).

5. **Nights.** Every night is kept: a week-at-a-glance strip, and for each night its full timeline,
   its lucid answer, a way to share the log file, and delete. A night the phone stopped (battery,
   the system, a crash) is marked **Interrupted**, with the last time the app was known to be running.

## Features

| Area                | What you can do                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tonight**         | Plan the three phases, set volume, test cues, begin the night.                                                                                                                                                                                               |
| **Library**         | Sounds (signals) and scripts: bundled examples, added from a web address, or from a file on the phone. Save web items offline. Import a whole collection at once as a [library extension](#library-extensions). View a script's source.                      |
| **Nights**          | History with a weekly view, per-night timeline filtered by category, lucid answer, share log, delete one or all.                                                                                                                                             |
| **Settings**        | Theme (system, light, dark); default volume; which log categories to show; audio focus; period presets `$short`, `$medium`, `$long`; voice interrupt; simulated context for testing scripts with conditions; opt-in diagnostics in builds that support them. |
| **Voice interrupt** | Off by default. When on, the microphone's loudness level is watched during the night; nothing is recognised, recorded or sent.                                                                                                                               |

**Bundled examples.** Scripts: _Single Beep_, _Interval Chime_, _MILD Cycles_, _REM Conditional_,
_Effects Demo_. Sounds: _chime_, _bell_, _alert_. They are always available offline and are a good
starting point for your own scripts.

## Scripts

A script is a small YAML text file. This is the bundled _MILD Cycles_: it lets the first sleep cycle
pass, then plays six quieter chime-and-bell pairs twenty minutes apart.

```yaml
name: MILD Cycles
version: 1
volume: 0.4

body:
  - log: "run started"
  - wait: 90m
  - with: { gain: 0.6 }
    body:
      - repeat: 6
        body:
          - play: chime
          - wait: 10s
          - play: bell
          - wait: 20m
```

| Statement     | Does                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `play`        | Plays a sound from the Library by name, optionally with its own gain or rate, optionally waiting for it to finish |
| `wait`        | Waits a duration: `10s`, `20m`, `1h30m`, or a preset such as `$short`                                             |
| `repeat`      | Repeats a body a number of times, or `infinite`, optionally `until` a condition                                   |
| `if` / `else` | Branches on a condition: elapsed time, clock, loop iteration, or context readings                                 |
| `with`        | Applies a gain or rate to everything inside it                                                                    |
| `set`         | Changes the script's volume                                                                                       |
| `log`         | Writes a message into the night's log                                                                             |
| `stop`        | Ends the night                                                                                                    |

A script is checked when you add it. If something is wrong, you see the script's name and exactly
which part is wrong; a misspelled option is reported, not ignored. The full format, including
conditions and their limitations, is in the [v1 specification §3](doc/plans/luciddream-v1-spec.md).

## Library extensions

A library extension is a public JSON manifest that adds a set of sounds and scripts in one import. In
**Library > Library Extensions**, choose **Import extension** and enter its address, for example the
published collection:

```text
https://luciddream.countinglight.com/content/manifest.json
```

A manifest lists named sound and script addresses. `baseUrl` is optional; relative addresses are
resolved against it:

```json
{
  "version": 1,
  "baseUrl": "https://example.com/luciddream/",
  "signals": [{ "name": "soft chime", "url": "signals/soft-chime.wav" }],
  "scripts": [{ "name": "MILD practice", "url": "scripts/mild.yaml" }]
}
```

Every address must start with `https://`. Every script in the manifest is checked before anything is
imported; if one is invalid, nothing is imported and the problem scripts are named. Importing the same
manifest again updates its items rather than duplicating them. In the web app, the hosting server must
also allow cross-origin requests.

## Getting the app

| Platform    | How                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Android** | Download the APK from the [latest GitHub release](https://github.com/countinglight/luciddream/releases) and allow installing from that source. |
| **iPhone**  | Through TestFlight: install TestFlight from the App Store, open the invitation link on the iPhone, tap **Install**.                            |
| **Web**     | [luciddreamapp.countinglight.com](https://luciddreamapp.countinglight.com), for trying the app.                                                |

Step-by-step instructions are on the [install page](https://luciddream.countinglight.com/install/).

For real nights use a phone. Browsers slow down or suspend background tabs, so a web night can stop
without warning.

On some Android phones, set LucidDream's battery setting to **Unrestricted** in the phone's app
settings, or the phone may stop it during the night.

## Privacy

- Everything stays on your device: settings, library, and every night's log. There is no account and
  no sync.
- A log leaves the phone only when you share it.
- Voice interrupt measures loudness only. The recorder's temporary file is deleted when the night
  ends, including after an interrupted night.
- **Diagnostics are opt-in** and off by default. When turned on, a short summary of each night (start,
  end, how it ended, device model and app version, cue and error counts, script names, and a random
  id for this installation) is sent. Never audio, logs, sounds, script contents, or device or
  advertising identifiers. Turning it off deletes anything not yet sent.
  Details: [doc/plans/luciddream-telemetry.md](doc/plans/luciddream-telemetry.md).
- Deleting a night or a library item removes its files from the device.

The website's [privacy page](https://luciddream.countinglight.com/privacy/) has the full statement.

## Limitations

The [release notes](doc/release/luciddream-v1-release-notes.md) list the known limitations of this
version. The most important:

- **Period presets are short** in v1 (`$short` 5 s, `$medium` 20 s, `$long` 5 min) so scripts can be
  tried quickly. Change them in Settings for real nights.
- **On Android, other audio pauses when a night starts**, because keeping playback alive with the
  screen off requires exclusive audio focus. Alarms and calls later in the night still take priority.
- **Conditions on context readings** (`rem`, `hr`, `hrv`, `sleepStage`) have no real source in v1;
  they can be exercised with the simulated context in Settings.
- **`clock` conditions do not understand midnight**: `clock: { gte: "06:00" }` is already true at
  23:00. Use `elapsed` for overnight limits.

## For developers

Requirements: Node.js 22 and npm 10.

```bash
npm ci
npm start
npm run check
```

`npm start` runs the Expo development server; `npm run check` is the full quality gate. Everything
else — running on each platform, emulators, installing on a phone, releases, deployment and
operations — is in [BUILD.md](BUILD.md).

## Documentation

| Document                                                                           | For                                                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [BUILD.md](BUILD.md)                                                               | Development setup, building, installing, releasing and operating      |
| [Release notes](doc/release/luciddream-v1-release-notes.md)                        | What changed and known limitations, for testers                       |
| [v1 specification](doc/plans/luciddream-v1-spec.md)                                | Functional and engineering specification, including the script format |
| [Diagnostics](doc/plans/luciddream-telemetry.md)                                   | What diagnostics collect and how the service is run                   |
| [Website plan](doc/plans/luciddream-website-plan.md)                               | The website and published content                                     |
| [v2 plan](doc/plans/luciddream-v2-plan.md)                                         | Where the project goes next                                           |
| [Research and product vision](doc/plans/luciddream-research-and-product-vision.md) | The research behind the product                                       |
| [Field evidence](doc/evidence/README.md)                                           | How device and tester observations are recorded                       |
| [AGENTS.md](AGENTS.md)                                                             | Working rules for contributors and coding agents                      |

## License

[MIT](LICENSE)
