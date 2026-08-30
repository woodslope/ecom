import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { installApiRuntimeSettings, startMockAiServer } from "./fixtures/mock-ai-server.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mockServer = await startMockAiServer();

async function openPort() {
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((done) => server.close(done));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`本地预览未能在 15 秒内启动：${url}`);
}

const externalBaseUrl = process.env.E2E_BASE_URL;
const port = externalBaseUrl ? null : await openPort();
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}/`;
const vite = externalBaseUrl ? null : spawn(
  process.execPath,
  [resolve(projectRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: projectRoot, stdio: "ignore" },
);
const evidenceDir = resolve(
  process.env.ECOM_EVIDENCE_DIR ?? resolve(projectRoot, "artifacts/cross-platform-ais"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function capture(page, fileName) {
  await page.screenshot({ path: resolve(evidenceDir, fileName), animations: "disabled" });
}

async function drawMask(page) {
  const canvas = page.getByLabel("遮罩编辑画布", { exact: true });
  const box = await canvas.boundingBox();
  assert(box, "遮罩画布不可见");
  const start = { x: box.x + box.width * 0.36, y: box.y + box.height * 0.48 };
  const end = { x: box.x + box.width * 0.62, y: box.y + box.height * 0.58 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  const selectedPixels = await canvas.evaluate((element) => {
    const context = element.getContext("2d");
    if (!context) return 0;
    const data = context.getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) count += 1;
    }
    return count;
  });
  assert(selectedPixels > 0, "绘制后遮罩画布仍为空");
}

async function resumeAmazonTask(page) {
  if (!(await page.getByRole("heading", { name: "Amazon", exact: true }).count())) {
    await page.getByRole("button", { name: "Amazon", exact: true }).click();
  }
  await page.getByRole("button", { name: "历史记录", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Amazon历史记录", exact: true });
  await history.waitFor({ state: "visible" });
  await history.getByRole("button", { name: "继续任务", exact: true }).first().click();
  await history.waitFor({ state: "hidden" });
  await page.locator(".slot-card").first().waitFor({ state: "attached" });
}

await mkdir(evidenceDir, { recursive: true });
await waitForServer(baseUrl);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
await installApiRuntimeSettings(context, mockServer);
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("status of 503")) runtimeErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400 && !(response.status() === 503 && response.url().includes("/fail-once/"))) {
    runtimeErrors.push(`HTTP ${response.status()}: ${response.url()}`);
  }
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert(await page.evaluate(() => window.devicePixelRatio === 2), "遮罩验收未在 DPR 2 环境运行");
  await page.getByRole("button", { name: "Amazon", exact: true }).click();
  await page.getByLabel("Amazon Listing 原文", { exact: true }).fill(
    "Title: Cloud Travel Neck Pillow\n- Memory foam support\n- Foldable for carry-on",
  );
  await page.getByRole("button", { name: "AI策划", exact: true }).click();
  await page.locator(".slot-card").first().waitFor({ state: "visible" });
  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();
  await page.getByRole("button", { name: "生成图片", exact: true }).click();
  await page.getByRole("img", { name: "PT01 当前生成版本", exact: true }).waitFor();
  assert((await page.locator(".version-tile").count()) === 1, "首次生成没有创建 V1");

  await page.getByRole("button", { name: "版本", exact: true }).click();
  await page.getByRole("button", { name: "局部编辑", exact: true }).click();
  const maskDialog = page.getByRole("dialog", { name: "局部编辑", exact: true });
  await maskDialog.waitFor({ state: "visible" });
  assert(await maskDialog.getByRole("button", { name: "保存编辑", exact: true }).isDisabled(), "空遮罩仍可保存");
  await capture(page, "task11-mask-default-1280.png");
  await drawMask(page);
  await maskDialog.getByLabel("局部编辑要求", { exact: true }).fill("保留商品主体，修正局部光线。");
  assert(!(await maskDialog.getByRole("button", { name: "保存编辑", exact: true }).isDisabled()), "绘制后仍不能保存");
  await capture(page, "task11-mask-drawn-1280.png");

  await page.evaluate((imageBaseUrl) => {
    const key = "ecom-workbench.runtime-settings.api.v1";
    const raw = localStorage.getItem(key);
    const settings = raw ? JSON.parse(raw) : null;
    if (settings?.image) {
      settings.image.baseUrl = `${imageBaseUrl}/fail-once/v1`;
      localStorage.setItem(key, JSON.stringify(settings));
    }
  }, mockServer.baseUrl);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await resumeAmazonTask(page);
  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();
  await page.getByRole("button", { name: "版本", exact: true }).click();
  await page.getByRole("button", { name: "局部编辑", exact: true }).click();
  await drawMask(page);
  await page.getByRole("dialog", { name: "局部编辑", exact: true }).getByLabel("局部编辑要求", { exact: true }).fill("保留商品主体，修正局部光线。");
  await page.getByRole("button", { name: "保存编辑", exact: true }).click();
  await page.getByText("局部编辑未保存，旧版本仍保持可用。", { exact: true }).waitFor();
  assert((await page.locator(".version-tile").count()) === 1, "编辑失败追加或覆盖了版本");
  await capture(page, "task11-mask-error-1280.png");

  await page.getByRole("button", { name: "保存编辑", exact: true }).click();
  await page.getByRole("dialog", { name: "局部编辑", exact: true }).waitFor({ state: "hidden" });
  assert((await page.locator(".version-tile").count()) === 2, "编辑重试没有追加 V2");
  await page.locator(".version-tile").first().click();
  await page.locator('.version-tile[aria-pressed="true"]').filter({ hasText: "V1" }).waitFor({ state: "visible" });
  assert((await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true", "V1 无法重新激活");
  await page.locator(".version-tile").nth(1).click();
  await page.locator('.version-tile[aria-pressed="true"]').filter({ hasText: "V2" }).waitFor({ state: "visible" });
  assert((await page.locator(".version-tile").nth(1).getAttribute("aria-pressed")) === "true", "V2 无法重新激活");
  await capture(page, "task11-mask-saved-v2-1280.png");

  await page.setViewportSize({ width: 1200, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  assert(!overflow, "1200px 遮罩编辑结果态出现横向溢出");
  await capture(page, "task11-mask-saved-v2-1200.png");
  assert(runtimeErrors.length === 0, `浏览器出现运行错误：${runtimeErrors.join(" | ")}`);
  console.log("Task 11 browser evidence passed:");
  console.log([
    "task11-mask-default-1280.png",
    "task11-mask-drawn-1280.png",
    "task11-mask-error-1280.png",
    "task11-mask-saved-v2-1280.png",
    "task11-mask-saved-v2-1200.png",
  ].join("\n"));
} finally {
  await context.close();
  await browser.close();
  vite?.kill("SIGTERM");
  await mockServer.close();
}
