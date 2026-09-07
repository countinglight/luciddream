#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const generatedPaths = [
  ".expo",
  "android/.gradle",
  "android/.cxx",
  "android/app/build",
  "android/build",
  "coverage",
  "dist",
  "web-build",
];

for (const relativePath of generatedPaths) {
  const targetPath = path.join(root, relativePath);
  fs.rmSync(targetPath, { recursive: true, force: true });
  console.log(`Removed ${relativePath}`);
}

console.log(
  "Build cleanup complete. Source files and uncommitted documents were left untouched.",
);
