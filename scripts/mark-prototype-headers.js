#!/usr/bin/env node

// Adds a noindex rule to the exported web build right before it is uploaded to
// the luciddream-prototype Worker. A production build re-exports dist/ from
// public/, which drops this rule again, so it can't leak into luciddream-web.

const fs = require("fs");
const path = require("path");

const distPath = path.join(process.cwd(), "dist");
const headersPath = path.join(distPath, "_headers");
const marker = "# prototype: keep out of search engines";

if (!fs.existsSync(distPath)) {
  console.error("dist/ not found. Run npm run build:web first.");
  process.exit(1);
}

const existing = fs.existsSync(headersPath)
  ? fs.readFileSync(headersPath, "utf8")
  : "";

if (!existing.includes(marker)) {
  const rule = `${marker}\n/*\n  X-Robots-Tag: noindex, nofollow\n`;
  const next = existing.trim() ? `${existing.trimEnd()}\n\n${rule}` : rule;
  fs.writeFileSync(headersPath, next);
}

console.log("Marked dist/ as a prototype build (X-Robots-Tag: noindex).");
