/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { test } = require("node:test");
const {
  reconcile,
  referenceErrors,
  conversionReasons,
  bundledNames,
  probe,
  transcode,
  scriptCatalogErrors,
} = require("../sync-signals.js");

const base = new URL("https://example.com/content/");
const manifest = {
  version: 1,
  baseUrl: base.href,
  scripts: [{ name: "example", url: "scripts/example.yaml" }],
  signals: [],
};
const audio = {
  codec_name: "aac",
  profile: "LC",
  container: "mov,mp4,m4a",
  sample_rate: "48000",
  channels: 1,
  bit_rate: "128500",
};

test("keeps edited names and metadata, removes missing URLs, adds encoded filenames, and is idempotent", () => {
  const input = {
    ...manifest,
    signals: [
      { name: "My edited name", url: "signals/old.m4a", note: "keep" },
      { name: "gone", url: "signals/missing.mp3" },
    ],
  };
  const files = ["old.m4a", "Breathing #1.m4a"];
  const result = reconcile(input, files, base).manifest;
  assert.deepEqual(result.scripts, input.scripts);
  assert.deepEqual(result.signals, [
    input.signals[0],
    {
      name: "Breathing #1.m4a",
      url: "https://example.com/content/signals/Breathing%20%231.m4a",
    },
  ]);
  assert.deepEqual(reconcile(result, files, base).manifest, result);
});

test("matches encoded filenames with query strings; retains external signals", () => {
  const entries = [
    { name: "breath", url: "signals/Hard%20breath.m4a?v=2" },
    { name: "external", url: "https://cdn.example.net/tone.m4a" },
  ];
  assert.deepEqual(
    reconcile({ ...manifest, signals: entries }, ["Hard breath.m4a"], base)
      .manifest.signals,
    entries,
  );
});

test("refuses duplicate names instead of silently replacing an edited alias", () => {
  assert.throws(
    () =>
      reconcile(
        { ...manifest, signals: [{ name: "new.m4a", url: "signals/old.m4a" }] },
        ["old.m4a", "new.m4a"],
        base,
      ),
    /Duplicate signal name/,
  );
  assert.throws(
    () => reconcile(manifest, ["one/tone.m4a", "two/tone.m4a"], base),
    /Duplicate signal name/,
  );
});

test("preserves aliases for unique extension replacements but never guesses between candidates", () => {
  const input = {
    ...manifest,
    signals: [{ name: "sleepbreath", url: "signals/breath.mp3", note: "keep" }],
  };
  const replaced = reconcile(input, ["breath.m4a"], base).manifest.signals;
  assert.deepEqual(replaced, [
    {
      name: "sleepbreath",
      url: "https://example.com/content/signals/breath.m4a",
      note: "keep",
    },
  ]);
  const ambiguous = reconcile(input, ["breath.m4a", "breath.wav"], base)
    .manifest.signals;
  assert.deepEqual(
    ambiguous.map((entry) => entry.name),
    ["breath.m4a", "breath.wav"],
  );
});

test("reports missing and uncataloged published scripts", () => {
  const input = {
    ...manifest,
    scripts: [
      { name: "present", url: "scripts/present.yaml" },
      { name: "missing", url: "scripts/missing.yaml" },
    ],
  };
  assert.deepEqual(
    scriptCatalogErrors(input, ["present.yaml", "new.yaml"], base),
    [
      'Manifest script "missing" points to missing file "missing.yaml".',
      'Published script "new.yaml" is missing from manifest.json.',
    ],
  );
});

test("checks shorthand and detailed references inside all nested branches", () => {
  const errors = referenceErrors(
    `body:
  - play: chime
  - repeat: 2
    body:
      - with: { gain: 0.5 }
        body:
          - play: { signal: vanished }
  - if: { rem: true }
    then:
      - play: chime
    else:
      - play: absent
`,
    new Set(["chime"]),
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0], /body\[1\].body\[0\].body\[0\].play.*vanished/);
  assert.match(errors[1], /else\[0\].play.*absent/);
});

test("reports malformed signal mappings and cyclic YAML without hanging", () => {
  assert.match(
    referenceErrors(
      "body:\n  - play: { signal:chime, wait: true }",
      new Set(),
    )[0],
    /space after/,
  );
  assert.match(
    referenceErrors(
      "body: &loop\n  - repeat: 2\n    body: *loop",
      new Set(),
    )[0],
    /cyclic/,
  );
  assert.ok(referenceErrors("body: [", new Set()).length);
});

test("reads bundled names from the app and accepts sensible existing AAC", () => {
  assert.ok(bundledNames().includes("chime"));
  assert.deepEqual(conversionReasons("tone.m4a", audio), []);
  assert.ok(
    conversionReasons("tone.mp3", { ...audio, codec_name: "mp3" }).length,
  );
  assert.ok(
    conversionReasons("tone.m4a", { ...audio, bit_rate: "320000" }).length,
  );
  assert.deepEqual(
    conversionReasons("tone.m4a", {
      ...audio,
      channels: 2,
      bit_rate: "160000",
    }),
    [],
  );
});

test("content-only audit needs no FFmpeg tools and does not decode audio", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "luciddream-signals-"));
  try {
    fs.mkdirSync(path.join(temp, "signals"));
    fs.mkdirSync(path.join(temp, "scripts"));
    fs.writeFileSync(path.join(temp, "signals/tone.m4a"), "not decoded");
    fs.writeFileSync(
      path.join(temp, "scripts/example.yaml"),
      "name: Example\nbody:\n  - play: tone.m4a\n",
    );
    fs.writeFileSync(
      path.join(temp, "manifest.json"),
      JSON.stringify({
        ...manifest,
        signals: [{ name: "tone.m4a", url: "signals/tone.m4a" }],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, "../sync-signals.js"),
        "--content-dir",
        temp,
        "--check",
        "--skip-audio",
        "--ffprobe",
        path.join(temp, "does-not-exist"),
      ],
      { encoding: "utf8", windowsHide: true },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Skipped encoding inspection for 1 audio file/);
  } finally {
    const relative = path.relative(
      path.resolve(os.tmpdir()),
      path.resolve(temp),
    );
    assert.ok(
      relative.startsWith("luciddream-signals-") &&
        !relative.includes(path.sep),
    );
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

const ffmpeg = process.env.FFMPEG_PATH;
const ffprobe = process.env.FFPROBE_PATH;
test(
  "real conversion keeps the source, refuses overwrite, and CLI sync/check protects the catalog",
  { skip: !ffmpeg || !ffprobe },
  () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "luciddream-signals-"));
    try {
      const signals = path.join(temp, "signals");
      fs.mkdirSync(signals);
      fs.mkdirSync(path.join(temp, "scripts"));
      fs.writeFileSync(
        path.join(temp, "scripts/example.yaml"),
        "body:\n  - play: missing\n",
      );
      const file = path.join(signals, "stereo tone.wav");
      execFileSync(
        ffmpeg,
        [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=0.5",
          "-ac",
          "2",
          file,
        ],
        { windowsHide: true },
      );
      const before = fs.readFileSync(file);
      const result = transcode(file, probe(file, ffprobe), ffmpeg, ffprobe);
      assert.deepEqual(fs.readFileSync(file), before);
      assert.equal(probe(result, ffprobe).channels, 2);
      assert.equal(probe(result, ffprobe).profile, "LC");
      assert.throws(
        () => transcode(file, probe(file, ffprobe), ffmpeg, ffprobe),
        /overwrite/,
      );
      const catalog = path.join(temp, "manifest.json");
      const original = JSON.stringify({
        ...manifest,
        signals: [{ name: "orphan", url: "signals/gone.wav" }],
      });
      fs.writeFileSync(catalog, original);
      const cli = (flags) =>
        spawnSync(
          process.execPath,
          [
            path.resolve(__dirname, "../sync-signals.js"),
            "--content-dir",
            temp,
            ...flags,
          ],
          { encoding: "utf8", windowsHide: true },
        );
      const audit = cli(["--check"]);
      assert.equal(audit.status, 1);
      assert.equal(fs.readFileSync(catalog, "utf8"), original);
      const sync = cli(["--no-transcode"]);
      assert.equal(sync.status, 1); // Broken reference is reported even though the catalog is repaired.
      assert.match(sync.stderr, /example.yaml.*missing signal "missing"/);
      assert.equal(JSON.parse(fs.readFileSync(catalog)).signals.length, 2);
      fs.writeFileSync(
        path.join(temp, "scripts/example.yaml"),
        "body:\n  - play: chime\n",
      );
      const clean = cli(["--check"]);
      assert.equal(clean.status, 0, clean.stderr);
      const saved = fs.readFileSync(catalog, "utf8");
      fs.writeFileSync(path.join(signals, "broken.m4a"), "not audio");
      const broken = cli(["--no-transcode"]);
      assert.equal(broken.status, 1);
      assert.equal(fs.readFileSync(catalog, "utf8"), saved);
      assert.equal(
        fs.readdirSync(signals).filter((name) => name.startsWith(".signal-"))
          .length,
        0,
      );
    } finally {
      const relative = path.relative(
        path.resolve(os.tmpdir()),
        path.resolve(temp),
      );
      assert.ok(
        relative.startsWith("luciddream-signals-") &&
          !relative.includes(path.sep),
      );
      fs.rmSync(temp, { recursive: true, force: true });
    }
  },
);
