#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const filesWithCrLf = files.filter((file) => {
  const contents = fs.readFileSync(file);
  if (contents.includes(0)) {
    return false;
  }

  for (let index = 0; index < contents.length - 1; index += 1) {
    if (contents[index] === 13 && contents[index + 1] === 10) {
      return true;
    }
  }
  return false;
});

if (filesWithCrLf.length > 0) {
  console.error("CRLF line endings found in:");
  for (const file of filesWithCrLf) {
    console.error(`- ${file}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${files.length} tracked text files: all use LF line endings.`,
  );
}
