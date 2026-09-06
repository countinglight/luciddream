import fs from "node:fs";
import path from "node:path";

import { BUNDLED_SCRIPT_TEXT } from "../bundled-scripts";

/** The YAML assets are the canonical source for bundled scripts. The generated
 * runtime constant in bundled-scripts.ts is refreshed automatically via the
 * sync script in scripts/sync-bundled-scripts.js, and this test ensures the
 * generated output has not drifted from the checked-in YAML files. */
describe("BUNDLED_SCRIPT_TEXT stays in sync with assets/scripts/*.yaml", () => {
  const examplesDir = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "assets",
    "scripts",
  );

  it.each(Object.keys(BUNDLED_SCRIPT_TEXT))(
    "%s.yaml matches the constant exactly",
    (id) => {
      const onDisk = fs.readFileSync(
        path.join(examplesDir, `${id}.yaml`),
        "utf8",
      );
      expect(BUNDLED_SCRIPT_TEXT[id]).toBe(onDisk);
    },
  );

  it("has no constants left over for files that no longer exist", () => {
    const filesOnDisk = fs
      .readdirSync(examplesDir)
      .map((f) => f.replace(/\.yaml$/, ""));
    expect(Object.keys(BUNDLED_SCRIPT_TEXT).sort()).toEqual(filesOnDisk.sort());
  });
});
