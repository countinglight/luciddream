#!/usr/bin/env node
/* global __dirname */

/** Inspect published audio, optionally convert it, and reconcile the catalog. */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseArgs } = require("node:util");
const readline = require("node:readline/promises");
const yaml = require("js-yaml");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const AUDIO = /\.(m4a|mp3|wav|aac|flac|ogg|opus|aif|aiff|caf|mp4|webm|wma)$/i;

function filesUnder(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isSymbolicLink())
        throw new Error(`Unsupported symlink: ${entry.name}`);
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? filesUnder(file) : [file];
    })
    .sort();
}

function run(tool, args) {
  try {
    return execFileSync(tool, args, {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `${tool}: ${
        error.code === "ENOENT"
          ? "executable not found; use --ffmpeg / --ffprobe or FFMPEG_PATH / FFPROBE_PATH."
          : String(error.stderr || error.message).trim()
      }`,
    );
  }
}

function probe(file, ffprobe) {
  const data = JSON.parse(
    run(ffprobe, [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
  const streams = data.streams.filter(
    (stream) => stream.codec_type === "audio",
  );
  if (streams.length !== 1)
    throw new Error(
      `${file}: expected one audio stream, found ${streams.length}.`,
    );
  const audio = streams[0];
  if (!(Number(audio.sample_rate) > 0) || !(audio.channels > 0)) {
    throw new Error(`${file}: invalid audio sample rate or channel count.`);
  }
  return { ...audio, container: data.format.format_name };
}

function conversionReasons(file, audio) {
  const reasons = [];
  if (
    path.extname(file).toLowerCase() !== ".m4a" ||
    !audio.container.split(",").includes("m4a")
  )
    reasons.push("prefer an M4A container");
  if (audio.codec_name !== "aac" || audio.profile !== "LC")
    reasons.push("prefer AAC-LC");
  if (Number(audio.sample_rate) > 48000)
    reasons.push("sample rate exceeds 48 kHz");
  if (audio.channels > 2) reasons.push("more than two channels");
  // Allow normal encoder variation; existing 128 kbps mono AAC needs no re-encode.
  if (Number(audio.bit_rate) > (audio.channels === 1 ? 144000 : 192000))
    reasons.push("high bitrate for a signal");
  return reasons;
}

function transcode(file, audio, ffmpeg, ffprobe, mono = false) {
  const parsed = path.parse(file);
  const output = path.join(
    parsed.dir,
    `${parsed.name}${parsed.ext.toLowerCase() === ".m4a" ? ".optimized" : ""}.m4a`,
  );
  if (fs.existsSync(output))
    throw new Error(`Refusing to overwrite ${output}.`);
  const temporary = path.join(
    parsed.dir,
    `.signal-${process.pid}-${Date.now()}.m4a`,
  );
  const channels = mono ? 1 : Math.min(audio.channels, 2);
  try {
    run(ffmpeg, [
      "-hide_banner",
      "-v",
      "error",
      "-nostdin",
      "-n",
      "-i",
      file,
      "-map",
      "0:a:0",
      "-c:a",
      "aac",
      "-profile:a",
      "aac_low",
      "-b:a",
      channels === 1 ? "96k" : "160k",
      "-ac",
      String(channels),
      "-ar",
      String(Math.min(Number(audio.sample_rate), 48000)),
      "-movflags",
      "+faststart",
      temporary,
    ]);
    const result = probe(temporary, ffprobe);
    if (conversionReasons(temporary, result).length)
      throw new Error("Converted audio failed encoding checks.");
    // COPYFILE_EXCL also protects against a destination created while encoding.
    fs.copyFileSync(temporary, output, fs.constants.COPYFILE_EXCL);
    return output;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function signalUrl(base, relative) {
  return new URL(
    `signals/${relative.split("/").map(encodeURIComponent).join("/")}`,
    base,
  ).href;
}

function reconcile(manifest, files, base) {
  const prefix = new URL("signals/", base);
  const available = new Set(files);
  const covered = new Set();
  const changes = [];
  const signals = [];
  for (const entry of manifest.signals) {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      typeof entry.url !== "string"
    ) {
      throw new Error("Every manifest signal needs a nonempty name and URL.");
    }
    const url = new URL(entry.url, base);
    if (url.protocol !== "https:")
      throw new Error(`Signal ${entry.name}: URL must use HTTPS.`);
    if (
      url.origin !== prefix.origin ||
      !url.pathname.startsWith(prefix.pathname)
    ) {
      signals.push(entry);
      changes.push(
        `External signal retained (not locally verified): ${entry.name} -> ${url.href}`,
      );
      continue;
    }
    const relative = decodeURIComponent(
      url.pathname.slice(prefix.pathname.length),
    );
    if (available.has(relative)) {
      signals.push(entry);
      covered.add(relative);
    } else {
      // A desktop conversion often changes only the extension. Preserve the
      // moniker used by scripts when there is exactly one possible replacement.
      const stem = (file) => file.slice(0, -path.posix.extname(file).length);
      const replacements = files.filter(
        (file) => stem(file) === stem(relative),
      );
      if (replacements.length === 1) {
        signals.push({ ...entry, url: signalUrl(base, replacements[0]) });
        covered.add(replacements[0]);
        changes.push(
          `Updated replacement signal: ${entry.name} -> ${replacements[0]}`,
        );
      } else {
        changes.push(`Removed missing signal: ${entry.name} -> ${entry.url}`);
      }
    }
  }
  for (const file of files) {
    if (!covered.has(file)) {
      const name = path.posix.basename(file);
      signals.push({ name, url: signalUrl(base, file) });
      changes.push(`Added signal: ${name}`);
    }
  }
  const names = new Set();
  for (const entry of signals) {
    const name = entry.name.trim();
    if (names.has(name))
      throw new Error(
        `Duplicate signal name ${JSON.stringify(name)}; rename the file or edit the manifest name.`,
      );
    names.add(name);
  }
  return { manifest: { ...manifest, signals }, changes };
}

function scriptCatalogErrors(manifest, files, base) {
  const errors = [];
  const prefix = new URL("scripts/", base);
  const available = new Set(files);
  const covered = new Set();
  const names = new Set();
  for (const entry of manifest.scripts) {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      typeof entry.url !== "string"
    ) {
      errors.push("Every manifest script needs a nonempty name and URL.");
      continue;
    }
    if (names.has(entry.name.trim()))
      errors.push(
        `Duplicate manifest script name ${JSON.stringify(entry.name.trim())}.`,
      );
    names.add(entry.name.trim());
    let url;
    try {
      url = new URL(entry.url, base);
    } catch {
      errors.push(
        `Script ${entry.name}: invalid URL ${JSON.stringify(entry.url)}.`,
      );
      continue;
    }
    if (url.protocol !== "https:") {
      errors.push(`Script ${entry.name}: URL must use HTTPS.`);
      continue;
    }
    if (
      url.origin !== prefix.origin ||
      !url.pathname.startsWith(prefix.pathname)
    )
      continue;
    const relative = decodeURIComponent(
      url.pathname.slice(prefix.pathname.length),
    );
    covered.add(relative);
    if (!available.has(relative))
      errors.push(
        `Manifest script ${JSON.stringify(entry.name)} points to missing file ${JSON.stringify(relative)}.`,
      );
  }
  for (const file of files) {
    if (!covered.has(file))
      errors.push(
        `Published script ${JSON.stringify(file)} is missing from manifest.json.`,
      );
  }
  return errors;
}

function bundledNames() {
  // Read the real registry without evaluating React Native asset require() calls.
  const file = path.join(ROOT, "src/lib/sounds.ts");
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let names;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "SOUNDS"
    ) {
      let value = node.initializer;
      while (value && ts.isAsExpression(value)) value = value.expression;
      if (value && ts.isObjectLiteralExpression(value)) {
        names = value.properties.map((property) => property.name?.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!names || names.some((name) => !name))
    throw new Error("Cannot read bundled sound names from src/lib/sounds.ts.");
  return names;
}

function referenceErrors(source, names) {
  const errors = [];
  if (source.length > 256 * 1024) return ["Script exceeds 256 KiB."];
  let document;
  try {
    document = yaml.load(source);
  } catch (error) {
    return [error.message];
  }
  let count = 0;
  const active = new Set();
  function visit(body, location, depth) {
    if (depth > 32 || ++count > 10000)
      throw new Error(`${location}: script nesting/size limit exceeded.`);
    if (!Array.isArray(body)) {
      errors.push(`${location}: expected a statement list.`);
      return;
    }
    if (active.has(body))
      throw new Error(`${location}: cyclic YAML reference.`);
    active.add(body);
    body.forEach((node, i) => {
      const at = `${location}[${i}]`;
      if (!node || typeof node !== "object") {
        errors.push(`${at}: expected a statement.`);
        return;
      }
      if (Object.hasOwn(node, "play")) {
        const name =
          typeof node.play === "string" ? node.play : node.play?.signal;
        if (typeof name !== "string" || !name.trim()) {
          errors.push(
            `${at}.play: expected a signal name or { signal: name }; put a space after "signal:".`,
          );
        } else if (!names.has(name)) {
          errors.push(
            `${at}.play: missing signal ${JSON.stringify(name)} (no catalog entry or bundled sound).`,
          );
        }
      }
      for (const key of ["body", "then", "else"]) {
        if (Object.hasOwn(node, key))
          visit(node[key], `${at}.${key}`, depth + 1);
      }
    });
    active.delete(body);
  }
  try {
    visit(document?.body, "body", 0);
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      check: { type: "boolean" },
      "skip-audio": { type: "boolean" },
      "no-transcode": { type: "boolean" },
      mono: { type: "boolean" },
      ffmpeg: { type: "string" },
      ffprobe: { type: "string" },
      help: { type: "boolean" },
      "content-dir": { type: "string" },
    },
  });
  if (values.help) {
    console.log(`Usage: node scripts/sync-signals.js [options]
  --check             Read-only audit; exit 1 for errors or stale manifest
  --skip-audio        Check catalog/references without FFprobe (used by npm check)
  --no-transcode      Sync catalog without conversion prompts
  --mono              Offer mono conversion (default preserves stereo)
  --ffmpeg PATH       FFmpeg executable (or FFMPEG_PATH / PATH)
  --ffprobe PATH      FFprobe executable (or FFPROBE_PATH / beside FFmpeg / PATH)
  --content-dir DIR   Content root (default: site/content, independent of cwd)

New names equal filenames including extensions. Existing names are preserved.
Conversions require confirmation, keep originals, and add a separate catalog entry.
Compatible AAC-LC is retained. Other audio is offered as 96 kbps mono / 160 kbps
stereo M4A. Encoding suggestions alone are not check failures.`);
    return 0;
  }
  const content = path.resolve(
    values["content-dir"] || path.join(ROOT, "site/content"),
  );
  const manifestFile = path.join(content, "manifest.json");
  const signalDir = path.join(content, "signals");
  const scriptDir = path.join(content, "scripts");
  const original = fs.readFileSync(manifestFile, "utf8");
  const manifest = JSON.parse(original);
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.signals) ||
    !Array.isArray(manifest.scripts)
  )
    throw new Error(
      "Expected a version 1 manifest with signals and scripts lists.",
    );
  const base = new URL(manifest.baseUrl);
  if (
    base.protocol !== "https:" ||
    !base.pathname.endsWith("/") ||
    base.search ||
    base.hash
  )
    throw new Error(
      "manifest.baseUrl must be an absolute HTTPS directory URL ending in /.",
    );
  const skipAudio = values["skip-audio"] === true;
  const ffmpeg = values.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobe =
    values.ffprobe ||
    process.env.FFPROBE_PATH ||
    (path.dirname(ffmpeg) === "."
      ? "ffprobe"
      : path.join(
          path.dirname(ffmpeg),
          process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
        ));
  if (!skipAudio) run(ffprobe, ["-version"]);
  let prompt;
  const errors = [];
  try {
    const audioFiles = filesUnder(signalDir).filter((file) => AUDIO.test(file));
    for (const file of audioFiles) {
      if (fs.statSync(file).size >= 25 * 1024 * 1024)
        errors.push(`${file}: exceeds the site's 25 MiB file limit.`);
      if (skipAudio) continue;
      try {
        const audio = probe(file, ffprobe);
        const reasons = conversionReasons(file, audio);
        console.log(
          `${path.relative(signalDir, file)}: ${audio.codec_name} ${audio.profile || ""}, ${audio.sample_rate} Hz, ${audio.channels} channel(s), ${audio.bit_rate ? Math.round(Number(audio.bit_rate) / 1000) + " kbps" : "bitrate unknown"}`,
        );
        if (!reasons.length) continue;
        console.log(`  Suggestion: ${reasons.join("; ")}.`);
        if (values.check || values["no-transcode"]) continue;
        if (!process.stdin.isTTY) {
          console.log(
            "  Conversion skipped: run in an interactive terminal to confirm.",
          );
          continue;
        }
        prompt ||= readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const channels = values.mono ? 1 : Math.min(audio.channels, 2);
        const answer = await prompt.question(
          `  Create AAC-LC M4A (${channels === 1 ? "96 kbps mono" : "160 kbps stereo"}), keeping original? [y/N] `,
        );
        if (/^y(es)?$/i.test(answer.trim()))
          console.log(
            `  Created ${transcode(file, audio, ffmpeg, ffprobe, values.mono)}`,
          );
      } catch (error) {
        errors.push(error.message);
      }
    }
    if (skipAudio)
      console.log(
        `Skipped encoding inspection for ${audioFiles.length} audio file(s).`,
      );
  } finally {
    prompt?.close();
  }
  // Do not rewrite a catalog when a file could not be inspected or converted.
  const audioErrors = errors.length;
  const files = filesUnder(signalDir)
    .filter((file) => AUDIO.test(file))
    .map((file) => path.relative(signalDir, file).split(path.sep).join("/"));
  const updated = reconcile(manifest, files, base);
  updated.changes.forEach((message) => console.log(message));
  const names = new Set([
    ...bundledNames(),
    ...updated.manifest.signals.map((entry) => entry.name.trim()),
  ]);
  const scriptFiles = filesUnder(scriptDir)
    .filter((file) => /\.(ya?ml|json)$/i.test(file))
    .map((file) => path.relative(scriptDir, file).split(path.sep).join("/"));
  errors.push(...scriptCatalogErrors(manifest, scriptFiles, base));
  for (const relative of scriptFiles) {
    const file = path.join(scriptDir, ...relative.split("/"));
    errors.push(
      ...referenceErrors(fs.readFileSync(file, "utf8"), names).map(
        (message) => `${path.relative(content, file)}: ${message}`,
      ),
    );
  }
  const changed = JSON.stringify(manifest) !== JSON.stringify(updated.manifest);
  if (changed && !values.check && !audioErrors) {
    if (fs.readFileSync(manifestFile, "utf8") !== original)
      throw new Error(
        "manifest.json changed during this run; rerun to preserve those edits.",
      );
    const temporary = `${manifestFile}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(
        temporary,
        JSON.stringify(updated.manifest, null, 2) + "\n",
        { flag: "wx" },
      );
      fs.renameSync(temporary, manifestFile);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    console.log("Updated manifest.json.");
  } else if (changed) {
    console.log("Manifest needs updating; no manifest changes written.");
  } else {
    console.log("Signal catalog is up to date.");
  }
  errors.forEach((message) => console.error(`ERROR: ${message}`));
  return errors.length || (values.check && changed) ? 1 : 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`ERROR: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  main,
  probe,
  conversionReasons,
  transcode,
  reconcile,
  scriptCatalogErrors,
  referenceErrors,
  bundledNames,
};
