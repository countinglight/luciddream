/**
 * Text of the scripts bundled in the app (spec §3.5), inlined as string
 * constants rather than loaded from assets/scripts/*.yaml at runtime.
 *
 * Why duplicate instead of `require()`-ing the .yaml files: Metro only
 * knows how to bundle known asset types (images, audio, fonts, …) as opaque
 * asset references, not arbitrary text content, and there's no filesystem
 * to read from on a real device anyway — unlike the engine's fixture tests
 * (src/engine/__tests__/examples.test.ts), which run under Node and can
 * read the files directly. A dedicated test in this module's __tests__
 * directory asserts these constants match the actual files byte-for-byte,
 * so an edit to one without the other fails CI immediately rather than
 * drifting silently.
 *
 * Keyed by the same id used in each script's Library entry — see
 * BUNDLED_SCRIPTS in library-registry.ts.
 */
export const BUNDLED_SCRIPT_TEXT: Record<string, string> = {
  "01-single-beep": `# The simplest possible script: one signal, once, then the run ends on its
# own. Good first thing to try, and a minimal fixture for the engine's
# happy path (parse -> play -> natural completion).
name: Single Beep
version: 1
volume: 0.5

body:
  - log: "single beep test"
  - play: chime
`,

  "02-interval-chime": `# A finite loop with a wait between iterations — the "play something every
# N minutes" shape most reality-check-style experiments start from.
# Demonstrates concatenated duration units ("1m30s").
name: Interval Chime
version: 1
volume: 0.6

body:
  - repeat: 3
    body:
      - play: chime
      - wait: 1m30s
`,

  "03-mild-cycles": `# MILD-style cadence: let the first sleep cycle pass, then run several
# quieter (with: gain) two-signal cycles spaced well apart. This is the
# shape most nights are expected to actually use.
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
`,

  "04-rem-conditional": `# Branches on simulated wearable context: an "all" combinator (REM and a low
# HR), an "else" that checks a second field (HRV) many providers won't
# supply, and a fallback wait — showing how a script degrades quietly when a
# reading isn't available rather than stalling. Runs until 8 hours elapse.
name: REM Conditional
version: 1
volume: 0.5

body:
  - repeat: infinite
    until: { elapsed: { gte: 8h } }
    body:
      - if: { all: [{ rem: true }, { hr: { lt: 60 } }] }
        then:
          - play: { signal: chime, gain: 0.8, wait: true }
          - wait: 3s
          - play: chime
        else:
          - if: { hrv: { gt: 50 } }
            then:
              - play: bell
              - wait: 5m
            else:
              - wait: 5m
`,

  "05-effects-demo": `# Demonstrates the effect vocabulary v1 actually has: \`set\` to change the
# script's running volume, and nested \`with\` scopes for gain/rate, each
# further overridable by a single play's own gain/rate.
name: Effects Demo
version: 1
volume: 1

body:
  - set: { volume: 0.5 }
  - play: chime
  - with: { gain: 0.5, rate: 1.2 }
    body:
      - play: bell
      - with: { gain: 0.5 }
        body:
          - play: { signal: alert, gain: 0.4, rate: 0.9 }
  - play: chime
`,
};
