#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = join(projectRoot, "artifacts/cross-platform-ais");
const startedAt = new Date();
const runId = startedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-");
const runDirectory = join(evidenceRoot, "runs", runId);
const manifestPath = join(runDirectory, "manifest.json");
const latestPath = join(evidenceRoot, "latest.json");
const packageManagerCli = process.env.npm_execpath;

const allCommandDefinitions = [
  { name: "ui-governance", kind: "pnpm", args: ["check:ui"] },
  { name: "typecheck", kind: "pnpm", args: ["typecheck"] },
  { name: "unit-tests", kind: "pnpm", args: ["test"] },
  { name: "production-build", kind: "pnpm", args: ["build"] },
  { name: "bundle-budget", kind: "pnpm", args: ["check:bundle"] },
  { name: "subpath-build", kind: "pnpm", args: ["build"], env: { VITE_BASE_PATH: "/ecom/" } },
  { name: "browser-smoke", kind: "node", args: ["tests/browser-smoke.mjs"] },
  { name: "browser-checkpoint-b", kind: "node", args: ["tests/browser-checkpoint-b.mjs"] },
  { name: "browser-task11", kind: "node", args: ["tests/browser-task11.mjs"] },
];
const suite = process.argv.includes("--smoke-only")
  ? "browser-smoke"
  : process.argv.includes("--browser-only") ? "browser-governance" : "full-acceptance";
const commandDefinitions = suite === "browser-smoke"
  ? allCommandDefinitions.filter(({ name }) => name === "browser-smoke")
  : suite === "browser-governance"
    ? allCommandDefinitions.filter(({ name }) => name.startsWith("browser-"))
    : allCommandDefinitions;

function processSpec(definition) {
  if (definition.kind === "node") {
    return {
      executable: process.execPath,
      args: definition.args.map((argument) => join(projectRoot, argument)),
      display: `node ${definition.args.join(" ")}`,
    };
  }
  if (packageManagerCli) {
    return {
      executable: process.execPath,
      args: [packageManagerCli, ...definition.args],
      display: `pnpm ${definition.args.join(" ")}`,
    };
  }
  return {
    executable: "pnpm",
    args: definition.args,
    display: `pnpm ${definition.args.join(" ")}`,
  };
}

async function runProcess(executable, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(executable, args, {
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      if (!options.quiet) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      if (!options.quiet) process.stderr.write(text);
    });
    child.on("error", (error) => resolveRun({ exitCode: 1, output: `${output}\n${error.message}` }));
    child.on("exit", (code) => resolveRun({ exitCode: code ?? 1, output }));
  });
}

async function capture(executable, args) {
  const result = await runProcess(executable, args, { env: { NO_COLOR: "1" }, quiet: true });
  return result.exitCode === 0 ? result.output.trim() : null;
}

async function listFiles(directory, extension) {
  const collected = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (!extension || entry.name.endsWith(extension)) collected.push(fullPath);
    }
  }
  try {
    await visit(directory);
  } catch {
    return [];
  }
  return collected.sort();
}

async function dependencyVersion(name) {
  try {
    const contents = await readFile(join(projectRoot, "node_modules", name, "package.json"), "utf8");
    return JSON.parse(contents).version ?? null;
  } catch {
    return null;
  }
}

async function bundleEvidence() {
  try {
    const html = await readFile(join(projectRoot, "dist/index.html"), "utf8");
    const fileName = html.match(/<script[^>]+type="module"[^>]+src="[^"]*\/assets\/(index-[^"]+\.js)"/)?.[1];
    if (!fileName) return null;
    const bytes = (await stat(join(projectRoot, "dist/assets", fileName))).size;
    return { file: fileName, bytes, kilobytes: Number((bytes / 1000).toFixed(2)), budgetKilobytes: 480 };
  } catch {
    return null;
  }
}

await mkdir(runDirectory, { recursive: true });

const commandResults = [];
let failed = false;
let unitOutput = "";

for (const definition of commandDefinitions) {
  const processDefinition = processSpec(definition);
  if (failed) {
    commandResults.push({ name: definition.name, command: processDefinition.display, status: "skipped" });
    continue;
  }
  const commandStartedAt = Date.now();
  console.log(`\n[UI acceptance] ${processDefinition.display}`);
  const result = await runProcess(processDefinition.executable, processDefinition.args, {
    env: {
      ...definition.env,
      ECOM_EVIDENCE_DIR: runDirectory,
      ECOM_EVIDENCE_RUN_ID: runId,
      NO_COLOR: "1",
    },
  });
  const status = result.exitCode === 0 ? "passed" : "failed";
  commandResults.push({
    name: definition.name,
    command: processDefinition.display,
    status,
    exitCode: result.exitCode,
    durationMs: Date.now() - commandStartedAt,
  });
  if (definition.name === "unit-tests") unitOutput = result.output;
  if (result.exitCode !== 0) failed = true;
}

const completedAt = new Date();
const screenshots = (await listFiles(runDirectory, ".png")).map((file) => relative(runDirectory, file));
const testFiles = Number(unitOutput.match(/Test Files\s+(\d+) passed/)?.[1] ?? 0) || null;
const tests = Number(unitOutput.match(/Tests\s+(\d+) passed/)?.[1] ?? 0) || null;
const gitCommit = await capture("git", ["rev-parse", "HEAD"]);
const gitStatus = await capture("git", ["status", "--porcelain"]);
const pnpmVersion = await capture(
  packageManagerCli ? process.execPath : "pnpm",
  packageManagerCli ? [packageManagerCli, "--version"] : ["--version"],
);
const manifest = {
  schemaVersion: 1,
  runId,
  suite,
  status: failed ? "failed" : "passed",
  startedAt: startedAt.toISOString(),
  completedAt: completedAt.toISOString(),
  durationMs: completedAt.getTime() - startedAt.getTime(),
  git: { commit: gitCommit, dirty: Boolean(gitStatus) },
  environment: {
    node: process.version,
    pnpm: pnpmVersion,
    platform: `${process.platform}-${process.arch}`,
    playwright: await dependencyVersion("playwright"),
    vite: await dependencyVersion("vite"),
    typescript: await dependencyVersion("typescript"),
  },
  supportContract: {
    desktopMinimumCssPixels: 900,
    visualTheme: "light-only",
    browserEngine: "Chromium",
  },
  coverage: {
    viewports: ["1600x900", "1366x768", "1280x800", "1200x800", "900x800", "900x650", "899x800 gate"],
    conditions: ["dark system preference", "reduced motion", "forced colors", "DPR 2", "125% zoom equivalent (1024 CSS px / DPR 1.25)"],
    flows: [
      "Amazon and Taobao empty/planned/history",
      "history 120-record pagination and transient retry",
      "shared modal isolation and focus return",
      "Amazon localization, A+, generation recovery and versioning",
      "mask editing failure/retry",
      "Taobao fixed 5+7 preview",
      "cross-tab generation lock, cancellation signal, and owner-tab close release",
      "lazy-loaded history and local backup export",
    ],
  },
  verification: {
    testFiles,
    tests,
    bundle: suite === "full-acceptance" ? await bundleEvidence() : null,
    screenshotCount: screenshots.length,
  },
  commands: commandResults,
  screenshots,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await mkdir(evidenceRoot, { recursive: true });
await writeFile(latestPath, `${JSON.stringify({
  schemaVersion: 1,
  runId,
  suite,
  status: manifest.status,
  completedAt: manifest.completedAt,
  manifest: relative(evidenceRoot, manifestPath),
}, null, 2)}\n`, "utf8");

console.log(`\nUI acceptance ${manifest.status}: ${relative(projectRoot, manifestPath)}`);
process.exit(failed ? 1 : 0);
