import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5192/";
const evidenceDir = resolve("artifacts/cross-platform-ais");

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

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(message.text());
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "资料库", exact: true }).click();
  await page.getByRole("button", { name: "新建商品", exact: true }).first().click();
  const projectDialog = page.getByRole("dialog", { name: "新建商品资料", exact: true });
  await projectDialog.getByLabel("资料名称", { exact: true }).fill("任务 11 遮罩验收");
  await projectDialog.getByLabel("商品名称", { exact: true }).fill("云感旅行颈枕");
  await projectDialog.getByLabel("品类", { exact: true }).fill("旅行用品");
  await projectDialog.getByLabel("核心卖点", { exact: true }).fill("慢回弹承托\n可折叠收纳");
  await projectDialog.getByRole("button", { name: "创建资料", exact: true }).click();
  await page.getByRole("tab", { name: "平台进度", exact: true }).click();
  await page.locator('button[data-workflow-id="amazon-listing"]').click();
  await page.getByLabel("Amazon Listing 原文", { exact: true }).fill(
    "Title: Cloud Travel Neck Pillow\n- Memory foam support\n- Foldable for carry-on",
  );
  await page.getByRole("button", { name: "生成图片策划", exact: true }).click();
  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();
  await page.getByRole("button", { name: "生成图片", exact: true }).click();
  await page.getByRole("img", { name: "PT01 当前生成版本", exact: true }).waitFor();
  assert((await page.locator(".version-tile").count()) === 1, "首次生成没有创建 V1");

  await page.getByRole("button", { name: "局部编辑", exact: true }).click();
  const maskDialog = page.getByRole("dialog", { name: "局部编辑", exact: true });
  await maskDialog.waitFor({ state: "visible" });
  assert(await maskDialog.getByRole("button", { name: "保存编辑", exact: true }).isDisabled(), "空遮罩仍可保存");
  await capture(page, "task11-mask-default-1280.png");
  await drawMask(page);
  assert(!(await maskDialog.getByRole("button", { name: "保存编辑", exact: true }).isDisabled()), "绘制后仍不能保存");
  await capture(page, "task11-mask-drawn-1280.png");

  await page.goto(`${baseUrl}?fixture=image-fail-once`, { waitUntil: "networkidle" });
  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();
  await page.getByRole("button", { name: "局部编辑", exact: true }).click();
  await drawMask(page);
  await page.getByRole("button", { name: "保存编辑", exact: true }).click();
  await page.getByText("局部编辑未保存，旧版本仍保持可用。", { exact: true }).waitFor();
  assert((await page.locator(".version-tile").count()) === 1, "编辑失败追加或覆盖了版本");
  await capture(page, "task11-mask-error-1280.png");

  await page.getByRole("button", { name: "保存编辑", exact: true }).click();
  await page.getByRole("dialog", { name: "局部编辑", exact: true }).waitFor({ state: "hidden" });
  assert((await page.locator(".version-tile").count()) === 2, "编辑重试没有追加 V2");
  await page.locator(".version-tile").first().click();
  assert((await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true", "V1 无法重新激活");
  await page.locator(".version-tile").nth(1).click();
  assert((await page.locator(".version-tile").nth(1).getAttribute("aria-pressed")) === "true", "V2 无法重新激活");
  await capture(page, "task11-mask-saved-v2-1280.png");

  await page.setViewportSize({ width: 900, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  assert(!overflow, "900px 遮罩编辑结果态出现横向溢出");
  await capture(page, "task11-mask-saved-v2-900.png");
  assert(runtimeErrors.length === 0, `浏览器出现运行错误：${runtimeErrors.join(" | ")}`);
  console.log("Task 11 browser evidence passed:");
  console.log([
    "task11-mask-default-1280.png",
    "task11-mask-drawn-1280.png",
    "task11-mask-error-1280.png",
    "task11-mask-saved-v2-1280.png",
    "task11-mask-saved-v2-900.png",
  ].join("\n"));
} finally {
  await browser.close();
}
