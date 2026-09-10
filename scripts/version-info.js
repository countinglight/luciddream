#!/usr/bin/env node

/**
 * Reports the marketing version and the build number for the current working
 * tree — the numbers a release will actually carry. Reads only files on disk
 * and the LUCIDDREAM_BUILD environment variable; no network, no Expo login.
 *
 *   npm run version:info            human-readable
 *   npm run version:info -- --json  for consumption by other build scripts
 *
 * Shares scripts/build-number.js with app.config.js, so what this prints is by
 * construction what Expo, Gradle and EAS will use — not a reimplementation
 * that can drift. See doc/plans/luciddream-ios-support-plan.md §3.7.
 */

const { COUNTER_ENV, resolveVersionInfo } = require("./build-number");

function main() {
  const { version, counter, buildNumber } = resolveVersionInfo();
  const isLocal = process.env[COUNTER_ENV] === undefined || process.env[COUNTER_ENV] === "";

  if (process.argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ version, counter, buildNumber, local: isLocal })}\n`,
    );
    return;
  }

  console.log(`version      ${version}      (package.json — iOS CFBundleShortVersionString, Android versionName)`);
  console.log(`buildNumber  ${buildNumber}   (iOS CFBundleVersion, Android versionCode)`);
  console.log(`counter      ${counter}${isLocal ? `        (${COUNTER_ENV} unset — local build)` : `       (from ${COUNTER_ENV})`}`);

  if (isLocal) {
    console.log(
      `\nLocal builds always use counter 0. Never upload one to App Store Connect\n` +
        `or Play — the store rejects a duplicate build number. Releases come from CI,\n` +
        `which sets ${COUNTER_ENV} from the workflow run number.`,
    );
  }
}

main();
