import type { ComparatorOp, Condition } from '../ast';
import { evaluateCondition } from '../conditions';

describe('evaluateCondition', () => {
  it('evaluates a field condition with an explicit comparator', () => {
    const cond: Condition = { kind: 'field', field: 'hr', comparator: 'lt', value: 60 };
    expect(evaluateCondition(cond, { hr: 55 })).toEqual({ value: true, missingFields: [] });
    expect(evaluateCondition(cond, { hr: 65 })).toEqual({ value: false, missingFields: [] });
  });

  it('supports all six comparators', () => {
    const make = (comparator: ComparatorOp): Condition => ({ kind: 'field', field: 'hr', comparator, value: 60 });
    expect(evaluateCondition(make('eq'), { hr: 60 }).value).toBe(true);
    expect(evaluateCondition(make('ne'), { hr: 60 }).value).toBe(false);
    expect(evaluateCondition(make('lt'), { hr: 59 }).value).toBe(true);
    expect(evaluateCondition(make('lte'), { hr: 60 }).value).toBe(true);
    expect(evaluateCondition(make('gt'), { hr: 61 }).value).toBe(true);
    expect(evaluateCondition(make('gte'), { hr: 60 }).value).toBe(true);
  });

  it('treats a missing field as false and reports it as missing', () => {
    const cond: Condition = { kind: 'field', field: 'hrv', comparator: 'gt', value: 50 };
    expect(evaluateCondition(cond, {})).toEqual({ value: false, missingFields: ['hrv'] });
  });

  it('combines with all()', () => {
    const cond: Condition = {
      kind: 'all',
      conditions: [
        { kind: 'field', field: 'rem', comparator: 'eq', value: true },
        { kind: 'field', field: 'hr', comparator: 'lt', value: 60 },
      ],
    };
    expect(evaluateCondition(cond, { rem: true, hr: 55 }).value).toBe(true);
    expect(evaluateCondition(cond, { rem: true, hr: 65 }).value).toBe(false);
    expect(evaluateCondition(cond, { rem: false, hr: 55 }).value).toBe(false);
  });

  it('combines with any()', () => {
    const cond: Condition = {
      kind: 'any',
      conditions: [
        { kind: 'field', field: 'rem', comparator: 'eq', value: true },
        { kind: 'field', field: 'hr', comparator: 'lt', value: 60 },
      ],
    };
    expect(evaluateCondition(cond, { rem: false, hr: 65 }).value).toBe(false);
    expect(evaluateCondition(cond, { rem: true, hr: 65 }).value).toBe(true);
  });

  it('negates with not()', () => {
    const cond: Condition = {
      kind: 'not',
      condition: { kind: 'field', field: 'rem', comparator: 'eq', value: true },
    };
    expect(evaluateCondition(cond, { rem: true }).value).toBe(false);
    expect(evaluateCondition(cond, { rem: false }).value).toBe(true);
  });

  it('collects missing fields from every branch of a combinator, deduplicated', () => {
    const cond: Condition = {
      kind: 'any',
      conditions: [
        { kind: 'field', field: 'hrv', comparator: 'gt', value: 50 },
        { kind: 'field', field: 'hrv', comparator: 'lt', value: 100 },
        { kind: 'field', field: 'hr', comparator: 'lt', value: 60 },
      ],
    };
    expect(evaluateCondition(cond, { hr: 55 })).toEqual({ value: true, missingFields: ['hrv'] });
  });

  it('compares clock strings and elapsed durations as already-normalized values', () => {
    const clock: Condition = { kind: 'field', field: 'clock', comparator: 'gte', value: '06:00' };
    expect(evaluateCondition(clock, { clock: '06:30' }).value).toBe(true);
    expect(evaluateCondition(clock, { clock: '05:59' }).value).toBe(false);

    const elapsed: Condition = { kind: 'field', field: 'elapsed', comparator: 'gte', value: 8 * 3_600_000 };
    expect(evaluateCondition(elapsed, { elapsed: 8 * 3_600_000 }).value).toBe(true);
    expect(evaluateCondition(elapsed, { elapsed: 1000 }).value).toBe(false);
  });

  it('reads the innermost loop iteration', () => {
    const cond: Condition = { kind: 'field', field: 'iteration', comparator: 'eq', value: 2 };
    expect(evaluateCondition(cond, { iteration: 2 }).value).toBe(true);
    expect(evaluateCondition(cond, {}).missingFields).toEqual(['iteration']);
  });
});
