import { redactMessage } from "../redact";
import { MAX_MESSAGE } from "../types";

describe("redactMessage", () => {
  it("keeps an ordinary message intact", () => {
    expect(redactMessage("Playback failed to start")).toBe(
      "Playback failed to start",
    );
  });

  it("removes a file URI", () => {
    expect(
      redactMessage("Could not read file:///var/mobile/Containers/a.wav"),
    ).toBe("Could not read <uri>");
  });

  it("removes an https URL, including anything in its query string", () => {
    // A failed import embeds the URL the user typed, which can carry a token.
    expect(
      redactMessage(
        "Failed to download https://example.test/a.mp3?token=abc123",
      ),
    ).toBe("Failed to download <uri>");
  });

  it("removes a content:// URI from an Android document picker", () => {
    expect(
      redactMessage("content://com.android.providers/doc/42 missing"),
    ).toBe("<uri> missing");
  });

  it("removes a bare unix path", () => {
    expect(
      redactMessage("ENOENT: no such file, open /var/mobile/Documents/x.yaml"),
    ).toBe("ENOENT: no such file, open <path>");
  });

  it("removes a Windows path", () => {
    expect(redactMessage("Cannot open C:\\Users\\vlads\\signals\\a.wav")).toBe(
      "Cannot open <path>",
    );
  });

  it("removes an email address", () => {
    expect(redactMessage("Rejected for someone@example.test")).toBe(
      "Rejected for <email>",
    );
  });

  it("removes several at once", () => {
    const redacted = redactMessage(
      "Failed https://a.test/x.mp3 while writing /var/data/y.jsonl",
    );
    expect(redacted).not.toMatch(/a\.test/);
    expect(redacted).not.toMatch(/var/);
  });

  it("does not mistake a ratio or a time for a path", () => {
    expect(redactMessage("gain 1/2 at 06:30")).toBe("gain 1/2 at 06:30");
  });

  it("still truncates a very long message", () => {
    expect(
      redactMessage("x".repeat(MAX_MESSAGE * 2)).length,
    ).toBeLessThanOrEqual(MAX_MESSAGE);
  });

  it("leaves a script name alone, which diagnostics are allowed to carry", () => {
    expect(redactMessage('Script "MILD Cycles" refers to unknown signal')).toBe(
      'Script "MILD Cycles" refers to unknown signal',
    );
  });
});
