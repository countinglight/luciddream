import { BUNDLED_SCRIPT_TEXT } from "../bundled-scripts";
import {
  resolveScriptText,
  validateLibraryScript,
  validateScriptText,
} from "../scripts";
import { InMemoryFileStore } from "../testing/in-memory-file-store";
import type { LibraryScript } from "../library-types";

describe("resolveScriptText", () => {
  it("returns bundled text directly, with no filesystem access", async () => {
    const store = new InMemoryFileStore();
    const item: LibraryScript = {
      id: "bundled-01-single-beep",
      kind: "script",
      name: "Single Beep",
      source: { type: "bundled", assetId: "01-single-beep" },
      savedOffline: true,
      addedAt: 0,
    };

    expect(await resolveScriptText(item, store)).toBe(
      BUNDLED_SCRIPT_TEXT["01-single-beep"],
    );
    expect(store.downloads).toHaveLength(0);
  });

  it("throws a readable error for an unknown bundled asset id", async () => {
    const item: LibraryScript = {
      id: "bundled-nope",
      kind: "script",
      name: "Nope",
      source: { type: "bundled", assetId: "nope" },
      savedOffline: true,
      addedAt: 0,
    };
    await expect(
      resolveScriptText(item, new InMemoryFileStore()),
    ).rejects.toThrow(/Unknown bundled script/);
  });

  it("downloads and reads a url-sourced script", async () => {
    const store = new InMemoryFileStore();
    const url = "https://x.test/my-script.yaml";
    const item: LibraryScript = {
      id: "url-abc",
      kind: "script",
      name: "My Script",
      source: { type: "url", url },
      savedOffline: false,
      addedAt: 0,
    };

    const text = await resolveScriptText(item, store);

    expect(text).toBe(`content-of(${url})`);
    // Downloaded to a staging path, then promoted, so an interrupted
    // download cannot leave a truncated file where resolution looks.
    expect(store.downloads).toEqual([
      { url, root: "cache", path: "scripts/url-abc.yaml.part" },
    ]);
  });
});

describe("script validation on add", () => {
  const valid = "name: Ok\nversion: 1\nbody:\n  - play: chime\n";

  it("accepts a valid script", () => {
    expect(() => validateScriptText("Ok", valid)).not.toThrow();
  });

  it("names the script and the failing node when it is invalid", () => {
    expect(() =>
      validateScriptText(
        "Typo",
        "name: T\nversion: 1\nbody:\n  - repeat: 2\n    wiatt: 5m\n    body:\n      - play: chime\n",
      ),
    ).toThrow(/"Typo" could not be read: Unknown option "wiatt"/);
  });

  it("accepts the period presets a script may use", () => {
    expect(() =>
      validateScriptText(
        "Presets",
        "name: P\nversion: 1\nbody:\n  - wait: $short\n  - wait: $medium\n  - wait: $long\n",
      ),
    ).not.toThrow();
  });

  it("downloads and validates a URL script", async () => {
    const store = new InMemoryFileStore();
    const item: LibraryScript = {
      id: "url-ok",
      kind: "script",
      name: "Remote",
      source: { type: "url", url: "https://x.test/ok.yaml" },
      savedOffline: false,
      addedAt: 0,
    };
    jest
      .spyOn(store, "downloadTo")
      .mockImplementation(async (_url, root, path) => {
        await store.writeText(root, path, valid);
      });

    await expect(validateLibraryScript(item, store)).resolves.toBeUndefined();
  });

  it("reports a download failure as such, not as a bad script", async () => {
    const store = new InMemoryFileStore();
    jest.spyOn(store, "downloadTo").mockRejectedValue(new Error("offline"));
    const item: LibraryScript = {
      id: "url-down",
      kind: "script",
      name: "Remote",
      source: { type: "url", url: "https://x.test/down.yaml" },
      savedOffline: false,
      addedAt: 0,
    };

    await expect(validateLibraryScript(item, store)).rejects.toThrow(
      /"Remote" could not be downloaded: offline/,
    );
  });
});
