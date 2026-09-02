#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).split("\0").filter(Boolean);
  } catch (error) {
    fail(`无法读取 Git 跟踪列表：${error instanceof Error ? error.message : "未知错误"}`);
    return [];
  }
}

const files = trackedFiles().filter((file) => existsSync(join(projectRoot, file)));
const fileSet = new Set(files);

const forbiddenTrackedPatterns = [
  /^dist\//,
  /^artifacts\//,
  /^node_modules\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)\.claude\//,
  /(^|\/)\.env(?:\.|$)/,
  /\.tsbuildinfo$/,
  /(?:^|\/)(?:playwright-report|test-results)\//,
  /\.log$/,
];

for (const file of files) {
  if (forbiddenTrackedPatterns.some((pattern) => pattern.test(file))) {
    fail(`禁止将本地产物或本机文件提交到 Git：${file}`);
  }
}

const documentationFiles = files.filter((file) => /\.md$/i.test(file));
const documentedPathPattern = /(?:^|[`(\s])((?:src|tests|scripts|docs|public|\.github)\/[A-Za-z0-9._/*<>-]+)/g;

for (const file of documentationFiles) {
  const content = read(join(projectRoot, file));
  if (content === null) continue;
  for (const match of content.matchAll(documentedPathPattern)) {
    const documentedPath = match[1].replace(/[),.;:]+$/, "");
    if (
      documentedPath.includes("*") ||
      documentedPath.includes("<") ||
      documentedPath.includes(">") ||
      documentedPath.includes("...")
    ) {
      continue;
    }
    if (!existsSync(join(projectRoot, documentedPath))) {
      fail(`${file} 引用了不存在的仓库路径：${documentedPath}`);
    }
  }
}

const sourceFiles = files.filter((file) => /^src\/.+\.(?:ts|tsx)$/i.test(file));
const sourceText = sourceFiles.map((file) => read(join(projectRoot, file)) ?? "").join("\n");
for (const retiredMarker of ["TaskRecord", "taskHistory", "history/examples"]) {
  if (sourceText.includes(retiredMarker)) {
    fail(`源码仍包含已退休标识：${retiredMarker}`);
  }
}

const alignmentPath = join(projectRoot, "AIS_ALIGNMENT_CHECKLIST.md");
if (existsSync(alignmentPath)) {
  const alignment = read(alignmentPath);
  if (/Demo\/API|Demo 模式|设置支持 Demo/i.test(alignment)) {
    fail("AIS_ALIGNMENT_CHECKLIST.md 仍包含与 API-only 运行时冲突的 Demo/API 合同。");
  }
}

const readmePath = join(projectRoot, "README.md");
if (existsSync(readmePath) && read(readmePath).includes("历史区的“流程示例”")) {
  fail("README.md 仍描述已退休的历史流程示例。");
}

function consumerCount(file) {
  const name = file.split("/").at(-1);
  const stem = name?.replace(/\.(?:ts|tsx|mjs|js)$/i, "");
  if (!name || !stem || stem === "index") return null;
  const references = files.filter((candidate) => {
    if (candidate === file) return false;
    return (read(join(projectRoot, candidate)) ?? "").includes(stem);
  });
  return references.length;
}

for (const file of files.filter((candidate) => /^scripts\/.+\.mjs$/i.test(candidate))) {
  const count = consumerCount(file);
  if (count === 0) warn(`脚本没有发现文本消费者，请人工确认职责：${file}`);
}

for (const file of files.filter((candidate) => /^src\/(?:components|domain)\/.+\.(?:ts|tsx)$/i.test(candidate))) {
  const count = consumerCount(file);
  if (count === 0) warn(`模块没有发现文本消费者，请人工确认入口或 export：${file}`);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log(`Repository hygiene passed (${fileSet.size} tracked files checked).`);
