import { runScript } from "../interpreter";
import { parseScript, PARSE_LIMITS, ScriptParseError } from "../parse";
import type { AudioPort, ClockPort, ContextPort, EngineEvent } from "../ports";

/**
 * A script is data from outside the app. None of these inputs may crash, hang
 * or silently do the wrong thing — they must come back as a readable error
 * naming the failing node (spec §2.4), or, at run time, leave the app
 * responsive.
 */

const VALID = `name: Test
version: 1
body:
  - play: chime
`;

describe("parse limits", () => {
  it("accepts an ordinary script", () => {
    expect(parseScript(VALID).name).toBe("Test");
  });

  it("refuses a source larger than the cap", () => {
    const huge = `${VALID}# ${"x".repeat(PARSE_LIMITS.maxSourceLength)}`;
    expect(() => parseScript(huge)).toThrow(ScriptParseError);
    expect(() => parseScript(huge)).toThrow(/too large to read/);
  });

  it("refuses a body with too many statements", () => {
    const many = Array.from(
      { length: PARSE_LIMITS.maxBodyLength + 1 },
      () => "  - log: x",
    ).join("\n");
    expect(() => parseScript(`name: T\nversion: 1\nbody:\n${many}\n`)).toThrow(
      /Too many statements/,
    );
  });

  it("refuses nesting deeper than the cap", () => {
    // Deliberately built past the limit rather than to the stack's limit.
    let body = "  - log: deep";
    for (let i = 0; i < PARSE_LIMITS.maxDepth + 5; i += 1) {
      body = `  - repeat: 2\n    body:\n${body.replace(/^/gm, "  ")}`;
    }
    expect(() => parseScript(`name: T\nversion: 1\nbody:\n${body}\n`)).toThrow(
      ScriptParseError,
    );
  });

  it("turns a self-referencing YAML alias into a readable error", () => {
    // js-yaml happily builds a cyclic structure here. Before the depth
    // budget this recursed until the JavaScript stack gave out, surfacing as
    // a RangeError with no indication of what was wrong.
    const cyclic = `name: Cycle
version: 1
body: &loop
  - repeat: 2
    body: *loop
`;
    let thrown: unknown;
    try {
      parseScript(cyclic);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ScriptParseError);
    expect((thrown as ScriptParseError).path).toContain("body");
  });

  it("refuses infinity, which YAML writes as .inf", () => {
    const script = `name: T
version: 1
body:
  - play: { signal: chime, gain: .inf }
`;
    expect(() => parseScript(script)).toThrow(/Expected a number/);
  });

  it("refuses a version this build does not understand", () => {
    const script = `name: T
version: 999
body:
  - play: chime
`;
    expect(() => parseScript(script)).toThrow(/version 999/);
  });

  it("refuses a misspelled statement option instead of ignoring it", () => {
    // `wiatt: 5m` used to parse as a bare `log`-less statement error or be
    // dropped silently, so the script simply never waited.
    const script = `name: T
version: 1
body:
  - repeat: 2
    wiatt: 5m
    body:
      - play: chime
`;
    expect(() => parseScript(script)).toThrow(/Unknown option "wiatt"/);
  });

  it("refuses a misspelled play option", () => {
    const script = `name: T
version: 1
body:
  - play: { signal: chime, gian: 0.5 }
`;
    expect(() => parseScript(script)).toThrow(/Unknown option "gian"/);
  });

  it("refuses an unknown top-level key", () => {
    const script = `name: T
version: 1
volme: 0.5
body:
  - play: chime
`;
    expect(() => parseScript(script)).toThrow(/Unknown option "volme"/);
  });

  it("names the failing node for every rejection", () => {
    try {
      parseScript(
        `name: T\nversion: 1\nbody:\n  - play: { signal: chime, gain: .inf }\n`,
      );
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as ScriptParseError).path).toBe("$.body[0].play.gain");
    }
  });
});

describe("execution stays responsive", () => {
  function fakeDeps(events: EngineEvent[]) {
    const audio: AudioPort = {
      play: async () => ({ finished: Promise.resolve() }),
    };
    const context: ContextPort = { snapshot: async () => ({ at: 0 }) };
    const clock: ClockPort = {
      now: () => Date.now(),
      sleep: () => Promise.resolve(),
      // A real macrotask, as on a device.
      yieldToHost: () => new Promise((resolve) => setTimeout(resolve, 0)),
    };
    return {
      audio,
      clock,
      context,
      log: { log: (event: EngineEvent) => events.push(event) },
    };
  }

  it("lets timers run during a loop that never waits", async () => {
    // `repeat: infinite` over `log` alone has no real await in it. Without a
    // cooperative yield this spins on microtasks forever: no timer fires, the
    // Stop button never gets a turn, and the app is simply frozen.
    const script = parseScript(`name: Tight
version: 1
body:
  - repeat: infinite
    body:
      - log: spinning
`);
    const events: EngineEvent[] = [];
    const controller = runScript(script, fakeDeps(events));

    // This timer can only fire if the interpreter gave the host a turn.
    let timerFired = false;
    setTimeout(() => {
      timerFired = true;
    }, 0);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(timerFired).toBe(true);

    controller.stop();
    await controller.done;
    expect(events.at(-1)).toMatchObject({
      type: "run.stop",
      reason: "stopped",
    });
  }, 10_000);

  it("stops a tight loop promptly when asked", async () => {
    const script = parseScript(`name: Tight
version: 1
body:
  - repeat: infinite
    body:
      - log: spinning
`);
    const events: EngineEvent[] = [];
    const controller = runScript(script, fakeDeps(events));

    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.stop();

    await expect(controller.done).resolves.toBeUndefined();
  }, 10_000);
});
