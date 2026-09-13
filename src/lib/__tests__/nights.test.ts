import type { EngineEvent } from "@/engine";
import type { RunSummary } from "@/logging/run-index";

import {
  buildWeek,
  countPlays,
  nightKey,
  parseLogText,
  parseRunName,
  phaseSegments,
  scriptChain,
} from "../nights";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();

describe("nightKey", () => {
  it("assigns early-morning starts to the previous evening", () => {
    expect(nightKey(at(12, 22, 48))).toBe("2026-09-12");
    expect(nightKey(at(13, 1, 30))).toBe("2026-09-12");
    expect(nightKey(at(13, 13, 0))).toBe("2026-09-13");
  });
});

describe("parseRunName / scriptChain", () => {
  const name =
    "Pre-sleep Training: Empty · Early Sleep: MILD Cycles · Wake Up: Single Beep";

  it("splits the three phases and treats Empty as no script", () => {
    expect(parseRunName(name)).toEqual([
      { label: "Pre-sleep Training", scriptName: null },
      { label: "Early Sleep", scriptName: "MILD Cycles" },
      { label: "Wake Up", scriptName: "Single Beep" },
    ]);
  });

  it("chains the populated scripts", () => {
    expect(scriptChain(name)).toBe("MILD Cycles → Single Beep");
  });

  it("falls back to the raw name for single-script runs", () => {
    expect(scriptChain("Interval Chime")).toBe("Interval Chime");
    expect(parseRunName(null)).toEqual([]);
  });
});

describe("buildWeek", () => {
  const run = (
    id: string,
    startedAt: number,
    extra: Partial<RunSummary> = {},
  ): RunSummary => ({
    id,
    scriptName: "x",
    startedAt,
    endedAt: startedAt + 1000,
    eventCount: 1,
    reason: "completed",
    ...extra,
  });

  it("lays out Monday to Sunday around tonight with outcomes and lucid marks", () => {
    const week = buildWeek(
      [
        run("mon", at(7, 23)),
        run("fri", at(11, 23), { reason: "stopped" }),
        run("sat-a", at(12, 22), { reason: "error" }),
        run("sat-b", at(13, 0, 30)),
      ],
      { "sat-b": "yes", fri: "no" },
      at(13, 12, 30),
    );

    expect(week.map((day) => day.weekday)).toEqual([
      "Mo",
      "Tu",
      "We",
      "Th",
      "Fr",
      "Sa",
      "Su",
    ]);
    expect(week.map((day) => day.state)).toEqual([
      "completed",
      "none",
      "none",
      "none",
      "stopped",
      "completed",
      "none",
    ]);
    expect(week.map((day) => day.lucid)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(week.find((day) => day.isTonight)?.weekday).toBe("Su");
  });

  it("shows an unfinished run as running", () => {
    const week = buildWeek(
      [run("open", at(9, 22), { endedAt: undefined, reason: undefined })],
      {},
      at(10, 9),
    );
    expect(week[2]).toMatchObject({ weekday: "We", state: "running" });
  });
});

describe("log helpers", () => {
  const events: EngineEvent[] = [
    { type: "run.start", at: 0, scriptName: "x" },
    {
      type: "phase.start",
      at: 10,
      phaseIndex: 1,
      phase: "Early Sleep",
      scriptName: "MILD Cycles",
    },
    { type: "play", at: 20, signal: "chime", gain: 1, rate: 1, wait: false },
    {
      type: "phase.stop",
      at: 110,
      phaseIndex: 1,
      phase: "Early Sleep",
      scriptName: "MILD Cycles",
      reason: "completed",
    },
    {
      type: "phase.start",
      at: 120,
      phaseIndex: 2,
      phase: "Wake Up",
      scriptName: "Single Beep",
    },
    { type: "play", at: 130, signal: "chime", gain: 1, rate: 1, wait: false },
    { type: "log", at: 150, message: "cut short" },
  ];

  it("measures each phase, running an unclosed one to the last event", () => {
    expect(phaseSegments(events)).toEqual([
      { phaseIndex: 1, durationMs: 100 },
      { phaseIndex: 2, durationMs: 30 },
    ]);
  });

  it("counts played cues", () => {
    expect(countPlays(events)).toBe(2);
  });

  it("parses JSONL and skips broken lines", () => {
    const text = `${JSON.stringify(events[0])}\n\nnot json\n${JSON.stringify(events[2])}\n`;
    expect(parseLogText(text)).toEqual([events[0], events[2]]);
  });
});
