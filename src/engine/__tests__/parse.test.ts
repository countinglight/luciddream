import { parseScript, ScriptParseError } from "../parse";

describe("parseScript", () => {
  it("parses a minimal script with defaults", () => {
    const script = parseScript(`
name: Minimal
body:
  - play: chime
`);
    expect(script).toEqual({
      name: "Minimal",
      version: 1,
      volume: 1,
      body: [{ kind: "play", signal: "chime" }],
    });
  });

  it("parses the shorthand and detailed play forms", () => {
    const script = parseScript(`
name: Play forms
body:
  - play: chime
  - play: { signal: bell, gain: 0.5, rate: 1.2, wait: true }
`);
    expect(script.body).toEqual([
      { kind: "play", signal: "chime" },
      { kind: "play", signal: "bell", gain: 0.5, rate: 1.2, wait: true },
    ]);
  });

  it("parses wait durations", () => {
    const script = parseScript(`
name: Wait
body:
  - wait: 1h30m
`);
    expect(script.body).toEqual([{ kind: "wait", duration: 90 * 60_000 }]);
  });

  it("expands $preset macros in wait durations", () => {
    const script = parseScript("name: Macros\nbody:\n  - wait: $medium\n", {
      durationPresets: { medium: 20 * 60_000 },
    });
    expect(script.body).toEqual([{ kind: "wait", duration: 1_200_000 }]);
  });

  it("expands $preset macros in elapsed conditions", () => {
    const script = parseScript(
      "name: Cond\nbody:\n  - repeat: infinite\n    until: { elapsed: { gte: $long } }\n    body:\n      - wait: 10s\n",
      { durationPresets: { long: 90 * 60_000 } },
    );
    expect(script.body[0]).toMatchObject({
      kind: "repeat",
      until: {
        kind: "field",
        field: "elapsed",
        comparator: "gte",
        value: 5_400_000,
      },
    });
  });

  it("rejects an unknown preset macro, naming the failing node", () => {
    expect(() => parseScript("name: Bad\nbody:\n  - wait: $nope\n")).toThrow(
      ScriptParseError,
    );
    expect(() => parseScript("name: Bad\nbody:\n  - wait: $nope\n")).toThrow(
      "$.body[0].wait",
    );
    expect(() => parseScript("name: Bad\nbody:\n  - wait: $nope\n")).toThrow(
      "$nope",
    );
  });

  it("parses a finite repeat with a nested body", () => {
    const script = parseScript(`
name: Repeat
body:
  - repeat: 3
    body:
      - play: chime
      - wait: 10s
`);
    expect(script.body).toEqual([
      {
        kind: "repeat",
        count: 3,
        until: undefined,
        body: [
          { kind: "play", signal: "chime" },
          { kind: "wait", duration: 10_000 },
        ],
      },
    ]);
  });

  it("parses an infinite repeat with an until condition", () => {
    const script = parseScript(`
name: Infinite
body:
  - repeat: infinite
    until: { elapsed: { gte: 8h } }
    body:
      - wait: 1m
`);
    const stmt = script.body[0];
    expect(stmt).toMatchObject({
      kind: "repeat",
      count: "infinite",
      until: {
        kind: "field",
        field: "elapsed",
        comparator: "gte",
        value: 8 * 3_600_000,
      },
    });
  });

  it("parses if/then/else with a combinator condition", () => {
    const script = parseScript(`
name: Conditional
body:
  - if: { all: [ { rem: true }, { hr: { lt: 60 } } ] }
    then:
      - play: chime
    else:
      - wait: 5m
`);
    expect(script.body[0]).toEqual({
      kind: "if",
      condition: {
        kind: "all",
        conditions: [
          { kind: "field", field: "rem", comparator: "eq", value: true },
          { kind: "field", field: "hr", comparator: "lt", value: 60 },
        ],
      },
      then: [{ kind: "play", signal: "chime" }],
      else: [{ kind: "wait", duration: 5 * 60_000 }],
    });
  });

  it("parses if without else", () => {
    const script = parseScript(`
name: Conditional
body:
  - if: { rem: true }
    then:
      - play: chime
`);
    expect((script.body[0] as { else?: unknown }).else).toBeUndefined();
  });

  it("parses with-scopes for gain and rate", () => {
    const script = parseScript(`
name: With
body:
  - with: { gain: 0.5, rate: 1.2 }
    body:
      - play: chime
`);
    expect(script.body[0]).toEqual({
      kind: "with",
      gain: 0.5,
      rate: 1.2,
      body: [{ kind: "play", signal: "chime" }],
    });
  });

  it("parses set, log and stop", () => {
    const script = parseScript(`
name: Statements
body:
  - set: { volume: 0.3 }
  - log: "hello"
  - stop:
`);
    expect(script.body).toEqual([
      { kind: "set", volume: 0.3 },
      { kind: "log", message: "hello" },
      { kind: "stop" },
    ]);
  });

  it("rejects invalid YAML", () => {
    expect(() => parseScript("body: [")).toThrow(ScriptParseError);
  });

  it("rejects a script with no name", () => {
    expect(() => parseScript("body:\n  - play: chime\n")).toThrow(
      ScriptParseError,
    );
  });

  it("rejects a script with an empty body", () => {
    expect(() => parseScript("name: Empty\nbody: []\n")).toThrow(
      /at least one statement/,
    );
  });

  it("rejects a statement with no recognized kind", () => {
    expect(() => parseScript("name: Bad\nbody:\n  - foo: bar\n")).toThrow(
      ScriptParseError,
    );
  });

  it("rejects a statement with more than one kind", () => {
    expect(() =>
      parseScript("name: Bad\nbody:\n  - play: chime\n    wait: 1s\n"),
    ).toThrow(/exactly one/);
  });

  it("rejects an out-of-range volume", () => {
    expect(() =>
      parseScript("name: Bad\nvolume: 1.5\nbody:\n  - play: chime\n"),
    ).toThrow(ScriptParseError);
  });

  it("rejects an unknown condition field", () => {
    expect(() =>
      parseScript(
        "name: Bad\nbody:\n  - if: { bogus: true }\n    then:\n      - play: chime\n",
      ),
    ).toThrow(/Unknown condition field/);
  });

  it("rejects an unknown comparator", () => {
    expect(() =>
      parseScript(
        "name: Bad\nbody:\n  - if: { hr: { between: 1 } }\n    then:\n      - play: chime\n",
      ),
    ).toThrow(/Unknown comparator/);
  });

  it("rejects a malformed clock value", () => {
    expect(() =>
      parseScript(
        'name: Bad\nbody:\n  - if: { clock: "25:99" }\n    then:\n      - play: chime\n',
      ),
    ).toThrow(/HH:MM/);
  });

  it("reports a path that names the failing node", () => {
    try {
      parseScript(`
name: Bad
body:
  - repeat: 2
    body:
      - play: chime
      - wait: not-a-duration
`);
      throw new Error("expected parseScript to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ScriptParseError);
      expect((err as ScriptParseError).path).toBe(
        "$.body[0].repeat.body[1].wait",
      );
    }
  });
});
