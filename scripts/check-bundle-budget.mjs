#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = join(projectRoot, "dist/index.html");
const budgetBytes = 480_000;
const budgetKilobytes = (budgetBytes / 1000).toFixed(2);

let html;
try {
  html = readFileSync(distIndex, "utf8");
} catch {
  console.error("Bundle budget check requires a completed pnpm build (dist/index.html is missing).");
  process.exit(1);
}

const entryPath = html.match(/<script[^>]+type="module"[^>]+src="[^"]*\/assets\/(index-[^"]+\.js)"/)?.[1];
if (!entryPath) {
  console.error("Unable to identify the Vite business entry chunk from dist/index.html.");
  process.exit(1);
}

const entryFile = join(projectRoot, "dist/assets", basename(entryPath));
const entryBytes = statSync(entryFile).size;
const kilobytes = (entryBytes / 1000).toFixed(2);

if (entryBytes > budgetBytes) {
  console.error(`Business entry chunk exceeds the ${budgetKilobytes} kB budget: ${kilobytes} kB (${entryFile}).`);
  process.exit(1);
}

console.log(`Bundle budget passed: ${kilobytes} kB / ${budgetKilobytes} kB (${basename(entryFile)}).`);
