import { load as parseYaml } from "js-yaml";

import {
  STATEMENT_KINDS,
  type ComparatorOp,
  type Condition,
  type ConditionField,
  type Script,
  type Statement,
} from "./ast";
import {
  DurationParseError,
  parseDuration,
  type DurationPresets,
} from "./duration";

/** Options accepted by `parseScript`. `durationPresets` supplies the values
 * behind `$name` period macros (spec §3.2) — Settings' Period presets, wired
 * in by the session layer. */
export type ParseOptions = {
  durationPresets?: DurationPresets;
};

/** Thrown for anything wrong with a script — bad YAML, an unknown statement
 * key, a value out of range. `path` names the failing node (e.g.
 * `body[2].repeat.body[0].play`) so the error is readable without a
 * debugger, per spec §2.4: "a malformed script produces a readable error
 * naming the failing node — never a crash." */
export class ScriptParseError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${message} (at ${path})`);
    this.name = "ScriptParseError";
  }
}

const CONDITION_FIELDS: ConditionField[] = [
  "elapsed",
  "clock",
  "iteration",
  "hr",
  "hrv",
  "rem",
  "sleepStage",
];
const COMPARATOR_OPS: ComparatorOp[] = ["eq", "ne", "lt", "lte", "gt", "gte"];
const COMBINATOR_KEYS = ["all", "any", "not"] as const;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function fail(path: string, message: string): never {
  throw new ScriptParseError(message, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(path, "Expected a mapping.");
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "Expected a list.");
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "Expected a string.");
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || Number.isNaN(value))
    fail(path, "Expected a number.");
  return value;
}

function parseDurationField(
  value: unknown,
  path: string,
  options: ParseOptions,
): number {
  const raw = requireString(value, path);
  try {
    return parseDuration(raw, options.durationPresets);
  } catch (err) {
    if (err instanceof DurationParseError) fail(path, err.message);
    throw err;
  }
}

/** Parses a script from its YAML source text. */
export function parseScript(
  source: string,
  options: ParseOptions = {},
): Script {
  let doc: unknown;
  try {
    doc = parseYaml(source);
  } catch (err) {
    fail(
      "$",
      `Could not parse YAML: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const root = requireObject(doc, "$");

  const name = requireString(root.name, "$.name");
  const version =
    root.version === undefined ? 1 : requireNumber(root.version, "$.version");
  const volume =
    root.volume === undefined ? 1 : requireNumber(root.volume, "$.volume");
  if (volume < 0 || volume > 1)
    fail("$.volume", "volume must be between 0 and 1.");

  const bodyRaw = requireArray(root.body, "$.body");
  if (bodyRaw.length === 0)
    fail("$.body", "A script needs at least one statement.");
  const body = bodyRaw.map((item, i) =>
    parseStatement(item, `$.body[${i}]`, options),
  );

  return { name, version, volume, body };
}

function parseStatement(
  node: unknown,
  path: string,
  options: ParseOptions,
): Statement {
  const obj = requireObject(node, path);
  const presentKinds = STATEMENT_KINDS.filter((kind) => kind in obj);

  if (presentKinds.length === 0) {
    fail(path, `Statement must have one of: ${STATEMENT_KINDS.join(", ")}.`);
  }
  if (presentKinds.length > 1) {
    fail(
      path,
      `Statement has more than one kind (${presentKinds.join(", ")}) — expected exactly one.`,
    );
  }

  const kind = presentKinds[0];
  switch (kind) {
    case "play":
      return parsePlay(obj, path);
    case "wait":
      return {
        kind: "wait",
        duration: parseDurationField(obj.wait, `${path}.wait`, options),
      };
    case "repeat":
      return parseRepeat(obj, path, options);
    case "if":
      return parseIf(obj, path, options);
    case "with":
      return parseWith(obj, path, options);
    case "set":
      return parseSet(obj, path);
    case "log":
      return { kind: "log", message: requireString(obj.log, `${path}.log`) };
    case "stop":
      return { kind: "stop" };
  }
}

function parseGain(value: unknown, path: string): number {
  const gain = requireNumber(value, path);
  if (gain < 0) fail(path, "gain must not be negative.");
  return gain;
}

function parseRate(value: unknown, path: string): number {
  const rate = requireNumber(value, path);
  if (rate <= 0) fail(path, "rate must be greater than 0.");
  return rate;
}

function parsePlay(obj: Record<string, unknown>, path: string): Statement {
  const raw = obj.play;
  if (typeof raw === "string") {
    return { kind: "play", signal: raw };
  }
  const detail = requireObject(raw, `${path}.play`);
  const signal = requireString(detail.signal, `${path}.play.signal`);
  const gain =
    detail.gain === undefined
      ? undefined
      : parseGain(detail.gain, `${path}.play.gain`);
  const rate =
    detail.rate === undefined
      ? undefined
      : parseRate(detail.rate, `${path}.play.rate`);
  if (detail.wait !== undefined && typeof detail.wait !== "boolean") {
    fail(`${path}.play.wait`, "Expected a boolean.");
  }
  return {
    kind: "play",
    signal,
    gain,
    rate,
    wait: detail.wait as boolean | undefined,
  };
}

/** `bodyPath` is the fully qualified path to the `body:` field itself (e.g.
 * "$.body[0].repeat.body"), so callers control where their statement kind
 * appears in the path — keeping error paths readable, like
 * "$.body[0].repeat.body[1].wait" rather than an ambiguous flat list. */
function parseBody(
  obj: Record<string, unknown>,
  bodyPath: string,
  options: ParseOptions,
): Statement[] {
  const raw = requireArray(obj.body, bodyPath);
  if (raw.length === 0)
    fail(bodyPath, "body must have at least one statement.");
  return raw.map((item, i) =>
    parseStatement(item, `${bodyPath}[${i}]`, options),
  );
}

function parseRepeat(
  obj: Record<string, unknown>,
  path: string,
  options: ParseOptions,
): Statement {
  const raw = obj.repeat;
  let count: number | "infinite";
  if (raw === "infinite") {
    count = "infinite";
  } else {
    const n = requireNumber(raw, `${path}.repeat`);
    if (!Number.isInteger(n) || n < 1)
      fail(
        `${path}.repeat`,
        'repeat count must be a positive integer or "infinite".',
      );
    count = n;
  }
  const until =
    obj.until === undefined
      ? undefined
      : parseCondition(obj.until, `${path}.repeat.until`, options);
  const body = parseBody(obj, `${path}.repeat.body`, options);
  return { kind: "repeat", count, until, body };
}

function parseIf(
  obj: Record<string, unknown>,
  path: string,
  options: ParseOptions,
): Statement {
  const condition = parseCondition(obj.if, `${path}.if`, options);
  const thenRaw = requireArray(obj.then, `${path}.then`);
  if (thenRaw.length === 0)
    fail(`${path}.then`, "then must have at least one statement.");
  const thenBody = thenRaw.map((item, i) =>
    parseStatement(item, `${path}.then[${i}]`, options),
  );
  let elseBody: Statement[] | undefined;
  if (obj.else !== undefined) {
    const elseRaw = requireArray(obj.else, `${path}.else`);
    if (elseRaw.length === 0)
      fail(`${path}.else`, "else must have at least one statement.");
    elseBody = elseRaw.map((item, i) =>
      parseStatement(item, `${path}.else[${i}]`, options),
    );
  }
  return { kind: "if", condition, then: thenBody, else: elseBody };
}

function parseWith(
  obj: Record<string, unknown>,
  path: string,
  options: ParseOptions,
): Statement {
  const detail = requireObject(obj.with, `${path}.with`);
  const gain =
    detail.gain === undefined
      ? undefined
      : parseGain(detail.gain, `${path}.with.gain`);
  const rate =
    detail.rate === undefined
      ? undefined
      : parseRate(detail.rate, `${path}.with.rate`);
  const body = parseBody(obj, `${path}.with.body`, options);
  return { kind: "with", gain, rate, body };
}

function parseSet(obj: Record<string, unknown>, path: string): Statement {
  const detail = requireObject(obj.set, `${path}.set`);
  if (detail.volume === undefined)
    fail(`${path}.set`, "set must specify volume.");
  const volume = requireNumber(detail.volume, `${path}.set.volume`);
  if (volume < 0 || volume > 1)
    fail(`${path}.set.volume`, "volume must be between 0 and 1.");
  return { kind: "set", volume };
}

function parseCondition(
  node: unknown,
  path: string,
  options: ParseOptions,
): Condition {
  const obj = requireObject(node, path);
  const keys = Object.keys(obj);
  if (keys.length !== 1) {
    fail(
      path,
      `Condition must have exactly one key — found: ${keys.join(", ") || "(none)"}.`,
    );
  }
  const key = keys[0];

  if ((COMBINATOR_KEYS as readonly string[]).includes(key)) {
    if (key === "not") {
      return {
        kind: "not",
        condition: parseCondition(obj.not, `${path}.not`, options),
      };
    }
    const list = requireArray(obj[key], `${path}.${key}`);
    if (list.length === 0)
      fail(`${path}.${key}`, `${key} must list at least one condition.`);
    const conditions = list.map((item, i) =>
      parseCondition(item, `${path}.${key}[${i}]`, options),
    );
    return key === "all"
      ? { kind: "all", conditions }
      : { kind: "any", conditions };
  }

  if (!(CONDITION_FIELDS as string[]).includes(key)) {
    fail(
      path,
      `Unknown condition field "${key}" — expected one of: ${CONDITION_FIELDS.join(", ")}, all, any, not.`,
    );
  }
  const field = key as ConditionField;
  return parseFieldCondition(field, obj[key], `${path}.${key}`, options);
}

function parseFieldCondition(
  field: ConditionField,
  raw: unknown,
  path: string,
  options: ParseOptions,
): Condition {
  // Shorthand: `rem: true` means `rem: { eq: true }`.
  if (!isPlainObject(raw)) {
    return {
      kind: "field",
      field,
      comparator: "eq",
      value: normalizeFieldValue(field, raw, path, options),
    };
  }
  const keys = Object.keys(raw);
  if (keys.length !== 1) {
    fail(
      path,
      `Expected exactly one comparator — found: ${keys.join(", ") || "(none)"}.`,
    );
  }
  const opKey = keys[0];
  if (!(COMPARATOR_OPS as string[]).includes(opKey)) {
    fail(
      path,
      `Unknown comparator "${opKey}" — expected one of: ${COMPARATOR_OPS.join(", ")}.`,
    );
  }
  const comparator = opKey as ComparatorOp;
  const value = normalizeFieldValue(
    field,
    raw[opKey],
    `${path}.${opKey}`,
    options,
  );
  return { kind: "field", field, comparator, value };
}

/** `elapsed` accepts duration strings ("8h") and `$preset` macros, normalized
 * to ms so conditions.ts can compare plain numbers; `clock` must be "HH:MM". */
function normalizeFieldValue(
  field: ConditionField,
  raw: unknown,
  path: string,
  options: ParseOptions,
): number | string | boolean {
  if (field === "elapsed") {
    return typeof raw === "number"
      ? raw
      : parseDurationField(raw, path, options);
  }
  if (field === "clock") {
    const clock = requireString(raw, path);
    if (!CLOCK_PATTERN.test(clock))
      fail(path, 'clock must be in "HH:MM" 24-hour format.');
    return clock;
  }
  if (
    typeof raw !== "number" &&
    typeof raw !== "string" &&
    typeof raw !== "boolean"
  ) {
    fail(path, "Expected a number, string, or boolean.");
  }
  return raw;
}
