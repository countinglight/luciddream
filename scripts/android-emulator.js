#!/usr/bin/env node

/**
 * Android emulator helper for local device checks.
 *
 *   node scripts/android-emulator.js plan    what it would do, touching nothing
 *   node scripts/android-emulator.js start   create the AVD if missing, boot it, wait for Android
 *   node scripts/android-emulator.js check   boot, Doze and foreground-service state
 *   node scripts/android-emulator.js doze    screen off, unplugged, forced into deep Doze
 *   node scripts/android-emulator.js wake    undo `doze`
 *
 * Only the SDK's own tools are used (avdmanager, emulator, adb); nothing is
 * downloaded. Every adb call uses `-e`, so a phone plugged in at the same
 * time is never touched.
 *
 * An emulator cannot stand in for a full night on a phone. It is for the
 * short checks, and for forcing Doze on demand rather than waiting for a
 * phone to idle on its own.
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const AVD_NAME = process.env.LUCIDDREAM_AVD || "luciddream";
const APP_ID = require("../app.json").expo.android.package;
const BOOT_TIMEOUT_MS = 5 * 60_000;
const isWindows = process.platform === "win32";

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function sdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWindows && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null,
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Android", "sdk")
      : path.join(os.homedir(), "Android", "Sdk"),
  ].filter(Boolean);
  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) {
    fail(
      "Android SDK not found. Install it from Android Studio, or set ANDROID_HOME.",
    );
  }
  return found;
}

function tools(sdk) {
  const exe = isWindows ? ".exe" : "";
  const bat = isWindows ? ".bat" : "";
  return {
    adb: path.join(sdk, "platform-tools", `adb${exe}`),
    emulator: path.join(sdk, "emulator", `emulator${exe}`),
    avdmanager: path.join(
      sdk,
      "cmdline-tools",
      "latest",
      "bin",
      `avdmanager${bat}`,
    ),
  };
}

function requireTool(file, hint) {
  if (!fs.existsSync(file)) fail(`Missing ${file}\n${hint}`);
}

/**
 * The best installed system image. Stable numbered API levels are preferred
 * over preview codenames such as `android-Tiramisu`, which can be unstable;
 * Google APIs images over plain ones; the host's own architecture only.
 */
function pickSystemImage(sdk) {
  const root = path.join(sdk, "system-images");
  if (!fs.existsSync(root)) return null;
  const abi = process.arch === "arm64" ? "arm64-v8a" : "x86_64";
  const images = [];

  for (const platform of fs.readdirSync(root)) {
    for (const variant of safeReadDir(path.join(root, platform))) {
      // A folder alone proves nothing: an interrupted download leaves an empty
      // one behind, which avdmanager then rejects as an invalid package.
      const imageDir = path.join(root, platform, variant, abi);
      if (
        !fs.existsSync(path.join(imageDir, "package.xml")) ||
        !fs.existsSync(path.join(imageDir, "system.img"))
      )
        continue;
      const api = Number(platform.replace("android-", ""));
      // Preview codenames such as android-Tiramisu are skipped outright: they
      // are unfinished releases and a poor base for checking real behaviour.
      if (!Number.isFinite(api)) continue;
      images.push({
        id: `system-images;${platform};${variant};${abi}`,
        stable: Number.isFinite(api),
        api: Number.isFinite(api) ? api : 0,
        googleApis: variant.startsWith("google_apis"),
      });
    }
  }

  images.sort(
    (a, b) =>
      Number(b.stable) - Number(a.stable) ||
      b.api - a.api ||
      Number(b.googleApis) - Number(a.googleApis),
  );
  return images[0] ?? null;
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function run(file, args, options = {}) {
  // .bat files need a shell on Windows; quote the path in case it has spaces.
  const needsShell = isWindows && file.endsWith(".bat");
  // Through cmd.exe, `;` and spaces split arguments, and a system image id such
  // as system-images;android-31;google_apis;x86_64 is full of semicolons.
  const finalArgs = needsShell
    ? args.map((arg) => (/[\s;,=]/.test(arg) ? `"${arg}"` : arg))
    : args;
  const result = spawnSync(needsShell ? `"${file}"` : file, finalArgs, {
    encoding: "utf8",
    shell: needsShell,
    ...options,
  });
  return {
    ok: result.status === 0,
    out: (result.stdout || "").trim(),
    err: (result.stderr || "").trim(),
  };
}

function adb(t, ...args) {
  return run(t.adb, ["-e", ...args]);
}

function avdExists(t) {
  return run(t.emulator, ["-list-avds"])
    .out.split(/\r?\n/)
    .map((line) => line.trim())
    .includes(AVD_NAME);
}

function runningEmulator(t) {
  const lines = run(t.adb, ["devices"]).out.split(/\r?\n/);
  return lines.some((line) => /^emulator-\d+\s+device$/.test(line.trim()));
}

/** avdmanager is a Java tool. Android Studio ships a JDK that is usually not
 * on PATH, so borrow it when JAVA_HOME is unset. */
function javaEnv() {
  if (process.env.JAVA_HOME) return process.env;
  const studioJdks = isWindows
    ? [
        "C:\\Program Files\\Android\\Android Studio\\jbr",
        path.join(
          process.env.LOCALAPPDATA || "",
          "Programs",
          "Android Studio",
          "jbr",
        ),
      ]
    : ["/Applications/Android Studio.app/Contents/jbr/Contents/Home"];
  const jdk = studioJdks.find((dir) => fs.existsSync(dir));
  return jdk ? { ...process.env, JAVA_HOME: jdk } : process.env;
}

function createAvd(t, image) {
  console.log(`Creating emulator "${AVD_NAME}" from ${image.id} ...`);
  const result = run(
    t.avdmanager,
    ["create", "avd", "--name", AVD_NAME, "--package", image.id],
    // Answers "Do you wish to create a custom hardware profile?"
    { input: "no\n", env: javaEnv() },
  );
  if (!result.ok) {
    fail(
      `avdmanager could not create the emulator.\n${result.err || result.out}\n\n` +
        "If it warns about SDK XML versions, the command-line tools are out of date: in Android\n" +
        "Studio's SDK Manager > SDK Tools, install Android SDK Command-line Tools (latest).\n" +
        "If it mentions Java, set JAVA_HOME to Android Studio's bundled JDK (its `jbr` folder),\n" +
        "or create an emulator named " +
        `"${AVD_NAME}" in Android Studio's Device Manager instead.`,
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBoot(t) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  process.stdout.write("Waiting for Android to finish booting");
  while (Date.now() < deadline) {
    if (adb(t, "shell", "getprop", "sys.boot_completed").out === "1") {
      process.stdout.write(" ready.\n");
      return;
    }
    process.stdout.write(".");
    await sleep(3_000);
  }
  fail("The emulator did not finish booting within five minutes.");
}

function plan(sdk, t) {
  const image = pickSystemImage(sdk);
  console.log(`SDK:              ${sdk}`);
  console.log(`App id:           ${APP_ID}`);
  console.log(`Emulator name:    ${AVD_NAME}`);
  console.log(`Emulator exists:  ${avdExists(t) ? "yes" : "no"}`);
  console.log(`Running now:      ${runningEmulator(t) ? "yes" : "no"}`);
  console.log(`Image to use:     ${image ? image.id : "none installed"}`);
  console.log(
    `avdmanager:       ${fs.existsSync(t.avdmanager) ? "found" : "missing"}`,
  );
  console.log(
    `JAVA_HOME:        ${javaEnv().JAVA_HOME || "not set, and no Android Studio JDK found"}`,
  );
}

async function start(sdk, t) {
  requireTool(
    t.adb,
    "Install Android SDK Platform-Tools from Android Studio's SDK Manager.",
  );
  requireTool(
    t.emulator,
    "Install the Android Emulator from Android Studio's SDK Manager.",
  );

  if (runningEmulator(t)) {
    console.log("An emulator is already running; using it.");
    await waitForBoot(t);
    return;
  }

  if (!avdExists(t)) {
    requireTool(
      t.avdmanager,
      "Install Android SDK Command-line Tools (latest) from Android Studio's SDK Manager.",
    );
    const image = pickSystemImage(sdk);
    if (!image) {
      fail(
        "No complete, stable x86_64 system image is installed (preview images are skipped).\n" +
          "In Android Studio: Settings > Languages & Frameworks > Android SDK > SDK Platforms,\n" +
          'tick "Show Package Details", and install "Google APIs Intel x86_64 Atom System Image"\n' +
          "under a released Android version.",
      );
    }
    createAvd(t, image);
  }

  console.log(`Starting emulator "${AVD_NAME}" ...`);
  const child = spawn(
    t.emulator,
    ["-avd", AVD_NAME, "-netdelay", "none", "-netspeed", "full"],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();

  run(t.adb, ["wait-for-device"]);
  await waitForBoot(t);
}

function requireRunning(t) {
  requireTool(
    t.adb,
    "Install Android SDK Platform-Tools from Android Studio's SDK Manager.",
  );
  if (!runningEmulator(t))
    fail("No emulator is running. Start one with: npm run emulator:start");
}

function doze(t) {
  requireRunning(t);
  // Deep Doze requires the device to look unplugged and the screen to be off.
  adb(t, "shell", "dumpsys", "battery", "unplug");
  adb(t, "shell", "input", "keyevent", "KEYCODE_SLEEP");
  const result = adb(t, "shell", "dumpsys", "deviceidle", "force-idle", "deep");
  console.log(result.out || result.err);
  console.log(
    "\nThe emulator is now in deep Doze. Leave a night running through a long silent wait,\n" +
      "then: npm run emulator:check   (is the foreground service still there?)\n" +
      "and:  npm run emulator:wake    (when you are done)",
  );
}

function wake(t) {
  requireRunning(t);
  adb(t, "shell", "dumpsys", "deviceidle", "unforce");
  adb(t, "shell", "dumpsys", "battery", "reset");
  adb(t, "shell", "input", "keyevent", "KEYCODE_WAKEUP");
  console.log("Doze released, battery state reset, screen woken.");
}

function check(t) {
  requireRunning(t);
  const booted = adb(t, "shell", "getprop", "sys.boot_completed").out === "1";
  const dozeState = adb(t, "shell", "dumpsys", "deviceidle", "get", "deep").out;
  const services = adb(
    t,
    "shell",
    "dumpsys",
    "activity",
    "services",
    APP_ID,
  ).out;
  const installed = adb(t, "shell", "pm", "path", APP_ID).out.length > 0;
  const foreground = /isForeground=true/.test(services);

  console.log(`Booted:              ${booted ? "yes" : "no"}`);
  console.log(`Deep Doze state:     ${dozeState || "unknown"}`);
  console.log(`${APP_ID} installed: ${installed ? "yes" : "no"}`);
  console.log(`Foreground service:  ${foreground ? "RUNNING" : "not running"}`);
  if (installed && !foreground) {
    console.log(
      "\nIf a night is supposed to be running, this is the failure D1 looks for: without a\n" +
        "foreground service Android stops background playback after about three minutes.",
    );
  }
}

async function main() {
  const command = process.argv[2] || "plan";
  const sdk = sdkRoot();
  const t = tools(sdk);

  switch (command) {
    case "plan":
      return plan(sdk, t);
    case "start":
      return start(sdk, t);
    case "check":
      return check(t);
    case "doze":
      return doze(t);
    case "wake":
      return wake(t);
    default:
      fail(
        `Unknown command "${command}". Use: plan, start, check, doze, wake.`,
      );
  }
}

main().catch((error) =>
  fail(error instanceof Error ? error.message : String(error)),
);
