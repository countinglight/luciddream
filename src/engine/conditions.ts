import type { Condition, ConditionField, ComparatorOp } from './ast';

/** Everything a condition might read, already flattened into one object —
 * elapsed/clock/iteration come from the engine itself, the rest from a
 * ContextPort snapshot. A field absent here (undefined) means "no reading
 * available", per spec §3.3: the condition evaluates false and the caller
 * (interpreter.ts) logs a context.unavailable event for it. */
export type ConditionContext = {
  elapsed?: number;
  clock?: string;
  iteration?: number;
  hr?: number;
  hrv?: number;
  rem?: boolean;
  sleepStage?: string;
};

export type ConditionEvalResult = {
  value: boolean;
  /** Fields referenced anywhere in the tree that had no reading available.
   * Deduplicated, in first-seen order. */
  missingFields: ConditionField[];
};

function compare(op: ComparatorOp, actual: number | string | boolean, expected: number | string | boolean): boolean {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
  }
}

/** Pure, synchronous, and total: every valid Condition produces a result for
 * every ConditionContext, never throwing. This is what makes it exhaustively
 * unit-testable without any ports. */
export function evaluateCondition(condition: Condition, ctx: ConditionContext): ConditionEvalResult {
  switch (condition.kind) {
    case 'field': {
      const actual = ctx[condition.field];
      if (actual === undefined) {
        return { value: false, missingFields: [condition.field] };
      }
      return { value: compare(condition.comparator, actual, condition.value), missingFields: [] };
    }
    case 'not': {
      const inner = evaluateCondition(condition.condition, ctx);
      return { value: !inner.value, missingFields: inner.missingFields };
    }
    case 'all': {
      const missing: ConditionField[] = [];
      let value = true;
      for (const sub of condition.conditions) {
        const result = evaluateCondition(sub, ctx);
        value = value && result.value;
        mergeMissing(missing, result.missingFields);
      }
      return { value, missingFields: missing };
    }
    case 'any': {
      const missing: ConditionField[] = [];
      let value = false;
      for (const sub of condition.conditions) {
        const result = evaluateCondition(sub, ctx);
        value = value || result.value;
        mergeMissing(missing, result.missingFields);
      }
      return { value, missingFields: missing };
    }
  }
}

function mergeMissing(into: ConditionField[], from: ConditionField[]) {
  for (const field of from) {
    if (!into.includes(field)) into.push(field);
  }
}
