/**
 * Duration strings used throughout the script format: "10s", "2m", "1h30m".
 * Concatenable, in ms|s|m|h units, largest-to-smallest order not enforced —
 * "30m1h" is accepted the same as "1h30m", since there's no ambiguity to
 * resolve by requiring an order.
 */

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

const DURATION_TOKEN = /(\d+)(ms|s|m|h)/g;

const MACRO_PATTERN = /^\$([A-Za-z][A-Za-z0-9]*)$/;

/** Named period values (spec §3.2) that scripts reference with `$name` — e.g.
 * `$short` / `$medium` / `$long` from the Settings screen's Period presets. */
export type DurationPresets = Record<string, number>;

/**
 * The one definition of the period presets.
 *
 * There used to be two: these, and a different set in the app's settings
 * defaults. The app always passes its own, so a script meant one thing in a
 * fixture and another on a phone — and the v2 host validates scripts with this
 * same engine, so one script would have described two different nights
 * (architectural review AR-20). Settings now imports these rather than
 * declaring its own; changing a value here changes it everywhere.
 */
export const DEFAULT_DURATION_PRESETS = {
  short: 5_000,
  medium: 20_000,
  long: 5 * 60_000,
  // `satisfies` rather than a type annotation, so the three keys survive in
  // the type and Settings can spread this into its stricter shape.
} satisfies DurationPresets;

export class DurationParseError extends Error {}

/** Parses a duration string into milliseconds. Throws DurationParseError on
 * anything that isn't a non-empty run of `<number><unit>` tokens. A
 * `$name` token (bash-style) expands through `presets`; if omitted, the
 * project defaults are used. */
export function parseDuration(
  input: string,
  presets: DurationPresets = DEFAULT_DURATION_PRESETS,
): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new DurationParseError("Duration is empty.");
  }

  const macro = MACRO_PATTERN.exec(trimmed);
  if (macro) {
    const value = presets[macro[1]];
    if (value === undefined) {
      throw new DurationParseError(
        `Unknown period preset "$${macro[1]}" — configure presets like $short, $medium, or $long in Settings.`,
      );
    }
    return value;
  }

  let matched = "";
  let totalMs = 0;
  let sawToken = false;

  for (const match of trimmed.matchAll(DURATION_TOKEN)) {
    sawToken = true;
    matched += match[0];
    const [, amount, unit] = match;
    totalMs += Number(amount) * UNIT_MS[unit];
  }

  if (!sawToken || matched.length !== trimmed.length) {
    throw new DurationParseError(
      `Invalid duration "${input}" — expected tokens like "10s", "2m", or "1h30m".`,
    );
  }

  return totalMs;
}

/** Formats milliseconds back into a compact duration string, largest unit
 * first, for display in logs and the UI. Zero renders as "0s". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";

  const hours = Math.floor(ms / UNIT_MS.h);
  const minutes = Math.floor((ms % UNIT_MS.h) / UNIT_MS.m);
  const seconds = Math.floor((ms % UNIT_MS.m) / UNIT_MS.s);
  const millis = ms % UNIT_MS.s;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  if (millis > 0 && hours === 0 && minutes === 0) parts.push(`${millis}ms`);

  return parts.join("");
}
