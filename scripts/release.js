#!/usr/bin/env node

/**
 * Prepares a release: checks the tree, sets `version` in package.json, commits
 * and tags. It never pushes — pushing is the owner's call, and the push is what
 * actually triggers the two release workflows, so it stays a separate,
 * deliberate act. The command to run is printed at the end.
 *
 *   npm run release -- 0.6.1        an explicit version
 *   npm run release -- patch        0.6.0 -> 0.6.1
 *   npm run release -- minor        0.6.0 -> 0.7.0
 *   npm run release -- major        0.6.0 -> 1.0.0
 *   npm run release -- patch --dry-run
 *
 * Pushing the tag runs release-android.yml (EAS build -> APK on a GitHub
 * Release) and release-ios.yml (EAS build -> TestFlight). Merging into
 * `deploy`, which publishes the website and the web app, is unrelated and
 * stays manual.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { computeBuildNumber } = require("./build-number");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function nextVersion(current, request) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (request === "major") return `${major + 1}.0.0`;
  if (request === "minor") return `${major}.${minor + 1}.0`;
  if (request === "patch") return `${major}.${minor}.${patch + 1}`;

  if (!/^\d+\.\d+\.\d+$/.test(request)) {
    fail(
      `"${request}" is neither major, minor, patch nor a major.minor.patch version.`,
    );
  }
  return request;
}

function isNewer(next, current) {
  const a = next.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const request = args.find((a) => !a.startsWith("--"));
  if (!request) {
    fail("Usage: npm run release -- <major|minor|patch|x.y.z> [--dry-run]");
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
  const current = pkg.version;
  const version = nextVersion(current, request);
  const tag = `v${version}`;

  if (!isNewer(version, current)) {
    fail(`${version} is not newer than the current ${current}.`);
  }

  // A dirty tree would leave the tag pointing at a commit that does not
  // contain the release, and the workflows check the tag against package.json.
  const status = git("status", "--porcelain");
  if (status) {
    fail(
      `The working tree has uncommitted changes:\n${status}\n\nCommit or stash them first.`,
    );
  }

  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch === "deploy") {
    fail(
      "Never release from `deploy`: it is deployment-only (see AGENTS.md). Switch to the release branch.",
    );
  }

  const tags = git("tag", "--list");
  for (const existing of [tag, version]) {
    if (tags.split("\n").includes(existing)) {
      fail(`Tag ${existing} already exists. Choose another version.`);
    }
  }

  // The build number the workflows will stamp uses their run counter; the
  // floor shown here is the local value, with counter 0.
  const buildFloor = computeBuildNumber(version, 0);
  const notes = path.join("doc", "release", `v${version}.md`);
  const hasNotes = fs.existsSync(path.join(ROOT, notes));

  console.log(`  branch        ${branch}`);
  console.log(`  version       ${current} -> ${version}`);
  console.log(`  tag           ${tag}`);
  console.log(`  build number  ${buildFloor} + the workflow run number`);
  console.log(
    `  release notes ${hasNotes ? notes : `${notes} (missing — notes will be generated from commits)`}`,
  );

  if (dryRun) {
    console.log("\nDry run: nothing changed.");
    return;
  }

  pkg.version = version;
  fs.writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
  git("add", "--", "package.json");
  git("commit", "-m", version);
  git("tag", "-a", tag, "-m", version);

  console.log(`\nCommitted and tagged ${tag}. Nothing is pushed yet.`);
  console.log("\nPush when ready — this is what starts both releases:\n");
  console.log(`  git push origin ${branch} --follow-tags\n`);
  console.log(
    "Then: release-android.yml publishes the APK on a GitHub Release, and\nrelease-ios.yml submits the build to TestFlight.",
  );
}

main();
