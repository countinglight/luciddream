import {
  formatAgo,
  formatClock,
  formatHuman,
  greetingFor,
} from "../format-time";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("formatClock", () => {
  it("shows minutes and seconds under an hour", () => {
    expect(formatClock(4 * MINUTE + 5 * SECOND)).toEqual({
      value: "4:05",
      unit: "min : sec",
    });
  });

  it("switches to hours and minutes from one hour", () => {
    expect(formatClock(2 * HOUR + 14 * MINUTE + 59 * SECOND)).toEqual({
      value: "2:14",
      unit: "hr : min",
    });
  });

  it("never goes negative", () => {
    expect(formatClock(-500).value).toBe("0:00");
  });
});

describe("formatHuman", () => {
  it.each([
    [40 * SECOND, "40s"],
    [12 * MINUTE, "12m"],
    [7 * HOUR + 42 * MINUTE, "7h 42m"],
    [7 * HOUR + 5 * MINUTE, "7h 05m"],
    [3 * HOUR, "3h"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatHuman(ms)).toBe(expected);
  });
});

describe("formatAgo", () => {
  it("rounds recent activity to 'just now'", () => {
    expect(formatAgo(20 * SECOND)).toBe("just now");
  });

  it("uses minutes, then hours", () => {
    expect(formatAgo(14 * MINUTE)).toBe("14 min ago");
    expect(formatAgo(HOUR + 3 * MINUTE)).toBe("1h 03m ago");
  });
});

describe("greetingFor", () => {
  it("follows the time of day", () => {
    expect(greetingFor(2)).toBe("Hello, night owl");
    expect(greetingFor(7)).toBe("Good morning");
    expect(greetingFor(14)).toBe("Good afternoon");
    expect(greetingFor(21)).toBe("Good evening");
  });
});
