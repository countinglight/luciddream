/**
 * The script AST. A script's YAML source parses directly into these types —
 * see parse.ts. There is no separate grammar: the YAML mapping shape *is*
 * the AST shape, so this module is the one place that defines what a valid
 * script can contain.
 */

/** A duration, normalized to milliseconds. */
export type DurationMs = number;

export type ComparatorOp = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';

/** Fields a condition can read. See conditions.ts for how each is sourced. */
export type ConditionField =
  | 'elapsed'
  | 'clock'
  | 'iteration'
  | 'hr'
  | 'hrv'
  | 'rem'
  | 'sleepStage';

export type FieldCondition = {
  kind: 'field';
  field: ConditionField;
  comparator: ComparatorOp;
  /** Already normalized — durations are parsed to ms, "HH:MM" kept as-is. */
  value: number | string | boolean;
};

export type AllCondition = { kind: 'all'; conditions: Condition[] };
export type AnyCondition = { kind: 'any'; conditions: Condition[] };
export type NotCondition = { kind: 'not'; condition: Condition };

export type Condition = FieldCondition | AllCondition | AnyCondition | NotCondition;

export type PlayStatement = {
  kind: 'play';
  signal: string;
  /** Multiplies the enclosing scope's gain. Defaults to 1. */
  gain?: number;
  /** Multiplies the enclosing scope's rate. Defaults to 1. */
  rate?: number;
  /** Block until playback finishes. Defaults to false (fire-and-forget). */
  wait?: boolean;
};

export type WaitStatement = {
  kind: 'wait';
  duration: DurationMs;
};

export type RepeatStatement = {
  kind: 'repeat';
  count: number | 'infinite';
  /** Evaluated before each iteration, including the first. */
  until?: Condition;
  body: Statement[];
};

export type IfStatement = {
  kind: 'if';
  condition: Condition;
  then: Statement[];
  else?: Statement[];
};

export type WithStatement = {
  kind: 'with';
  gain?: number;
  rate?: number;
  body: Statement[];
};

export type SetStatement = {
  kind: 'set';
  volume?: number;
};

export type LogStatement = {
  kind: 'log';
  message: string;
};

export type StopStatement = {
  kind: 'stop';
};

export type Statement =
  | PlayStatement
  | WaitStatement
  | RepeatStatement
  | IfStatement
  | WithStatement
  | SetStatement
  | LogStatement
  | StopStatement;

export type Script = {
  name: string;
  version: number;
  /** Base master gain for the whole script, 0..1. Defaults to 1. */
  volume: number;
  body: Statement[];
};

/** The statement kinds a body-level mapping may declare. Used by parse.ts to
 * tell statements apart, and here so the set stays defined next to the types
 * it corresponds to. */
export const STATEMENT_KINDS = [
  'play',
  'wait',
  'repeat',
  'if',
  'with',
  'set',
  'log',
  'stop',
] as const;
