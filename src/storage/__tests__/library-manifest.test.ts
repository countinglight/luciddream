import { parseLibraryManifest } from "../library-manifest";

describe("parseLibraryManifest", () => {
  it("normalizes absolute and relative asset URLs", () => {
    expect(
      parseLibraryManifest("https://example.test/content/manifest.json", {
        version: 1,
        baseUrl: "https://cdn.example.test/library/",
        signals: [{ name: "chime", url: "signals/chime.mp3" }],
        scripts: [
          {
            name: "training",
            url: "https://example.test/scripts/training.yaml",
          },
        ],
      }),
    ).toEqual({
      url: "https://example.test/content/manifest.json",
      signals: [
        {
          name: "chime",
          url: "https://cdn.example.test/library/signals/chime.mp3",
        },
      ],
      scripts: [
        {
          name: "training",
          url: "https://example.test/scripts/training.yaml",
        },
      ],
    });
  });

  it("rejects duplicate signal names", () => {
    expect(() =>
      parseLibraryManifest("https://example.test/manifest.json", {
        version: 1,
        signals: [
          { name: "chime", url: "one.mp3" },
          { name: "chime", url: "two.mp3" },
        ],
        scripts: [],
      }),
    ).toThrow('more than one signal named "chime"');
  });
});
