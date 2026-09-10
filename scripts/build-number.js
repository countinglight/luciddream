#!/usr/bin/env node

/**
 * The single definition of LucidDream's build number — iOS `CFBundleVersion`
 * and Android `versionCode`. See doc/plans/luciddream-ios-support-plan.md §3.
 *
 * Deliberately a pure function of files already on disk plus one environment
 * variable, so that:
 *   - any script in the clone can derive it offline, with no network and no
 *     Expo login (the reason `appVersionSource` is "local" and not "remote");
 *   - a local Gradle build, an EAS cloud build and an EAS iOS build at the same
 *     version and counter all produce the SAME number, because they all
 *     evaluate this same function;
 *   - the repository stores the rule rather than the number, so a tag-triggered
 *     release never has to commit back onto its own tag.
 *
 * Required by both app.config.js (which feeds Expo's prebuild) and
 * scripts/version-info.js (which reports to humans and build scripts).
 */

const path = require("node:path");

const COUNTER_ENV = "LUCIDDREAM_BUILD";

// Packing: (major, minor, patch, counter) -> one strictly increasing integer.
// 0.5.0 with counter 17 -> 500017. Android's versionCode ceiling is
// 2_100_000_000, which this reaches at major 209.
const MINOR_MAX = 99;
const PATCH_MAX = 99;
const COUNTER_MAX = 999;

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(
      `package.json version must be a plain major.minor.patch semver; got "${version}".`,
    );
  }

  const [major, minor, patch] = match.slice(1, 4).map(Number);

  // Enforced rather than documented: overflowing a field would silently make
  // the build number non-monotonic, and the symptom (a rejected submission,
  // or an APK that refuses to install over its predecessor) shows up far from
  // the cause. See the plan's §3.6 rule 2.
  if (minor > MINOR_MAX) {
    throw new Error(`version minor must be <= ${MINOR_MAX}; got ${minor}.`);
  }
  if (patch > PATCH_MAX) {
    throw new Error(`version patch must be <= ${PATCH_MAX}; got ${patch}.`);
  }

  return { major, minor, patch };
}

function parseCounter(raw) {
  // Absent means a local build: counter 0, so every local build is
  // <version>000 — instantly recognisable, and unable to collide with a CI
  // build, whose github.run_number is always >= 1. See §3.6 rules 4 and 5.
  if (raw === undefined || raw === "") return 0;

  const counter = Number(raw);
  if (!Number.isInteger(counter) || counter < 0) {
    throw new Error(`${COUNTER_ENV} must be a non-negative integer; got "${raw}".`);
  }
  if (counter > COUNTER_MAX) {
    throw new Error(`${COUNTER_ENV} must be <= ${COUNTER_MAX}; got ${counter}.`);
  }

  return counter;
}

/** Computes the build number for an explicit version and counter. */
function computeBuildNumber(version, counterRaw) {
  const { major, minor, patch } = parseVersion(version);
  const counter = parseCounter(counterRaw);
  return ((major * 100 + minor) * 100 + patch) * 1000 + counter;
}

/** Resolves version and build number for the current working tree. */
function resolveVersionInfo() {
  const packageJsonPath = path.resolve(__dirname, "..", "package.json");
  // Re-read rather than caching: app.config.js can be evaluated more than once
  // in a single process, and a stale version here would be invisible.
  delete require.cache[require.resolve(packageJsonPath)];
  const { version } = require(packageJsonPath);

  const counter = parseCounter(process.env[COUNTER_ENV]);

  return {
    version,
    counter,
    buildNumber: computeBuildNumber(version, counter),
  };
}

module.exports = {
  COUNTER_ENV,
  computeBuildNumber,
  resolveVersionInfo,
};
