import fs from "node:fs";
import path from "node:path";

import { DEFAULT_DURATION_PRESETS, parseScript } from "@/engine";
import { SOUND_IDS } from "@/lib/sounds";

import { collectSignalNames } from "../resolve";

type ManifestEntry = { name: string; url: string };

type Manifest = {
  baseUrl: string;
  signals: ManifestEntry[];
  scripts: ManifestEntry[];
};

const contentDir = path.resolve(__dirname, "../../../site/content");
const scriptsDir = path.join(contentDir, "scripts");

function publishedScripts(): string[] {
  return fs
    .readdirSync(scriptsDir)
    .filter((file) => /\.(ya?ml|json)$/i.test(file))
    .sort();
}

describe("published website scripts", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(contentDir, "manifest.json"), "utf8"),
  ) as Manifest;
  const availableSignals = new Set([
    ...SOUND_IDS,
    ...manifest.signals.map((entry) => entry.name),
  ]);

  it("catalogs every published script and points only to existing scripts", () => {
    const files = publishedScripts();
    const prefix = new URL("scripts/", manifest.baseUrl);
    const catalogFiles = manifest.scripts.map((entry) => {
      const url = new URL(entry.url, manifest.baseUrl);
      expect(url.origin).toBe(prefix.origin);
      expect(url.pathname.startsWith(prefix.pathname)).toBe(true);
      return decodeURIComponent(url.pathname.slice(prefix.pathname.length));
    });

    expect(catalogFiles.sort()).toEqual(files);
  });

  it.each(publishedScripts())(
    "%s parses and refers only to available signals",
    (file) => {
      const source = fs.readFileSync(path.join(scriptsDir, file), "utf8");
      const script = parseScript(source, {
        durationPresets: DEFAULT_DURATION_PRESETS,
      });
      const missing = [...collectSignalNames(script)].filter(
        (signal) => !availableSignals.has(signal),
      );

      expect(missing).toEqual([]);
    },
  );
});
