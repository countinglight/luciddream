import { readTelemetryConfig } from "../config";
import { RunTracker } from "../run-tracker";
import { truncate } from "../types";

describe("readTelemetryConfig", () => {
  it("is unavailable without an endpoint, on web, or over plain HTTP", () => {
    expect(readTelemetryConfig({}, "ios")).toBeNull();
    expect(readTelemetryConfig({ url: "  " }, "android")).toBeNull();
    expect(readTelemetryConfig({ url: "https://t.example" }, "web")).toBeNull();
    expect(readTelemetryConfig({ url: "http://t.example" }, "ios")).toBeNull();
  });

  it("normalises the URL and an empty token", () => {
    expect(
      readTelemetryConfig({ url: " https://t.example/ ", token: " " }, "ios"),
    ).toEqual({
      url: "https://t.example",
      token: null,
    });
    expect(
      readTelemetryConfig(
        { url: "https://t.example", token: "abc" },
        "android",
      ),
    ).toEqual({
      url: "https://t.example",
      token: "abc",
    });
  });
});

describe("RunTracker", () => {
  it("never reports a last-seen time before the latest event", () => {
    const tracker = new RunTracker("run", 100, []);
    tracker.observe({ type: "log", at: 500, message: "x" });
    expect(tracker.snapshot(200).lastSeenAt).toBe(500);
    expect(tracker.ended(50, "stopped").durationMs).toBe(0);
  });
});

describe("truncate", () => {
  it("shortens long text with an ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });
});
