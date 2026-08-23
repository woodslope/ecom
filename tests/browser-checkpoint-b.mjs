import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(
  process.env.ECOM_EVIDENCE_DIR ?? resolve(projectRoot, "artifacts/cross-platform-ais"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoUnexpectedErrors(errors) {
  assert(errors.length === 0, errors.join("\n"));
}

async function findOpenPort() {
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`本地预览未能启动：${url}`);
}

async function openAmazonPage(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByTestId("app-frame").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Amazon", exact: true }).click();
  const productPicker = page.getByRole("dialog", {
    name: "切换 Amazon 商品",
    exact: true,
  });
  if (await productPicker.isVisible().catch(() => false)) {
    await productPicker
      .getByRole("button", { name: "手动录入", exact: true })
      .click();
    await productPicker.waitFor({ state: "hidden" });
  }
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });
  return { context, page, errors };
}

async function startAmazonPlanning(page) {
  await page.getByRole("button", { name: "生成图片策划", exact: true }).click();
  const draftDialog = page.getByRole("dialog", {
    name: "创建 Amazon 草稿商品？",
    exact: true,
  });
  try {
    await draftDialog.waitFor({ state: "visible", timeout: 1_500 });
    await draftDialog.getByRole("button", { name: "创建草稿商品", exact: true }).click();
    await draftDialog.waitFor({ state: "hidden" });
  } catch {
    // A selected product does not need the one-time draft confirmation.
  }
  const localizedFactsReview = page.getByRole("region", {
    name: "站点语言草稿",
    exact: true,
  });
  const slotCard = page.locator(".slot-card").first();
  const planningError = page.locator(".status-message--danger").first();
  let outcome = await Promise.race([
    localizedFactsReview.waitFor({ state: "visible" }).then(() => "review"),
    slotCard.waitFor({ state: "visible" }).then(() => "planned"),
    planningError.waitFor({ state: "visible" }).then(() => "error"),
  ]);
  if (outcome === "error") {
    const message = await planningError.innerText();
    if (message.includes("站点语言草稿")) {
      await localizedFactsReview.waitFor({ state: "visible" });
      outcome = "review";
    } else {
      throw new Error(`Amazon 策划失败：${message}`);
    }
  }
  if (outcome === "review") {
    await localizedFactsReview
      .getByRole("button", { name: "确认并生成策划", exact: true })
      .click();
    const confirmedOutcome = await Promise.race([
      slotCard.waitFor({ state: "visible" }).then(() => "planned"),
      planningError.waitFor({ state: "visible" }).then(() => "error"),
    ]);
    if (confirmedOutcome === "error") {
      throw new Error(`Amazon 策划失败：${await planningError.innerText()}`);
    }
  }
}

async function openParameterEditor(page) {
  const parameterDetails = page.locator("details.task-advanced-settings").first();
  if (await parameterDetails.isVisible().catch(() => false)) {
    await parameterDetails.evaluate((element) => {
      if (element instanceof HTMLDetailsElement) element.open = true;
    });
    return;
  }
  const adjustButton = page.getByRole("button", { name: "调整参数", exact: true });
  if (await adjustButton.isVisible().catch(() => false)) {
    await adjustButton.click();
    return;
  }
  const taskSettings = page.getByText("任务设置", { exact: true });
  if (await taskSettings.isVisible().catch(() => false)) {
    await taskSettings.click();
    return;
  }
  const advancedSettings = page.getByText("高级设置", { exact: true });
  if (await advancedSettings.isVisible().catch(() => false)) await advancedSettings.click();
}

async function openListingInput(page) {
  const advancedSettings = page.locator("details.task-advanced-settings").first();
  if (await advancedSettings.isVisible().catch(() => false)) {
    await advancedSettings.evaluate((element) => {
      if (element instanceof HTMLDetailsElement) element.open = false;
    });
  }
  const details = page.locator("details.planning-source-paste").first();
  await details.waitFor({ state: "attached" });
  await details.scrollIntoViewIfNeeded().catch(() => {});
  await details.evaluate((element) => {
    if (element instanceof HTMLDetailsElement) element.open = true;
  });
  const textarea = page.getByLabel("Amazon Listing 原文", { exact: true });
  await textarea.scrollIntoViewIfNeeded().catch(() => {});
  await textarea.waitFor({ state: "visible" });
}

async function resumeCurrentTask(page) {
  await page.getByRole("button", { name: "历史记录", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Amazon历史记录", exact: true });
  await history.waitFor({ state: "visible" });
  await history.getByRole("button", { name: "继续任务", exact: true }).first().click();
  await page.locator(".slot-card").first().waitFor({ state: "attached" });
  await history.getByRole("button", { name: "关闭历史记录", exact: true }).click();
  await history.waitFor({ state: "hidden" });
}

async function planMarketplace(browser, baseUrl, marketplaceId, expectedCopy, screenshotName) {
  const { context, page, errors } = await openAmazonPage(browser, baseUrl);
  await openParameterEditor(page);
  await page.getByLabel("目标站点", { exact: true }).selectOption(marketplaceId);
  await openListingInput(page);
  await page.getByLabel("Amazon Listing 原文", { exact: true }).fill(
    "Title: Northwind Travel Pillow\n\nAbout this item\n- Washable cover\n- 28 x 25 x 12 cm\n\nSKU: NW-P01",
  );
  await page.getByRole("button", { name: "填入空字段", exact: true }).click();
  await startAmazonPlanning(page);
  await page.locator(".slot-card").filter({ hasText: "PT01" }).waitFor({ state: "visible" });
  await openParameterEditor(page);
  await page.getByRole("button", { name: "手机预览", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Amazon 手机内容预览", exact: true });
  await preview.waitFor({ state: "visible" });
  assert(
    (await preview.locator('[aria-label^="查看 "]').count()) === 7,
    `${marketplaceId} Listing 手机预览缩略图数量不正确`,
  );
  assert((await preview.innerText()).includes("还需完成 7 个槽位"), `${marketplaceId} Listing 缺失提示不正确`);
  await preview.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();
  const visibleCopy = await page.getByLabel("可见文案", { exact: true }).inputValue();
  assert(visibleCopy === expectedCopy, `${marketplaceId} 可见文案未本地化：${visibleCopy}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  assert(!overflow, `${marketplaceId} 页面出现横向溢出`);
  assertNoUnexpectedErrors(errors);
  await page.screenshot({
    path: resolve(evidenceDir, screenshotName),
    fullPage: false,
    animations: "disabled",
  });
  await context.close();
}

async function verifyAPlusWorkflow(browser, baseUrl) {
  const { context, page, errors } = await openAmazonPage(browser, baseUrl);
  await openParameterEditor(page);
  await page.getByRole("button", { name: "A+ 图", exact: true }).click();
  await page.getByLabel("A+ 类型", { exact: true }).selectOption("standard-large");
  await page.getByRole("button", { name: "编排模块", exact: true }).click();
  assert(await page.locator(".aplus-module-arrange__row").count() === 5, "普通A+ 默认模块数不是 5");
  await page.screenshot({
    path: resolve(evidenceDir, "task5-aplus-standard-large-prepare-1280.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "取消", exact: true }).click();

  await page.getByLabel("A+ 类型", { exact: true }).selectOption("standard");
  await page.getByRole("button", { name: "编排模块", exact: true }).click();
  assert(await page.locator(".aplus-module-arrange__row").count() === 8, "标准A+ 默认模块数不是 8");
  await page.screenshot({
    path: resolve(evidenceDir, "task5-aplus-standard-prepare-1280.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "应用编排", exact: true }).click();

  await openListingInput(page);
  await page.getByLabel("Amazon Listing 原文", { exact: true }).fill(
    "Title: Northwind Travel Pillow\n\nAbout this item\n- Washable cover\n- 28 x 25 x 12 cm\n\nSKU: NW-P01",
  );
  await page.getByRole("button", { name: "填入空字段", exact: true }).click();
  await startAmazonPlanning(page);
  await page.locator(".slot-card").filter({ hasText: "A+S05" }).waitFor({ state: "visible" });
  await page.locator(".slot-card").filter({ hasText: "A+S05" }).click();
  const titleField = page.getByLabel("外部标题（图片外）", { exact: true });
  const bodyField = page.getByLabel("外部正文（图片外）", { exact: true });
  assert(await titleField.isVisible(), "A+S05 未显示图片外标题");
  assert(await bodyField.isVisible(), "A+S05 未显示图片外正文");
  assert((await page.getByLabel("可见文案", { exact: true }).count()) === 0, "方块模块仍显示图片内可见文案");
  await page.getByRole("button", { name: "复制外部文案", exact: true }).click();
  await page.getByText("外部标题与正文已复制。", { exact: true }).waitFor({ state: "visible" });
  await titleField.fill("Verified washable cover");
  await bodyField.fill("The removable cover supports easier routine care.");
  await page.getByRole("button", { name: "保存外部文案与提示词", exact: true }).click();
  await page.getByText("用户编辑：槽位草稿已保存。", { exact: true }).waitFor({ state: "visible" });
  await page.screenshot({
    path: resolve(evidenceDir, "task5-aplus-external-copy-1280.png"),
    fullPage: false,
    animations: "disabled",
  });

  await page.reload({ waitUntil: "networkidle" });
  if (!(await page.getByRole("heading", { name: "Amazon", exact: true }).count())) {
    await page.getByRole("button", { name: "Amazon", exact: true }).click();
  }
  await resumeCurrentTask(page);
  await page.getByLabel("外部标题（图片外）", { exact: true }).waitFor({ state: "visible" });
  assert(
    (await page.getByLabel("外部标题（图片外）", { exact: true }).inputValue()) ===
      "Verified washable cover",
    "reload 后外部标题未恢复",
  );
  assert(
    (await page.getByLabel("外部正文（图片外）", { exact: true }).inputValue()) ===
      "The removable cover supports easier routine care.",
    "reload 后外部正文未恢复",
  );

  await openParameterEditor(page);
  await page.getByRole("button", { name: "编排模块", exact: true }).click();
  await page.getByRole("dialog", { name: "编排 A+ 模块", exact: true }).waitFor({ state: "visible" });
  await page.screenshot({
    path: resolve(evidenceDir, "task5-aplus-module-dialog-1280.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "在第 1 行后添加同尺寸模块", exact: true }).click();
  await page.getByRole("button", { name: "应用编排", exact: true }).click();
  await page.locator("#plan-freshness-status").waitFor({ state: "visible" });
  assert(
    (await page.locator("#plan-freshness-status").innerText()).includes(
      "Amazon 站点、尺寸或模块编排已变化",
    ),
    "模块改变后的全局 freshness 提示不准确",
  );
  assert(
    !(await page.locator("button.amazon-session-controls__plan").isDisabled()),
    "模块改变后重新策划入口不可用",
  );
  const taskSettings = page.locator("details.task-advanced-settings").first();
  await taskSettings.evaluate((element) => {
    if (element instanceof HTMLDetailsElement) element.open = false;
  });
  assert(!(await taskSettings.getAttribute("open")), "策划过期后参数区无法保持收起");
  assert(
    !(await page.getByLabel("目标站点", { exact: true }).isVisible()),
    "策划过期后参数区被自动展开",
  );
  await openParameterEditor(page);
  await page.getByRole("button", { name: "手机预览", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Amazon 手机内容预览", exact: true });
  await preview.waitFor({ state: "visible" });
  assert(
    (await preview.locator('[data-slot-key^="A+S"]').count()) === 8,
    "A+ 手机预览没有按当前已保存策划展示模块",
  );
  const previewText = await preview.innerText();
  assert(previewText.includes("Verified washable cover"), "A+ 手机预览未显示已有外置标题");
  assert(previewText.includes("The removable cover supports easier routine care."), "A+ 手机预览未显示已有外置正文");
  assert(!previewText.includes("价格") && !previewText.includes("评分"), "A+ 手机预览伪装了商品页未知信息");
  await preview.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.setViewportSize({ width: 1200, height: 800 });
  await openParameterEditor(page);
  const parameterBand = await page.evaluate(() => {
    const main = document.querySelector(".workbench-chrome__main")?.getBoundingClientRect();
    const params = document.querySelector(".amazon-session-controls__params")?.getBoundingClientRect();
    return {
      mainWidth: main?.width ?? 0,
      paramsWidth: params?.width ?? 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert(parameterBand.paramsWidth > 0, "参数带没有渲染可用宽度");
  assert(!parameterBand.overflow, "1200px 下 Amazon 顶栏出现横向溢出");
  await page.setViewportSize({ width: 1280, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  assert(!overflow, "A+ 工作流出现横向溢出");
  assertNoUnexpectedErrors(errors);
  await page.screenshot({
    path: resolve(evidenceDir, "task5-aplus-modules-stale-1280.png"),
    fullPage: false,
    animations: "disabled",
  });
  await context.close();
}

async function assertWorkspaceLayout(page, label) {
  const geometry = await page.evaluate(() => {
    const inspector = document.querySelector(".workbench-panel--inspector")?.getBoundingClientRect();
    const scroll = document.querySelector(".slot-inspector__scroll");
    const footer = document.querySelector(".slot-inspector__chrome-bottom")?.getBoundingClientRect();
    const primary = document
      .querySelector(".slot-inspector__chrome-bottom .button--primary")
      ?.getBoundingClientRect();
    if (scroll instanceof HTMLElement) scroll.scrollTop = scroll.scrollHeight;
    const scrollRect = scroll?.getBoundingClientRect();
    const lastContent = scroll?.lastElementChild?.getBoundingClientRect();
    const result = {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollBeforeFooter: Boolean(scrollRect && footer && scrollRect.bottom <= footer.top + 1),
      footerInsideInspector: Boolean(
        inspector && footer &&
          footer.left >= inspector.left - 1 &&
          footer.right <= inspector.right + 1 &&
          footer.bottom <= inspector.bottom + 1,
      ),
      primaryInsideFooter: Boolean(
        !primary ||
          (footer &&
            primary.left >= footer.left - 1 &&
            primary.right <= footer.right + 1 &&
            primary.top >= footer.top - 1 &&
            primary.bottom <= footer.bottom + 1),
      ),
      contentReachable: Boolean(
        !lastContent || !scrollRect || lastContent.bottom <= scrollRect.bottom + 1,
      ),
    };
    if (scroll instanceof HTMLElement) scroll.scrollTop = 0;
    return result;
  });
  assert(!geometry.overflow, `${label} 出现横向溢出`);
  assert(geometry.scrollBeforeFooter, `${label} 检查区滚动内容与 ActionBar 重叠`);
  assert(geometry.footerInsideInspector, `${label} ActionBar 超出检查器边界`);
  assert(geometry.primaryInsideFooter, `${label} 主动作超出 ActionBar`);
  assert(geometry.contentReachable, `${label} ActionBar 遮挡滚动内容末尾`);
}

async function assertStageState(page, {
  completed,
  stage,
  selectedSlot,
  primaryAction,
  screenshotName,
  errors,
}) {
  const doneCount = await page.locator(".slot-card--done").count();
  const expectedStageLabel = stage.split("·").at(-1)?.trim() ?? stage;
  assert(doneCount === completed, `${completed}/7 状态实际完成 ${doneCount} 个槽位`);
  assert(
    (await page.locator(".workbench-chrome__progress-menu > summary").innerText()).includes(expectedStageLabel),
    `${completed}/7 阶段不正确`,
  );
  assert(
    (await page.locator(".slot-card--selected").innerText()).includes(selectedSlot),
    `${completed}/7 当前槽位不是 ${selectedSlot}`,
  );
  const prompt = await page.getByLabel("模型提示词（英文，可复制）", { exact: true }).inputValue();
  assert(prompt.includes(selectedSlot), `${completed}/7 Prompt 未随 ${selectedSlot} 同步`);
  const primaryButton = page.getByRole("button", { name: primaryAction, exact: true });
  assert(await primaryButton.isVisible(), `${completed}/7 缺少主动作 ${primaryAction}`);
  assert(
    (await primaryButton.getAttribute("class"))?.includes("button--primary"),
    `${completed}/7 的 ${primaryAction} 不是唯一主层级`,
  );
  await assertWorkspaceLayout(page, `${completed}/7`);
  assertNoUnexpectedErrors(errors);
  await page.screenshot({
    path: resolve(evidenceDir, screenshotName),
    fullPage: false,
    animations: "disabled",
  });
}

async function generateSelectedSlot(page, completedAfter, captureLoading = false) {
  const generate = page.getByRole("button", { name: "生成图片", exact: true });
  await generate.click();
  const pendingButton = page.getByRole("button", { name: "正在生成...", exact: true });
  await pendingButton.waitFor({ state: "visible" });
  assert(await pendingButton.isDisabled(), "生成 pending 未阻止重复提交");
  await page.getByRole("button", { name: "取消生成", exact: true }).waitFor({ state: "visible" });
  if (captureLoading) {
    await assertWorkspaceLayout(page, "生成 loading");
    await page.screenshot({
      path: resolve(evidenceDir, "task6-generation-loading-1280.png"),
      fullPage: false,
      animations: "disabled",
    });
  }
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".slot-card--done").length === expected,
    completedAfter,
  );
  await page.getByRole("button", { name: "取消生成", exact: true }).waitFor({ state: "hidden" });
}

async function verifyTask6Workflow(browser, baseUrl) {
  const { context, page, errors } = await openAmazonPage(browser, baseUrl);
  await openListingInput(page);
  await page.getByLabel("Amazon Listing 原文", { exact: true }).fill(
    "Title: Northwind Travel Pillow\n\nAbout this item\n- Washable cover\n- 28 x 25 x 12 cm\n\nSKU: NW-P01",
  );
  await page.getByRole("button", { name: "填入空字段", exact: true }).click();
  await startAmazonPlanning(page);
  await page.locator(".slot-card").filter({ hasText: "MAIN" }).waitFor({ state: "visible" });

  await assertStageState(page, {
    completed: 0,
    stage: "2/4 · 策划检查",
    selectedSlot: "MAIN",
    primaryAction: "生成图片",
    screenshotName: "task6-0-of-7-review-1280.png",
    errors,
  });
  assert((await page.locator(".export-panel").count()) === 0, "0/7 提前显示交付条");

  await generateSelectedSlot(page, 1, true);
  await assertStageState(page, {
    completed: 1,
    stage: "3/4 · 逐图生产",
    selectedSlot: "MAIN",
    primaryAction: "继续下一槽位",
    screenshotName: "task6-1-of-7-produce-1280.png",
    errors,
  });
  assert(
    (await page.getByRole("button", { name: "重新生成", exact: true }).getAttribute("class"))
      ?.includes("button--secondary"),
    "1/7 重生成没有降为 secondary",
  );
  assert(
    (await page.getByRole("button", { name: "导出当前结果", exact: true }).getAttribute("class"))
      ?.includes("button--secondary"),
    "1/7 部分导出没有保持 secondary",
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await assertWorkspaceLayout(page, "1/7 · 1200px");
  assert(
    (await page.locator(".workbench-chrome__progress-menu > summary").innerText()).includes("逐图生产"),
    "1/7 · 1200px 阶段发生变化",
  );
  assertNoUnexpectedErrors(errors);
  await page.screenshot({
    path: resolve(evidenceDir, "task6-1-of-7-produce-1200.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 800 });

  for (let index = 1; index <= 5; index += 1) {
    const slotKey = `PT0${index}`;
    await page.getByRole("button", { name: "继续下一槽位", exact: true }).click();
    await page.locator(".slot-card--selected").filter({ hasText: slotKey }).waitFor({ state: "visible" });
    await generateSelectedSlot(page, index + 1);
  }
  await assertStageState(page, {
    completed: 6,
    stage: "3/4 · 逐图生产",
    selectedSlot: "PT05",
    primaryAction: "继续下一槽位",
    screenshotName: "task6-6-of-7-produce-1280.png",
    errors,
  });

  await page.getByRole("button", { name: "继续下一槽位", exact: true }).click();
  await page.locator(".slot-card--selected").filter({ hasText: "PT06" }).waitFor({ state: "visible" });
  await generateSelectedSlot(page, 7);
  await assertStageState(page, {
    completed: 7,
    stage: "4/4 · 交付检查",
    selectedSlot: "PT06",
    primaryAction: "导出完整交付包",
    screenshotName: "task6-7-of-7-deliver-1280.png",
    errors,
  });
  assert(
    (await page.getByRole("button", { name: "重新生成", exact: true }).getAttribute("class"))
      ?.includes("button--secondary"),
    "7/7 重生成仍在争抢交付主动作",
  );

  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await page.getByRole("button", { name: "版本", exact: true }).click();
  await page.locator(".version-tile").nth(1).waitFor({ state: "visible" });
  await page.locator(".version-tile").first().click();
  await page.locator('.version-tile[aria-pressed="true"]').filter({ hasText: "V1" }).waitFor({
    state: "visible",
  });
  assert(
    (await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true",
    "切换后 V1 未成为活动版本",
  );

  await page.goto(`${baseUrl}?fixture=image-fail-once`, { waitUntil: "networkidle" });
  await page.getByTestId("app-frame").waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });
  await resumeCurrentTask(page);
  await page.getByRole("button", { name: "版本", exact: true }).click();
  assert((await page.locator(".version-tile").count()) === 2, "失败夹具未恢复 V1/V2");
  assert(
    (await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true",
    "失败夹具启动后旧活动版本发生变化",
  );
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  const failure = page.locator(".generation-task-status--error");
  await failure.waitFor({ state: "visible" });
  assert((await failure.innerText()).includes("模拟图片服务失败"), "失败夹具未显示可归属错误");
  assert((await page.locator(".version-tile").count()) === 2, "失败覆盖或追加了历史版本");
  assert(
    (await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true",
    "失败改变了旧活动版本",
  );
  await assertWorkspaceLayout(page, "失败保留");
  assertNoUnexpectedErrors(errors);
  await page.screenshot({
    path: resolve(evidenceDir, "task6-failure-keeps-old-version-1280.png"),
    fullPage: false,
    animations: "disabled",
  });

  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  const thirdVersion = page.locator(".version-tile").nth(2);
  await thirdVersion.waitFor({ state: "attached" });
  assert((await page.locator(".version-tile").count()) === 3, "失败重试未追加 V3");
  await thirdVersion.scrollIntoViewIfNeeded();
  await thirdVersion.click();
  await page.locator('.version-tile[aria-pressed="true"]').filter({ hasText: "V3" }).waitFor({
    state: "visible",
  });
  assert(
    (await thirdVersion.getAttribute("aria-pressed")) === "true",
    "失败重试成功后 V3 无法切换为活动版本",
  );
  await page.screenshot({
    path: resolve(evidenceDir, "task6-failure-retry-success-1280.png"),
    fullPage: false,
    animations: "disabled",
  });

  const firstVersion = page.locator(".version-tile").first();
  await firstVersion.scrollIntoViewIfNeeded();
  await firstVersion.click();
  await page.locator('.version-tile[aria-pressed="true"]').filter({ hasText: "V1" }).waitFor({
    state: "visible",
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });
  await resumeCurrentTask(page);
  assert((await page.locator(".version-tile").count()) === 3, "reload 后未恢复三个版本");
  assert(
    (await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true",
    "reload 后未恢复旧活动版本 V1",
  );
  assert(
    (await page.locator(".workbench-chrome__progress-menu > summary").innerText()).includes("交付检查"),
    "旧版本恢复后阶段不再是完整交付",
  );
  await assertWorkspaceLayout(page, "旧版本恢复");
  assertNoUnexpectedErrors(errors);
  await page.screenshot({
    path: resolve(evidenceDir, "task6-old-version-restored-1280.png"),
    fullPage: false,
    animations: "disabled",
  });
  await context.close();
}

const port = await findOpenPort();
const baseUrl = `http://127.0.0.1:${port}/`;
const viteEntry = resolve(projectRoot, "node_modules/vite/bin/vite.js");
const viteProcess = spawn(
  process.execPath,
  [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
);

let browser;
try {
  await mkdir(evidenceDir, { recursive: true });
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });
  await planMarketplace(browser, baseUrl, "us", "Core benefit", "task4-us-localized-1280.png");
  await planMarketplace(browser, baseUrl, "jp", "主な特長", "task4-jp-localized-1280.png");
  await verifyAPlusWorkflow(browser, baseUrl);
  await verifyTask6Workflow(browser, baseUrl);
  console.log("Checkpoint B browser: tasks 4-6 localization, A+, and Amazon production workflow passed.");
} finally {
  await browser?.close();
  if (!viteProcess.killed) viteProcess.kill("SIGTERM");
  await Promise.race([
    once(viteProcess, "exit"),
    new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
  ]);
}
