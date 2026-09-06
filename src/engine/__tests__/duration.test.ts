import { DurationParseError, formatDuration, parseDuration } from '../duration';

describe('parseDuration', () => {
  it('parses a single unit', () => {
    expect(parseDuration('10s')).toBe(10_000);
    expect(parseDuration('5m')).toBe(300_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('250ms')).toBe(250);
  });

  it('concatenates multiple units regardless of order', () => {
    expect(parseDuration('1h30m')).toBe(90 * 60_000);
    expect(parseDuration('30m1h')).toBe(90 * 60_000);
    expect(parseDuration('1m30s')).toBe(90_000);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDuration('  10s  ')).toBe(10_000);
  });

  it('rejects an empty string', () => {
    expect(() => parseDuration('')).toThrow(DurationParseError);
    expect(() => parseDuration('   ')).toThrow(DurationParseError);
  });

  it('rejects unknown units and garbage', () => {
    expect(() => parseDuration('10x')).toThrow(DurationParseError);
    expect(() => parseDuration('soon')).toThrow(DurationParseError);
  });

  it('rejects a value with trailing garbage after valid tokens', () => {
    expect(() => parseDuration('10s!')).toThrow(DurationParseError);
  });
});

describe('formatDuration', () => {
  it('formats zero and sub-second as 0s', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-5)).toBe('0s');
  });

  it('formats whole units without smaller zero units', () => {
    expect(formatDuration(90 * 60_000)).toBe('1h30m');
    expect(formatDuration(10_000)).toBe('10s');
    expect(formatDuration(7_200_000)).toBe('2h');
  });

  it('includes ms only when there is no larger unit', () => {
    expect(formatDuration(250)).toBe('250ms');
    expect(formatDuration(60_250)).toBe('1m');
  });
});
