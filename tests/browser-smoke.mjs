import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { strFromU8, unzipSync } from "fflate";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(projectRoot, "artifacts/cross-platform-ais");
const evidenceFiles = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  throw new Error(`本地预览未能在 15 秒内启动：${url}`);
}

async function captureEvidence(page, fileName) {
  const path = resolve(evidenceDir, fileName);
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  evidenceFiles.push(fileName);
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const runtimeErrors = [];
  const expectedConsoleErrorUrls = new Set();
  let expectedConsoleErrorCount = 0;

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (
      expectedConsoleErrorUrls.has(message.location().url) &&
      message.text().includes("status of 503")
    ) {
      expectedConsoleErrorUrls.delete(message.location().url);
      expectedConsoleErrorCount += 1;
      return;
    }
    runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByTestId("app-frame").waitFor({ state: "visible" });

  const desktopOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  assert(!desktopOverflow, "桌面端出现横向溢出");

  // Prefer library destination so "新建商品" is in the primary path (Amazon rail may hide it).
  const libraryNav = page.locator(".platform-rail").getByRole("button", {
    name: "资料库",
    exact: true,
  });
  if (await libraryNav.count()) {
    await libraryNav.click();
  }
  await page.getByRole("button", { name: "新建商品", exact: true }).first().click({ timeout: 15_000 });
  const projectDialog = page.getByRole("dialog", { name: "新建商品资料", exact: true });
  await projectDialog.waitFor({ state: "visible" });
  await projectDialog.getByLabel("资料名称", { exact: true }).fill("浏览器恢复测试");
  await projectDialog.getByLabel("商品名称", { exact: true }).fill("云感旅行颈枕");
  await projectDialog.getByLabel("品类", { exact: true }).fill("旅行用品");
  await projectDialog.getByLabel("核心卖点", { exact: true }).fill("慢回弹承托\n可折叠收纳");
  await projectDialog.getByLabel("规格参数", { exact: true }).fill("材质：记忆棉\n尺寸：28 x 25 cm");
  await projectDialog.getByRole("button", { name: "创建资料", exact: true }).click();
  await projectDialog.waitFor({ state: "hidden" });

  // 新建后进入资料库；当前资料只在资料库列表/详情中体现，不塞进全局顶栏
  await page.getByRole("heading", { name: "资料库", exact: true }).waitFor({ state: "visible" });
  await page.locator(".library-project-card", { hasText: "浏览器恢复测试" }).waitFor({
    state: "visible",
  });
  await page.getByRole("button", { name: "新建商品", exact: true }).first().click();
  await projectDialog.waitFor({ state: "visible" });
  await projectDialog.getByLabel("资料名称", { exact: true }).fill("备用商品档案");
  await projectDialog.getByLabel("商品名称", { exact: true }).fill("旅行水杯");
  await projectDialog.getByLabel("品类", { exact: true }).fill("户外用品");
  await projectDialog.getByLabel("核心卖点", { exact: true }).fill("轻量防漏\n便于携带");
  await projectDialog.getByRole("button", { name: "创建资料", exact: true }).click();
  await projectDialog.waitFor({ state: "hidden" });
  await page
    .locator(".library-project-card", { hasText: "浏览器恢复测试" })
    .locator(".library-project-card__select")
    .click();
  await page.getByRole("region", { name: "档案详情：浏览器恢复测试" }).waitFor({
    state: "visible",
  });
  const projectMenuButton = page.getByRole("button", { name: "更多：浏览器恢复测试", exact: true });
  await projectMenuButton.click();
  const deleteProjectAction = page.getByRole("menuitem", { name: "删除商品", exact: true });
  await deleteProjectAction.waitFor({ state: "visible" });
  assert(
    await deleteProjectAction.evaluate((element) => Boolean(element.closest(".library-project-card"))),
    "删除商品操作没有归属到具体商品卡片",
  );
  await deleteProjectAction.click();
  const deleteProjectDialog = page.getByRole("dialog", {
    name: "删除“浏览器恢复测试”？",
    exact: true,
  });
  await deleteProjectDialog.waitFor({ state: "visible" });
  assert(
    (await deleteProjectDialog.locator(".button--danger").count()) === 1,
    "删除商品没有使用共享危险操作弹窗",
  );
  await deleteProjectDialog.getByRole("button", { name: "取消", exact: true }).click();
  await deleteProjectDialog.waitFor({ state: "hidden" });
  await deleteProjectAction.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1280, height: 800 });
  const libraryFactsReachability = await page.evaluate(() => {
    const workspace = document.querySelector(".workspace");
    const detailScroll = document.querySelector(".library-detail .product-source-panel__scroll");
    const saveButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("保存商品资料"),
    );
    if (detailScroll instanceof HTMLElement) detailScroll.scrollTop = detailScroll.scrollHeight;
    const detailRect = detailScroll?.getBoundingClientRect();
    const saveRect = saveButton?.getBoundingClientRect();
    return {
      workspaceHasHiddenOverflow:
        workspace instanceof HTMLElement &&
        workspace.scrollHeight > workspace.clientHeight + 1 &&
        getComputedStyle(workspace).overflowY === "hidden",
      detailCanScroll:
        detailScroll instanceof HTMLElement &&
        detailScroll.scrollHeight > detailScroll.clientHeight + 1,
      saveInsideDetail: Boolean(
        detailRect &&
          saveRect &&
          saveRect.top >= detailRect.top - 1 &&
          saveRect.bottom <= detailRect.bottom + 1,
      ),
    };
  });
  assert(
    !libraryFactsReachability.workspaceHasHiddenOverflow,
    "1280px 资料库存在被 workspace 隐藏的不可达纵向内容",
  );
  assert(libraryFactsReachability.detailCanScroll, "1280px 商品资料详情没有形成内部滚动区");
  assert(libraryFactsReachability.saveInsideDetail, "1280px 商品资料滚动到底后保存操作仍不可达");
  await captureEvidence(page, "library-1280.png");
  const librarySearch = page.getByLabel("搜索商品", { exact: true });
  await librarySearch.fill("不存在的商品");
  await page.getByText("没有匹配的商品", { exact: true }).waitFor({ state: "visible" });
  assert(
    await page.locator(".library-search__clear").isVisible(),
    "资料库搜索无结果没有提供清除入口",
  );
  await captureEvidence(page, "library-search-empty-1280.png");
  await page.locator(".library-search__clear").click();
  await page.getByRole("tab", { name: "平台进度", exact: true }).click();
  await page.getByRole("heading", { name: "平台进度", exact: true }).waitFor({ state: "visible" });
  await captureEvidence(page, "library-progress-1280.png");
  await page.getByRole("tab", { name: "商品资料", exact: true }).click();
  await page.getByRole("heading", { name: "当前资料", exact: true }).waitFor({ state: "visible" });
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1280, height: 800 },
    { width: 1100, height: 800 },
    { width: 900, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const libraryGeometry = await page.evaluate(() => {
      const detailFrame = document.querySelector(".library-detail-frame")?.getBoundingClientRect();
      const tabs = Array.from(document.querySelectorAll(".library-tabs [role='tab']"));
      const tabRects = tabs.map((tab) => tab.getBoundingClientRect());
      const detailScroll = document.querySelector(".library-detail .product-source-panel__scroll");
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        frameVisible: Boolean(detailFrame && detailFrame.width > 0 && detailFrame.height > 0),
        tabsInline:
          tabRects.length === 3 &&
          Math.max(...tabRects.map((rect) => rect.top)) -
            Math.min(...tabRects.map((rect) => rect.top)) <= 1,
        tabsInsideFrame: Boolean(
          detailFrame &&
            tabRects.every(
              (rect) => rect.left >= detailFrame.left - 1 && rect.right <= detailFrame.right + 1,
            ),
        ),
        detailScrollOwner:
          detailScroll instanceof HTMLElement &&
          (getComputedStyle(detailScroll).overflowY === "auto" ||
            getComputedStyle(detailScroll).overflowY === "scroll"),
      };
    });
    assert(!libraryGeometry.overflow, `${viewport.width}px 资料库出现横向溢出`);
    assert(libraryGeometry.frameVisible, `${viewport.width}px 档案详情边界不可见`);
    assert(libraryGeometry.tabsInline, `${viewport.width}px 档案详情 Tabs 被挤成多行`);
    assert(libraryGeometry.tabsInsideFrame, `${viewport.width}px 档案详情 Tabs 超出详情边界`);
    assert(libraryGeometry.detailScrollOwner, `${viewport.width}px 商品资料详情没有独立滚动 owner`);
    await captureEvidence(page, `library-${viewport.width}.png`);
  }
  await page.getByRole("tab", { name: "平台进度", exact: true }).click();
  await page.getByRole("heading", { name: "平台进度", exact: true }).waitFor({ state: "visible" });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.locator('button[data-workflow-id="amazon-listing"]').click();
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });
  assert(
    await page.getByRole("heading", { name: "Amazon", exact: true }).isVisible(),
    "Amazon 导航未切换到目标工作区",
  );
  const intakeUpload = page.locator('.amazon-intake__upload input[type="file"]');
  await intakeUpload.waitFor({ state: "attached" });

  const firstUploadGeometry = await page.evaluate(() => {
    const references = document.querySelector(".amazon-intake__references")?.getBoundingClientRect();
    const upload = document.querySelector(".amazon-intake__upload")?.getBoundingClientRect();
    const toolbar = document.querySelector(".amazon-intake .workbench-toolbar")?.getBoundingClientRect();
    const styleReference = document.querySelector(".amazon-intake .style-reference-picker")?.getBoundingClientRect();
    const planButton = Array.from(document.querySelectorAll(".amazon-intake button")).find(
      (button) => button.textContent?.trim() === "生成图片策划",
    )?.getBoundingClientRect();
    return {
      referencesTop: references?.top ?? 0,
      referencesBottom: references?.bottom ?? 0,
      uploadTop: upload?.top ?? 0,
      uploadBottom: upload?.bottom ?? 0,
      toolbarTop: toolbar?.top ?? 0,
      toolbarBottom: toolbar?.bottom ?? 0,
      styleTop: styleReference?.top ?? 0,
      styleBottom: styleReference?.bottom ?? 0,
      planTop: planButton?.top ?? 0,
      planBottom: planButton?.bottom ?? 0,
      hasActionBar: Boolean(document.querySelector(".amazon-intake .action-bar")),
      hasPlanActionInControls: Boolean(document.querySelector(".amazon-intake .amazon-session-controls__plan")),
      hasExpandParams: Array.from(document.querySelectorAll(".amazon-intake button")).some(
        (button) => button.textContent?.trim() === "调整参数",
      ),
    };
  });
  assert(
    firstUploadGeometry.uploadTop >= firstUploadGeometry.referencesTop &&
      firstUploadGeometry.uploadBottom <= firstUploadGeometry.referencesBottom,
    "Amazon 准备态上传入口不在参考图面板内",
  );
  assert(
    firstUploadGeometry.styleTop === 0 &&
      firstUploadGeometry.styleBottom === 0 &&
      firstUploadGeometry.hasExpandParams,
    "Amazon 非必要参数没有默认折叠",
  );
  assert(
    firstUploadGeometry.planTop >= firstUploadGeometry.toolbarTop &&
      firstUploadGeometry.planBottom <= firstUploadGeometry.toolbarBottom,
    "Amazon 策划动作没有固定在准备页顶部工具栏",
  );
  assert(!firstUploadGeometry.hasPlanActionInControls, "Amazon 策划动作仍藏在参数区");
  assert(!firstUploadGeometry.hasActionBar, "Amazon 准备态仍保留空的固定操作栏");

  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlH8AAAAASUVORK5CYII=",
    "base64",
  );
  await intakeUpload.setInputFiles({
    name: "front.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await page.getByLabel("Amazon Listing 原文", { exact: true }).fill(
    "Title: Cloud Travel Neck Pillow\n\nAbout this item\n- Memory foam support\n- Foldable for carry-on\n- Removable cover",
  );
  await page.getByText("front.png", { exact: true }).waitFor({ state: "visible" });
  await page.getByLabel("Amazon 策划模式", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("tab", { name: "Listing 图", exact: true }).waitFor({ state: "visible" });
  const expandParams = page.getByRole("button", { name: "调整参数", exact: true });
  await expandParams.click();
  await page.getByRole("region", { name: "Amazon 风格参考设置", exact: true }).waitFor({ state: "visible" });
  const collapseParams = page.getByRole("button", { name: "收起参数", exact: true });
  await collapseParams.click();
  await page.getByRole("region", { name: "Amazon 风格参考设置", exact: true }).waitFor({ state: "hidden" });
  assert(
    await page.getByRole("button", { name: "生成图片策划", exact: true }).isVisible(),
    "收起参数后策划动作不可达",
  );
  await expandParams.click();
  await page.getByRole("region", { name: "Amazon 风格参考设置", exact: true }).waitFor({ state: "visible" });

  await page.setViewportSize({ width: 1280, height: 800 });

  const baseStyleSelect = page.getByLabel("基础风格", { exact: true });
  const styleBoardSelect = page.locator('select[aria-label="附加风格板"]');
  await baseStyleSelect.selectOption("studio-proof");
  assert(
    (await styleBoardSelect.inputValue()) === "preset:studio-proof",
    "切换基础风格后，内置附加风格板没有同步",
  );
  await styleBoardSelect.selectOption("preset:soft-lifestyle");
  assert(
    (await baseStyleSelect.inputValue()) === "soft-lifestyle",
    "选择内置附加风格板后，基础风格没有同步",
  );

  await page.getByRole("button", { name: "新建自定义风格", exact: true }).click();
  const styleEditorDialog = page.getByRole("dialog", { name: "新建自定义风格", exact: true });
  await styleEditorDialog.waitFor({ state: "visible" });
  await styleEditorDialog.getByLabel("风格名称", { exact: true }).fill("浏览器静谧棚拍");
  await styleEditorDialog.getByLabel("光影", { exact: true }).selectOption("soft");
  await captureEvidence(page, "amazon-style-editor-1280.png");
  await page.setViewportSize({ width: 900, height: 800 });
  assert(
    !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)),
    "900px 风格编辑器出现横向溢出",
  );
  await captureEvidence(page, "amazon-style-editor-900.png");
  await page.setViewportSize({ width: 1280, height: 800 });
  await styleEditorDialog.getByRole("button", { name: "保存到当前商品", exact: true }).click();
  await styleEditorDialog.waitFor({ state: "hidden" });
  await page
    .locator(".style-reference-picker__selected strong", { hasText: "浏览器静谧棚拍" })
    .waitFor({ state: "visible" });
  await captureEvidence(page, "amazon-custom-style-selected-1280.png");

  await page.getByRole("button", { name: "删除当前自定义风格", exact: true }).click();
  const removeStyleDialog = page.getByRole("dialog", { name: "删除自定义风格板？", exact: true });
  await removeStyleDialog.waitFor({ state: "visible" });
  const removeStyleCopy = await removeStyleDialog.innerText();
  assert(removeStyleCopy.includes("当前商品资料"), "删除风格板没有说明商品作用域");
  assert(removeStyleCopy.includes("已有策划和图片不会删除"), "删除风格板没有说明保留边界");
  await captureEvidence(page, "amazon-style-delete-confirm-1280.png");
  await removeStyleDialog.getByRole("button", { name: "取消", exact: true }).click();

  await page.getByRole("tab", { name: "A+ 图", exact: true }).click();
  await page.getByRole("button", { name: "编排模块", exact: true }).click();
  const aPlusModuleDialog = page.getByRole("dialog", { name: "编排 A+ 模块", exact: true });
  await aPlusModuleDialog.waitFor({ state: "visible" });
  assert(
    (await aPlusModuleDialog.locator(".aplus-module-arrange__row").count()) === 5,
    "普通 A+ 编排弹窗默认模块数不是 5",
  );
  await captureEvidence(page, "amazon-aplus-module-dialog-1280.png");
  await aPlusModuleDialog
    .getByRole("button", { name: "在第 1 行后添加同尺寸模块", exact: true })
    .click();
  assert(
    (await aPlusModuleDialog.locator(".aplus-module-arrange__row").count()) === 6,
    "A+ 编排草稿没有新增模块",
  );
  await aPlusModuleDialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "编排模块", exact: true }).click();
  assert(
    (await aPlusModuleDialog.locator(".aplus-module-arrange__row").count()) === 5,
    "取消 A+ 编排后仍提交了弹窗草稿",
  );
  await aPlusModuleDialog
    .getByRole("button", { name: "在第 1 行后添加同尺寸模块", exact: true })
    .click();
  await aPlusModuleDialog.getByRole("button", { name: "应用编排", exact: true }).click();
  await page.getByText(/6 个模块 · 自定义清单/).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Listing 图", exact: true }).click();

  await captureEvidence(page, "amazon-empty-1280.png");

  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1280, height: 800 },
    { width: 1100, height: 800 },
    { width: 900, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const desktopWorkbenchGeometry = await page.evaluate(() => {
      const intake = document.querySelector(".amazon-intake");
      const planButton = Array.from(document.querySelectorAll(".amazon-intake button")).find(
        (button) => button.textContent?.trim() === "生成图片策划",
      );
      return {
        intakeBottom: intake?.getBoundingClientRect().bottom ?? 0,
        planBottom: planButton?.getBoundingClientRect().bottom ?? 0,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(desktopWorkbenchGeometry.intakeBottom > 0, `${viewport.width}px Amazon 准备态未渲染`);
    assert(desktopWorkbenchGeometry.planBottom > 0, `${viewport.width}px Amazon 准备态策划动作未渲染`);
    assert(!desktopWorkbenchGeometry.overflow, `${viewport.width}px 出现横向溢出`);
  }

  await page.setViewportSize({ width: 1600, height: 900 });
  // Default AIS listing session: MAIN + PT01-PT06 (7).
  await page.getByRole("tab", { name: "Listing 图", exact: true }).click();
  await page.getByRole("button", { name: "生成图片策划", exact: true }).click();
  await Promise.race([
    page.locator(".slot-card").first().waitFor({ state: "visible" }),
    page.locator(".amazon-intake .status-message--danger").waitFor({ state: "visible" }),
  ]);
  const intakePlanningError = await page
    .locator(".amazon-intake .status-message--danger")
    .allInnerTexts();
  assert(intakePlanningError.length === 0, `Amazon 准备态策划失败：${intakePlanningError.join("；")}`);
  const slotCount = await page.locator(".slot-card").count();
  assert(slotCount === 7, `Amazon Listing 默认应为 7 个槽位，实际 ${slotCount}`);
  assert(await page.getByText("Demo", { exact: true }).isVisible(), "Demo 策划来源没有诚实标记");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "切换商品", exact: true }).click();
  const productSwitchDialog = page.getByRole("dialog", {
    name: "切换 Amazon 商品",
    exact: true,
  });
  await productSwitchDialog.waitFor({ state: "visible" });
  const productSwitchText = await productSwitchDialog.innerText();
  assert(productSwitchText.includes("恢复该商品"), "商品切换没有说明恢复已有进度");
  assert(productSwitchText.includes("当前商品的进度仍会保留"), "商品切换没有说明当前进度保留");
  assert(!productSwitchText.includes("覆盖当前草稿"), "商品选择器仍把切换描述为覆盖当前输入");
  const productSwitchGeometry = await productSwitchDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      rightGap: Math.abs(window.innerWidth - rect.right),
      heightGap: Math.abs(window.innerHeight - rect.height),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert(productSwitchGeometry.rightGap <= 1, "商品切换侧栏没有贴合右侧边界");
  assert(productSwitchGeometry.heightGap <= 1, "商品切换侧栏没有占满可用高度");
  assert(!productSwitchGeometry.overflow, "打开商品切换侧栏后页面横向溢出");
  await captureEvidence(page, "product-switch-sidebar-1280.png");
  await page.setViewportSize({ width: 900, height: 800 });
  const compactProductSwitchGeometry = await productSwitchDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const footer = element.querySelector(".dialog__footer")?.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      footerLeft: footer?.left ?? 0,
      footerRight: footer?.right ?? 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert(compactProductSwitchGeometry.left >= 0, "900px 商品切换侧栏越出左边界");
  assert(compactProductSwitchGeometry.right <= 901, "900px 商品切换侧栏越出右边界");
  assert(
    compactProductSwitchGeometry.footerLeft >= 0 && compactProductSwitchGeometry.footerRight <= 901,
    "900px 商品切换动作区不可达",
  );
  assert(!compactProductSwitchGeometry.overflow, "900px 商品切换侧栏出现横向溢出");
  await captureEvidence(page, "product-switch-sidebar-900.png");
  await page.setViewportSize({ width: 1280, height: 800 });
  await productSwitchDialog.getByRole("option", { name: /备用商品档案/ }).click();
  await productSwitchDialog.getByRole("button", { name: "切换并恢复", exact: true }).click();
  await page.getByText("旅行水杯", { exact: true }).first().waitFor({ state: "visible" });
  assert((await page.locator(".slot-card").count()) === 0, "切到空商品后仍显示上一商品的 Amazon 槽位");

  await page.getByRole("button", { name: "切换商品", exact: true }).click();
  await productSwitchDialog.waitFor({ state: "visible" });
  await productSwitchDialog.getByRole("option", { name: /浏览器恢复测试/ }).click();
  await productSwitchDialog.getByRole("button", { name: "切换并恢复", exact: true }).click();
  await page.locator(".slot-card").first().waitFor({ state: "visible" });
  assert((await page.locator(".slot-card").count()) === 7, "切回商品后没有恢复 Amazon 的 7 槽位策划");

  await page.getByRole("button", { name: "任务输入", exact: true }).click();
  const amazonInputDialog = page.getByRole("dialog", { name: "本次任务输入", exact: true });
  await amazonInputDialog.waitFor({ state: "visible" });
  assert((await amazonInputDialog.innerText()).includes("Title:"), "Amazon 任务输入侧栏缺少 Listing 原文");
  await captureEvidence(page, "amazon-task-input-sidebar-1280.png");
  await amazonInputDialog.getByRole("button", { name: "关闭侧栏", exact: true }).click();
  await amazonInputDialog.waitFor({ state: "hidden" });

  const sourceToggle = page.getByRole("button", { name: /^(资料|收起资料)$/ });
  if ((await sourceToggle.getAttribute("aria-expanded")) === "false") {
    await sourceToggle.click();
  }
  await page.getByTestId("asset-upload").waitFor({ state: "attached" });
  const restoredImage = page.getByRole("img", { name: "front.png", exact: true });
  await restoredImage.waitFor({ state: "visible" });
  const productCategoryField = page.getByLabel("品类", { exact: true });
  await productCategoryField.fill("旅行用品（未保存）");
  const planButton = page.getByRole("button", { name: "重新策划", exact: true });
  assert(await planButton.isDisabled(), "商品资料未保存时仍可重新策划");
  await page
    .getByText("商品资料有未保存修改，请先保存商品资料。", { exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: "概览", exact: true }).click();
  assert(
    await page.getByRole("heading", { name: "Amazon", exact: true }).isVisible(),
    "商品资料未保存时仍可离开工作区并丢失草稿",
  );
  await page.getByRole("button", { name: "返回保存", exact: true }).click();
  await page.getByRole("button", { name: "保存商品资料", exact: true }).click();
  await page.getByText("商品资料已保存。", { exact: true }).waitFor({ state: "visible" });
  assert(!(await planButton.isDisabled()), "商品资料保存后重新策划入口没有恢复");
  const initialPlanWarning = page.locator("#plan-freshness-status");
  await initialPlanWarning.waitFor({ state: "visible" });
  await planButton.click();
  await initialPlanWarning.waitFor({ state: "hidden" });

  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();

  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1280, height: 800 },
    { width: 1100, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const listingGeometry = await page.evaluate(() => {
      const grid = document.querySelector(".workbench-grid");
      const panels = [
        document.querySelector(".workbench-source-column:not([hidden])"),
        document.querySelector(".workbench-panel--slots"),
        document.querySelector(".workbench-panel--inspector"),
      ].filter(Boolean);
      const panelRects = panels.map((panel) => panel.getBoundingClientRect());
      const inspectorScroll = document.querySelector(".slot-inspector__scroll")?.getBoundingClientRect();
      const inspectorFooterElement = document.querySelector(".slot-inspector__chrome-bottom");
      const inspectorFooter = inspectorFooterElement?.getBoundingClientRect();
      const primaryActionElement = document.querySelector(
        ".slot-inspector__chrome-bottom .button--primary",
      );
      const primaryAction = primaryActionElement?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        columnCount: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
        topDelta:
          panelRects.length > 0
            ? Math.max(...panelRects.map((rect) => rect.top)) - Math.min(...panelRects.map((rect) => rect.top))
            : Infinity,
        bottomDelta:
          panelRects.length > 0
            ? Math.max(...panelRects.map((rect) => rect.bottom)) - Math.min(...panelRects.map((rect) => rect.bottom))
            : Infinity,
        scrollBottom: inspectorScroll?.bottom ?? 0,
        footerTop: inspectorFooter?.top ?? 0,
        footerBottom: inspectorFooter?.bottom ?? 0,
        actionTop: primaryAction?.top ?? 0,
        actionBottom: primaryAction?.bottom ?? 0,
        actionLabelFits: primaryActionElement
          ? primaryActionElement.scrollWidth <= primaryActionElement.clientWidth + 1
          : false,
        footerContentFits: inspectorFooterElement
          ? inspectorFooterElement.scrollWidth <= inspectorFooterElement.clientWidth + 1
          : false,
        viewportHeight: window.innerHeight,
      };
    });
    assert(!listingGeometry.overflow, `${viewport.width}px Listing 结果态出现横向溢出`);
    assert(listingGeometry.columnCount === 3, `${viewport.width}px Listing 结果态不是三栏`);
    assert(listingGeometry.topDelta <= 1.5, `${viewport.width}px 三栏顶部未对齐`);
    assert(listingGeometry.bottomDelta <= 1.5, `${viewport.width}px 三栏底部未对齐`);
    assert(
      listingGeometry.footerTop >= listingGeometry.scrollBottom - 1,
      `${viewport.width}px 检查器操作栏覆盖滚动正文`,
    );
    assert(
      listingGeometry.actionTop >= listingGeometry.footerTop - 1 &&
        listingGeometry.actionBottom <= listingGeometry.footerBottom + 1 &&
        listingGeometry.actionBottom <= listingGeometry.viewportHeight + 1,
      `${viewport.width}px 检查器主动作不可见或超出操作栏`,
    );
    assert(listingGeometry.actionLabelFits, `${viewport.width}px 检查器主动作文字被裁切`);
    assert(listingGeometry.footerContentFits, `${viewport.width}px 检查器操作栏内容溢出`);
    await captureEvidence(page, `amazon-listing-${viewport.width}.png`);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  const aPlusTab = page.getByRole("tab", { name: "A+ 图", exact: true });
  await aPlusTab.click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="tab"]')].some(
      (tab) => tab.textContent?.trim() === "A+ 图" && tab.getAttribute("aria-selected") === "true",
    ),
  );
  assert(
    (await aPlusTab.getAttribute("aria-selected")) === "true",
    "A+ 分段控件未显示选中状态",
  );
  await page.getByRole("tab", { name: "从资料库选择", exact: true }).click();
  const aPlusProductPicker = page.getByRole("dialog", { name: "切换 Amazon 商品", exact: true });
  await aPlusProductPicker.waitFor({ state: "visible" });
  await aPlusProductPicker.getByRole("button", { name: "继续当前商品", exact: true }).click();
  await aPlusProductPicker.waitFor({ state: "hidden" });
  const aPlusListingText = page.getByLabel("Amazon Listing 原文", { exact: true });
  await aPlusListingText.waitFor({ state: "visible" });
  if (!(await aPlusListingText.inputValue()).trim()) {
    await aPlusListingText.fill(
      "Title: Cloud Travel Neck Pillow\n\nAbout this item\n- Memory foam support\n- Foldable for carry-on",
    );
  }
  await page.getByRole("button", { name: "生成图片策划", exact: true }).click();
  await page.locator(".slot-card").first().waitFor({ state: "visible" });
  assert((await page.locator(".slot-card").count()) > 0, "A+ 策划没有生成模块槽位");
  await captureEvidence(page, "amazon-aplus-1280.png");
  await page.getByRole("tab", { name: "Listing 图", exact: true }).click();
  await page.locator(".slot-card").filter({ hasText: "PT01" }).waitFor({ state: "visible" });
  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();
  assert((await page.locator(".slot-card").count()) === 7, "切回 Listing 后没有恢复 7 个槽位");

  await page.setViewportSize({ width: 1440, height: 900 });
  const visibleCopyField = page.getByLabel("可见文案", { exact: true });
  const promptField = page.getByLabel("模型提示词（英文，可复制）", { exact: true });
  const restoredListingDisabled = await visibleCopyField.isDisabled();
  const restoredListingWarnings = await page.locator("#plan-freshness-status").allInnerTexts();
  assert(
    !restoredListingDisabled,
    `切回 Listing 后槽位编辑仍被锁定：${restoredListingWarnings.join("；")}`,
  );
  await visibleCopyField.fill("Travel comfort, clearly supported");
  await promptField.fill("Use the verified neck pillow facts in a clear Amazon PT01 composition.");
  await page.locator(".slot-card").filter({ hasText: "PT02" }).click();
  assert(
    (await page.locator(".slot-card").filter({ hasText: "PT01" }).getAttribute("aria-pressed")) ===
      "true",
    "槽位草稿未保存时仍切换到了其他槽位",
  );
  await page
    .getByText("当前槽位有未保存修改，请先保存文案与提示词。", { exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: "概览", exact: true }).click();
  assert(
    await page.getByRole("heading", { name: "Amazon", exact: true }).isVisible(),
    "槽位草稿未保存时仍可离开工作区并丢失草稿",
  );
  await page.getByRole("button", { name: "返回保存", exact: true }).click();
  await page.getByRole("button", { name: "保存文案与提示词", exact: true }).click();
  await page.getByText("用户编辑：槽位草稿已保存。", { exact: true }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "生成图片", exact: true }).click();
  await page.getByRole("button", { name: "正在生成...", exact: true }).waitFor({
    state: "visible",
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await captureEvidence(page, "generation-loading-1280.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "概览", exact: true }).click();
  const globalGenerationStatus = page.locator(".generation-task-status");
  await globalGenerationStatus.waitFor({ state: "visible" });
  assert(
    (await globalGenerationStatus.innerText()).includes("Amazon · PT01 正在生成"),
    "离开平台工作区后没有保留生成任务所有者",
  );
  await globalGenerationStatus.getByRole("button", { name: "取消生成", exact: true }).click();
  const globalGenerationFailure = page.locator(".generation-task-status--error");
  await globalGenerationFailure.waitFor({ state: "visible" });
  assert(
    (await globalGenerationFailure.innerText()).includes("Amazon · PT01 生成未完成"),
    "取消后的全局提示没有标明原平台与槽位",
  );
  await globalGenerationFailure.getByRole("button", { name: "查看槽位", exact: true }).click();
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({
    state: "visible",
  });
  await page.getByText("已取消本次图片生成，已有版本未受影响。", { exact: true }).waitFor({
    state: "visible",
  });
  await page.getByLabel("关闭生成提示", { exact: true }).click();

  await page.getByRole("button", { name: "生成图片", exact: true }).click();
  await page.getByRole("button", { name: "正在生成...", exact: true }).waitFor({
    state: "visible",
  });
  await page.getByRole("img", { name: "PT01 当前生成版本", exact: true }).waitFor({
    state: "visible",
  });
  await page.getByRole("tab", { name: "版本", exact: true }).click();
  assert((await page.locator(".version-tile").count()) === 1, "首次生成没有创建 V1");
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await page.locator(".version-tile").nth(1).waitFor({ state: "visible" });
  assert((await page.locator(".version-tile").count()) === 2, "重新生成没有追加 V2");
  await page.locator(".version-tile").first().click();
  await page.locator('.version-tile[aria-pressed="true"]').filter({ hasText: "V1" }).waitFor({
    state: "visible",
  });
  assert(
    (await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true",
    "切换后 V1 没有成为当前版本",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  const inspectorViewModel = await page.evaluate(() => {
    const tablist = document.querySelector('[role="tablist"][aria-label="槽位检查视图"]');
    const resultImage = document.querySelector('.generated-result img[alt="PT01 当前生成版本"]');
    const resultRect = resultImage?.getBoundingClientRect();
    return {
      tabCount: tablist?.querySelectorAll('[role="tab"]').length ?? 0,
      selectedTabCount: tablist?.querySelectorAll('[role="tab"][aria-selected="true"]').length ?? 0,
      visiblePaneCount: document.querySelectorAll(".slot-inspector__pane:not([hidden])").length,
      tablistFits: tablist ? tablist.scrollWidth <= tablist.clientWidth + 1 : false,
      resultVisible: Boolean(resultRect && resultRect.width > 0 && resultRect.height > 0),
    };
  });
  assert(inspectorViewModel.tabCount === 4, "槽位检查器没有统一为四个详情视图");
  assert(inspectorViewModel.selectedTabCount === 1, "槽位检查器同时选中了多个详情视图");
  assert(inspectorViewModel.visiblePaneCount === 1, "槽位检查器同时展开了多个详情区域");
  assert(inspectorViewModel.tablistFits, "1280px 槽位检查视图标签发生横向裁切");
  assert(inspectorViewModel.resultVisible, "切换版本视图后当前结果不可见");
  await captureEvidence(page, "slot-inspector-versions-1280.png");
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("app-frame").waitFor({ state: "visible" });
  // Project identity is restored into workspace content, not the global top bar.
  assert(
    await page.getByRole("heading", { name: "Amazon", exact: true }).isVisible(),
    "刷新后没有恢复最后活动平台",
  );
  const sourceToggleAfterReload = page.getByRole("button", { name: /^(资料|收起资料)$/ });
  if ((await sourceToggleAfterReload.getAttribute("aria-expanded")) === "false") {
    await sourceToggleAfterReload.click();
  }
  await page.getByRole("img", { name: "front.png", exact: true }).waitFor({ state: "visible" });
  assert((await page.locator(".slot-card").count()) === 7, "刷新后没有恢复 Amazon Listing 槽位策划");
  assert(
    (await page.getByLabel("可见文案", { exact: true }).inputValue()) ===
      "Travel comfort, clearly supported",
    "刷新后没有恢复已编辑的槽位文案",
  );
  assert(
    (await page.getByLabel("模型提示词（英文，可复制）", { exact: true }).inputValue()) ===
      "Use the verified neck pillow facts in a clear Amazon PT01 composition.",
    "刷新后没有恢复已编辑的槽位提示词",
  );
  await page.getByRole("tab", { name: "版本", exact: true }).click();
  assert((await page.locator(".version-tile").count()) === 2, "刷新后没有恢复两个生成版本");
  assert(
    (await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true",
    "刷新后没有恢复 V1 激活状态",
  );
  await page.getByRole("img", { name: "PT01 当前生成版本", exact: true }).waitFor({
    state: "visible",
  });
  assert(
    (await page.getByRole("img", { name: "front.png", exact: true }).count()) === 1,
    "生成结果被错误混入商品参考素材列表",
  );

  await page.goto(`${baseUrl}?fixture=image-fail-once`, { waitUntil: "networkidle" });
  await page.getByTestId("app-frame").waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({
    state: "visible",
  });
  await page.getByRole("tab", { name: "版本", exact: true }).click();
  assert((await page.locator(".version-tile").count()) === 2, "失败夹具启动前没有恢复两个历史版本");
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await page.getByRole("button", { name: "正在生成...", exact: true }).waitFor({
    state: "visible",
  });
  const fixtureFailure = page.locator(".generation-task-status--error");
  await fixtureFailure.waitFor({ state: "visible" });
  assert(
    (await fixtureFailure.innerText()).includes("模拟图片服务失败"),
    "本地失败夹具没有显示可归属的生成错误",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  assert(
    await page.getByRole("tablist", { name: "槽位检查视图", exact: true }).isVisible(),
    "1280px 已有版本时检查器视图切换器不可见",
  );
  await captureEvidence(page, "generation-error-1280.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  assert((await page.locator(".version-tile").count()) === 2, "生成失败覆盖或追加了历史版本");
  assert(
    (await page.locator(".version-tile").first().getAttribute("aria-pressed")) === "true",
    "生成失败改变了原活动版本",
  );
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await page.getByRole("button", { name: "正在生成...", exact: true }).waitFor({
    state: "visible",
  });
  await page.locator(".version-tile").nth(2).waitFor({ state: "visible" });
  assert((await page.locator(".version-tile").count()) === 3, "失败后的重试没有成功追加新版本");
  const checksTab = page.getByRole("tab", { name: "检查", exact: true });
  await checksTab.click();
  await page.getByText("仍需人工复核", { exact: true }).waitFor({ state: "visible" });
  assert(
    await page.getByText("自动检查未发现文字风险", { exact: true }).isVisible(),
    "合规面板没有显示当前槽位的自动检查结果",
  );
  await captureEvidence(page, "slot-inspector-checks-1280.png");
  const copilotTab = page.getByRole("tab", { name: "Copilot", exact: true });
  await copilotTab.click();
  assert(
    await page.getByRole("button", { name: "缩短文案", exact: true }).isVisible(),
    "生成后无法切换到 AI Copilot",
  );
  await captureEvidence(page, "slot-inspector-copilot-1280.png");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出当前结果", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert(downloadPath, "浏览器没有生成可读取的 ZIP 文件");
  const archive = unzipSync(new Uint8Array(await readFile(downloadPath)));
  assert(Boolean(archive["manifest.json"]), "ZIP 缺少 manifest.json");
  assert(Boolean(archive["prompts.md"]), "ZIP 缺少 prompts.md");
  const exportedManifest = JSON.parse(strFromU8(archive["manifest.json"]));
  assert(
    download.suggestedFilename() ===
      `浏览器恢复测试-amazon-${exportedManifest.exportedAt.slice(0, 10)}.zip`,
    "导出文件名日期与 manifest 导出时间不一致",
  );
  assert(exportedManifest.ready === false, "不完整交付包被错误标记为 ready");
  assert(exportedManifest.missingSlots.includes("MAIN"), "缺失槽位清单没有包含未生成的 MAIN");
  assert(exportedManifest.slots.find((slot) => slot.slotKey === "PT01")?.fileName, "活动 PT01 没有进入 ZIP manifest");

  await page.getByRole("button", { name: "生产记录", exact: true }).click();
  await page.getByRole("heading", { name: "生产记录", exact: true }).waitFor({ state: "visible" });
  assert(await page.getByText("完成策划", { exact: true }).first().isVisible(), "历史缺少策划记录");
  assert(await page.getByText(/生成图片 · PT01/, { exact: true }).first().isVisible(), "历史缺少生成记录");
  assert(await page.getByText("导出交付", { exact: true }).first().isVisible(), "历史缺少导出记录");
  assert(
    await page.getByText(download.suggestedFilename(), { exact: true }).isVisible(),
    "历史没有显示本次导出产物",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await captureEvidence(page, "production-history-1280.png");
  const historySearch = page.getByLabel("搜索商品或 Run", { exact: true });
  await historySearch.fill("不存在的 Run");
  await page.getByText("筛选条件没有结果", { exact: true }).waitFor({ state: "visible" });
  await captureEvidence(page, "production-history-filter-empty-1280.png");
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 800 });
  assert(
    !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)),
    "900px 生产记录出现横向溢出",
  );
  await captureEvidence(page, "production-history-900.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Amazon", exact: true }).click();
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });

  const sourceToggleAfterHistory = page.getByRole("button", { name: /^(资料|收起资料)$/ });
  if ((await sourceToggleAfterHistory.getAttribute("aria-expanded")) === "false") {
    await sourceToggleAfterHistory.click();
  }
  const productCategory = page.getByLabel("品类", { exact: true });
  await productCategory.fill("旅行与通勤用品");
  await page.getByRole("button", { name: "保存商品资料", exact: true }).click();
  await page.getByText("商品资料已保存。", { exact: true }).waitFor({ state: "visible" });
  const stalePlanWarning = page.locator("#plan-freshness-status");
  await stalePlanWarning.waitFor({ state: "visible" });
  assert(
    await page.getByRole("button", { name: "重新生成", exact: true }).isDisabled(),
    "商品资料更新后仍可基于旧策划生成图片",
  );
  assert(
    (await page.getByRole("button", { name: /导出.*交付包|导出当前结果/ }).count()) === 0,
    "商品资料更新后仍显示旧策划导出入口",
  );

  await page.reload({ waitUntil: "networkidle" });
  await stalePlanWarning.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "重新策划", exact: true }).click();
  await stalePlanWarning.waitFor({ state: "hidden" });
  const refreshedGenerationAction = page.getByRole("button", {
    name: /^(生成图片|重新生成)$/,
  });
  assert(
    !(await refreshedGenerationAction.isDisabled()),
    "重新策划后图片生成入口没有恢复",
  );

  await page.goto(`${baseUrl}?fixture=planning-slow`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "重新策划", exact: true }).click();
  const globalPlanningStatus = page.locator(".planning-task-status");
  await globalPlanningStatus.waitFor({ state: "visible" });
  assert(
    (await globalPlanningStatus.innerText()).includes("Amazon 正在生成平台策划"),
    "全局策划状态没有标明任务平台",
  );
  await page.getByRole("button", { name: "淘宝 / 天猫", exact: true }).click();
  const crossPlatformPicker = page.getByRole("dialog", { name: /切换 淘宝/ });
  if (await crossPlatformPicker.count()) {
    await crossPlatformPicker
      .getByRole("button", { name: /^(继续当前商品|切换并恢复)$/ })
      .click();
    await crossPlatformPicker.waitFor({ state: "hidden" });
  }
  await page
    .getByRole("heading", { name: "淘宝 / 天猫", exact: true })
    .waitFor({ state: "visible" });
  await page.getByLabel("淘宝商品资料", { exact: true }).fill(
    "商品名：云感旅行颈枕 Pro\n卖点：慢回弹承托、可折叠收纳\n规格：材质：记忆棉",
  );
  const crossPlatformAnalysisButton = page.getByRole("button", {
    name: "生成图片策划",
    exact: true,
  });
  const taobaoPrimaryActionGeometry = await page.evaluate(() => {
    const toolbar = document.querySelector(".taobao-intake .workbench-toolbar")?.getBoundingClientRect();
    const action = Array.from(document.querySelectorAll(".taobao-intake .workbench-toolbar button")).find(
      (button) => button.textContent?.trim() === "生成图片策划",
    )?.getBoundingClientRect();
    return {
      toolbarTop: toolbar?.top ?? 0,
      toolbarBottom: toolbar?.bottom ?? 0,
      actionTop: action?.top ?? 0,
      actionBottom: action?.bottom ?? 0,
    };
  });
  assert(
    taobaoPrimaryActionGeometry.actionTop >= taobaoPrimaryActionGeometry.toolbarTop &&
      taobaoPrimaryActionGeometry.actionBottom <= taobaoPrimaryActionGeometry.toolbarBottom,
    "淘宝生成图片策划动作没有固定在准备页顶部工具栏",
  );
  assert(await crossPlatformAnalysisButton.isDisabled(), "跨平台仍可启动第二个分析策划任务");
  assert(
    (await crossPlatformAnalysisButton.getAttribute("title"))?.includes("Amazon 正在生成平台策划"),
    "跨平台分析按钮没有说明锁定原因",
  );

  const desktopPlanningStatus = await globalPlanningStatus.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const cancel = element.querySelector("button")?.getBoundingClientRect();
    return { top: rect.top, cancelHeight: cancel?.height ?? 0 };
  });
  assert(desktopPlanningStatus.top < 500, "桌面看不到跨平台策划状态与原因");
  assert(desktopPlanningStatus.cancelHeight >= 32, "桌面取消策划按钮过小");
  await globalPlanningStatus.getByRole("button", { name: "取消策划", exact: true }).click();
  await globalPlanningStatus.waitFor({ state: "hidden" });
  assert(!(await crossPlatformAnalysisButton.isDisabled()), "取消原策划后跨平台分析入口没有恢复");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Amazon", exact: true }).click();
  const crossPlatformLeaveDialog = page.getByRole("dialog", {
    name: "有未保存的修改",
    exact: true,
  });
  if (await crossPlatformLeaveDialog.count()) {
    await crossPlatformLeaveDialog
      .getByRole("button", { name: "丢弃修改", exact: true })
      .click();
  }
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });
  assert((await page.locator(".slot-card").count()) === 7, "跨平台取消后原 Amazon Listing 策划被删除");
  await page.goto(`${baseUrl}?fixture=copilot-slow`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });

  const copilotCopy = page.getByLabel("可见文案", { exact: true });
  await copilotCopy.fill(
    "Long-haul travel comfort with balanced support, easy packing, and a removable cover",
  );
  await page.getByRole("tab", { name: "Copilot", exact: true }).click();
  const shortenCopilotButton = page.getByRole("button", { name: "缩短文案", exact: true });
  assert(await shortenCopilotButton.isDisabled(), "未保存文案与提示词时仍可运行 Copilot");
  await page
    .getByText(
      "当前 Prompt 或可见文案尚未保存，请先保存文案与提示词后再使用 Copilot。",
      { exact: true },
    )
    .waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "文案", exact: true }).click();
  await page.getByRole("button", { name: "保存文案与提示词", exact: true }).click();
  await page.getByText("用户编辑：槽位草稿已保存。", { exact: true }).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Copilot", exact: true }).click();
  assert(!(await shortenCopilotButton.isDisabled()), "保存文案与提示词后 Copilot 仍不可用");
  const copilotButtonHeight = await shortenCopilotButton.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  assert(copilotButtonHeight >= 32, "桌面 Copilot 按钮小于 32px");
  await shortenCopilotButton.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
    element.click();
  });
  await page
    .getByText("Copilot 正在处理当前槽位请求", { exact: true })
    .waitFor({ state: "visible", timeout: 15_000 });
  const globalCopilotStatus = page.locator(".copilot-task-status");
  await globalCopilotStatus.waitFor({ state: "visible" });
  assert(
    await page.getByRole("button", { name: "取消请求", exact: true }).isVisible(),
    "Copilot pending 状态缺少取消入口",
  );
  await page.locator(".slot-card").filter({ hasText: "PT02" }).click();
  await page.getByRole("tab", { name: "Copilot", exact: true }).click();
  assert(await shortenCopilotButton.isDisabled(), "切换槽位后仍可启动第二个 Copilot");
  await page
    .getByLabel("AI Copilot", { exact: true })
    .getByText("Amazon · PT01 Copilot 请求处理中，请先等待或取消。", { exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: "概览", exact: true }).click();
  assert(
    (await globalCopilotStatus.innerText()).includes("Amazon · PT01 Copilot 请求处理中"),
    "离开槽位后 Copilot 目标与进度不可见",
  );
  const dialog = page.getByRole("dialog", { name: "连接与生成模式", exact: true });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  await dialog
    .getByText("Amazon · PT01 Copilot 请求处理中，请完成或取消后再修改运行设置。", {
      exact: true,
    })
    .waitFor({ state: "visible" });
  assert(
    await dialog.getByRole("button", { name: "保存设置", exact: true }).isDisabled(),
    "Copilot 运行中仍可保存运行设置",
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await globalCopilotStatus.getByRole("button", { name: "取消 Copilot", exact: true }).click();
  await globalCopilotStatus.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Amazon", exact: true }).click();
  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();
  await page
    .getByText("已取消 Copilot 请求，当前槽位草稿未受影响。", { exact: true })
    .waitFor({ state: "visible" });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Amazon", exact: true }).click();
  await page.locator(".slot-card").filter({ hasText: "PT01" }).click();
  await page.getByRole("tab", { name: "Copilot", exact: true }).click();
  const retryShortenButton = page.getByRole("button", { name: "缩短文案", exact: true });
  await retryShortenButton.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
    element.click();
  });
  await page
    .getByText("AI 建议：PT01 已更新并保存。", { exact: true })
    .waitFor({ state: "visible" });
  assert((await page.getByLabel("可见文案", { exact: true }).inputValue()).length <= 48, "Demo Copilot 没有缩短当前槽位文案");
  const advicePromptField = page.getByLabel("模型提示词（英文，可复制）", { exact: true });
  const promptBeforeAdvice = await advicePromptField.inputValue();
  await page.getByRole("button", { name: "检查 Prompt", exact: true }).evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
    element.click();
  });
  await page.getByText(/AI 建议：.*人工复核/).waitFor({ state: "visible" });
  assert(await advicePromptField.inputValue() === promptBeforeAdvice, "只读 Copilot 检查改写了当前 Prompt");

  await page.getByRole("button", { name: "设置", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  const focusInsideDialog = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  assert(focusInsideDialog, "设置弹窗打开后焦点没有进入弹窗");
  await dialog.getByRole("tab", { name: "API", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await captureEvidence(page, "settings-api-1280.png");
  await dialog.getByRole("tab", { name: "单连接", exact: true }).click();
  assert(
    await dialog.locator(".settings-service-group", { hasText: "图片生成服务" }).isHidden(),
    "设置切换单连接后仍显示独立图片服务区",
  );
  await captureEvidence(page, "settings-single-1280.png");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("tab", { name: "API", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  assert(
    (await dialog.innerText()).includes("未加密的浏览器本地数据"),
    "API Key 本地明文存储风险未告知",
  );
  const browserApiKey = "browser-smoke-secret-key";
  const connectionTestUrl = `${baseUrl}__connection-test-fail`;
  expectedConsoleErrorUrls.add(connectionTestUrl);
  await page.route(connectionTestUrl, async (route) => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  // Settings Field wraps complex controls; target inputs via accessible names / nearby structure.
  await dialog.getByLabel("API Key", { exact: true }).fill(browserApiKey);
  if (await dialog.getByLabel("图片 API Key", { exact: true }).count()) {
    await dialog.getByLabel("图片 API Key", { exact: true }).fill(browserApiKey);
  }
  await dialog.locator(".settings-service-group", { hasText: "文本策划服务" }).locator('input[type="url"]').fill(connectionTestUrl);
  await dialog.locator(".settings-service-group", { hasText: "文本策划服务" }).locator('input:not([type])').last().fill("planning-model");
  await dialog.locator(".settings-service-group", { hasText: "图片生成服务" }).locator('input[type="url"]').fill(`${baseUrl}__image-test`);
  await dialog.locator(".settings-service-group", { hasText: "图片生成服务" }).getByRole("textbox").last().fill("image-model");
  // Fallback model fill if textbox role missing on bare inputs
  const imageModelInput = dialog.locator(".settings-service-group", { hasText: "图片生成服务" }).locator("input").nth(2);
  if (await imageModelInput.count()) await imageModelInput.fill("image-model");
  const planningModelInput = dialog.locator(".settings-service-group", { hasText: "文本策划服务" }).locator("input").nth(2);
  if (await planningModelInput.count()) await planningModelInput.fill("planning-model");
  await dialog.getByRole("button", { name: /测试(连接|文本 API)/ }).first().click();
  await dialog
    .getByText(/暂时不可用|连接测试失败|HTTP 503|权限|密钥|无法连接|请稍后重试/, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await captureEvidence(page, "settings-error-1280.png");
  assert(!(await dialog.innerText()).includes(browserApiKey), "设置反馈向用户回显了 API Key");
  await dialog.locator(".settings-service-group", { hasText: "文本策划服务" }).locator("input").nth(2).fill("planning-model-v2");
  await dialog.getByRole("button", { name: "保存设置", exact: true }).click();
  await dialog.getByText("设置已保存。", { exact: true }).waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert((await page.locator(".runtime-badge").innerText()).includes("API"), "保存后运行模式徽标没有切换到 API");
  assert(await page.getByText("API 图片生成", { exact: true }).isVisible(), "API 模式生成区仍显示 Demo 来源");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  assert(
    (await dialog.getByRole("tab", { name: "API", exact: true }).getAttribute("aria-selected")) ===
      "true",
    "刷新后没有恢复 API 设置",
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert((await page.locator(".runtime-badge").innerText()).includes("API"), "刷新后没有恢复 API 模式徽标");
  await page.getByRole("button", { name: "概览", exact: true }).click();
  const runtimeMetric = page.locator(".metric--yellow");
  assert((await runtimeMetric.innerText()).includes("API"), "概览运行模式与运行徽标不一致");
  assert(
    (await runtimeMetric.innerText()).includes("当前浏览器保存的 API 配置"),
    "概览没有说明 API 配置的本地边界",
  );
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByLabel("API Key", { exact: true }).fill("");
  await dialog.locator(".segmented-control__option").first().click();
  await dialog.getByRole("button", { name: "保存设置", exact: true }).click();
  await dialog.getByText("设置已保存。", { exact: true }).waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert((await page.locator(".runtime-badge").innerText()).includes("演示"), "切回 Demo 后徽标未更新");
  await page.getByRole("button", { name: "Amazon", exact: true }).click();
  await page.getByRole("heading", { name: "Amazon", exact: true }).waitFor({ state: "visible" });

  // Desktop-only gate and column scroll model.
  await page.setViewportSize({ width: 899, height: 800 });
  const desktopGate = page.getByTestId("desktop-only-gate");
  await desktopGate.waitFor({ state: "visible" });
  assert(
    (await desktopGate.innerText()).includes("当前只支持电脑端浏览"),
    "小于最小宽度时没有显示电脑端提示",
  );
  assert(
    (await desktopGate.innerText()).includes("900"),
    "电脑端提示没有说明最低宽度",
  );
  assert(
    (await page.locator(".mobile-navigation").count()) === 0 ||
      !(await page.locator(".mobile-navigation").isVisible()),
    "桌面产品仍暴露移动端导航",
  );
  await captureEvidence(page, "desktop-gate-899.png");

  await page.setViewportSize({ width: 900, height: 800 });
  await desktopGate.waitFor({ state: "hidden" });
  const compactDesktop = await page.evaluate(() => {
    const grid = document.querySelector(".workbench-grid");
    const source = document.querySelector(".workbench-source-column");
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
      sourceHidden: source?.hasAttribute("hidden") ?? false,
    };
  });
  assert(!compactDesktop.overflow, "900px 紧凑桌面出现横向溢出");
  assert(compactDesktop.columns === 2, `900px 应为双栏工作台，实际 ${compactDesktop.columns} 栏`);
  assert(compactDesktop.sourceHidden, "900px 策划态没有默认收起资料栏");
  const compactPrimaryAction = page.getByRole("button", { name: /^(生成图片|重新生成)$/ });
  const compactPrimaryGeometry = await compactPrimaryAction.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const footer = element.closest(".slot-inspector__chrome-bottom")?.getBoundingClientRect();
    return {
      fullyInsideFooter: Boolean(
        footer &&
          rect.left >= footer.left - 1 &&
          rect.right <= footer.right + 1 &&
          rect.top >= footer.top - 1 &&
          rect.bottom <= footer.bottom + 1,
      ),
      labelFits: element.scrollWidth <= element.clientWidth + 1,
    };
  });
  assert(compactPrimaryGeometry.fullyInsideFooter, "900px 生成主动作超出固定操作栏");
  assert(compactPrimaryGeometry.labelFits, "900px 生成主动作文字被挤压或裁切");
  assert(
    await page.getByRole("tablist", { name: "槽位检查视图", exact: true }).isVisible(),
    "900px 检查器视图切换器不可见",
  );
  await captureEvidence(page, "amazon-compact-900.png");

  const compactSourceToggle = page.getByRole("button", { name: "资料", exact: true });
  await compactSourceToggle.click();
  const compactSource = await page.evaluate(() => {
    const grid = document.querySelector(".workbench-grid")?.getBoundingClientRect();
    const source = document.querySelector(".workbench-source-column")?.getBoundingClientRect();
    return {
      withinGrid: Boolean(
        grid && source &&
          source.left >= grid.left - 1 &&
          source.right <= grid.right + 1 &&
          source.top >= grid.top - 1 &&
          source.bottom <= grid.bottom + 1
      ),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert(compactSource.withinGrid, "900px 资料抽屉超出工作台边界");
  assert(!compactSource.overflow, "900px 展开资料抽屉后出现横向溢出");
  await page.getByRole("button", { name: "收起资料", exact: true }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "淘宝 / 天猫", exact: true }).click();
  const taobaoReviewPicker = page.getByRole("dialog", { name: /切换 淘宝/ });
  if (await taobaoReviewPicker.count()) {
    await taobaoReviewPicker
      .getByRole("button", { name: /^(继续当前商品|切换并恢复)$/ })
      .click();
    await taobaoReviewPicker.waitFor({ state: "hidden" });
  }
  assert(
    await page.getByRole("heading", { name: "淘宝 / 天猫", exact: true }).isVisible(),
    "恢复桌面宽度后平台导航未切换到淘宝工作区",
  );
  const taobaoAnalysisInput = page.getByLabel("淘宝商品资料", { exact: true });
  if (await taobaoAnalysisInput.count()) {
    await taobaoAnalysisInput.fill(
      "商品名：云感旅行颈枕 Pro\n卖点：慢回弹承托、可折叠收纳\n规格：材质：记忆棉\n禁用声明：治疗颈椎病",
    );
    await page.getByRole("button", { name: "生成图片策划", exact: true }).click();
    await page.locator(".slot-card").first().waitFor({ state: "visible" });
  }
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1280, height: 800 },
    { width: 1100, height: 800 },
    { width: 900, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    assert(
      !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)),
      `${viewport.width}px 淘宝准备态出现横向溢出`,
    );
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.locator(".slot-card").first().waitFor({ state: "visible" });
  assert((await page.locator(".slot-card").count()) === 12, "淘宝没有生成完整的 12 个槽位");
  assert(
    (await page.getByText("头图", { exact: true }).count()) === 1 &&
      (await page.getByText("5 个必需槽位", { exact: true }).count()) === 1 &&
      (await page.getByText("移动详情", { exact: true }).count()) === 1 &&
      (await page.getByText("7 个必需槽位", { exact: true }).count()) === 1,
    "淘宝工作区没有显示固定 5+7 Rule Pack",
  );
  const taobaoCurrentStep = page.locator('.workbench-stepper__item[aria-current="step"]');
  assert(
    (await taobaoCurrentStep.innerText()).includes("策划检查"),
    "淘宝完成策划后没有进入共享的策划检查阶段",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "分析详情", exact: true }).click();
  const taobaoAnalysisDialog = page.getByRole("dialog", {
    name: "商品分析结果",
    exact: true,
  });
  await taobaoAnalysisDialog.waitFor({ state: "visible" });
  const taobaoAnalysisGeometry = await taobaoAnalysisDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const body = element.querySelector(".dialog__body");
    return {
      rightGap: Math.abs(window.innerWidth - rect.right),
      heightGap: Math.abs(window.innerHeight - rect.height),
      bodyScrollable:
        body instanceof HTMLElement &&
        (body.scrollHeight <= body.clientHeight + 1 || getComputedStyle(body).overflowY === "auto"),
    };
  });
  assert(taobaoAnalysisGeometry.rightGap <= 1, "淘宝分析详情侧栏没有贴合右侧边界");
  assert(taobaoAnalysisGeometry.heightGap <= 1, "淘宝分析详情侧栏没有占满可用高度");
  assert(taobaoAnalysisGeometry.bodyScrollable, "淘宝分析详情长内容没有明确滚动责任");
  await captureEvidence(page, "taobao-analysis-sidebar-1280.png");
  await taobaoAnalysisDialog.getByRole("button", { name: "关闭侧栏", exact: true }).click();
  await taobaoAnalysisDialog.waitFor({ state: "hidden" });
  await captureEvidence(page, "taobao-review-1280.png");
  await page.setViewportSize({ width: 1600, height: 900 });

  const scrollModel = await page.evaluate(() => {
    const workspace = document.querySelector(".workspace");
    const grid = document.querySelector(".workbench-grid");
    const source = document.querySelector(".product-source-panel__scroll");
    const slots = document.querySelector(".slot-board");
    const inspector = document.querySelector(".slot-inspector__scroll");
    return {
      workspaceOverflow: workspace ? getComputedStyle(workspace).overflow : "",
      gridHeight: grid?.getBoundingClientRect().height ?? 0,
      sourceOverflowY: source ? getComputedStyle(source).overflowY : "",
      slotsOverflowY: slots ? getComputedStyle(slots).overflowY : "",
      inspectorOverflowY: inspector ? getComputedStyle(inspector).overflowY : "",
    };
  });
  assert(
    scrollModel.workspaceOverflow === "hidden",
    "平台工作区页面级滚动未关闭，应改为列内滚动",
  );
  assert(scrollModel.gridHeight > 400, "工作台三栏高度未吃满可用区域");
  assert(
    scrollModel.sourceOverflowY === "auto" || scrollModel.sourceOverflowY === "scroll",
    "商品资料列没有内部滚动",
  );
  assert(
    scrollModel.slotsOverflowY === "auto" || scrollModel.slotsOverflowY === "scroll",
    "槽位列没有内部滚动",
  );
  assert(
    scrollModel.inspectorOverflowY === "auto" || scrollModel.inspectorOverflowY === "scroll",
    "检查器列没有内部滚动",
  );

  await page.getByRole("button", { name: "生成图片", exact: true }).click();
  await page.getByRole("img", { name: "TB-HERO-01 当前生成版本", exact: true }).waitFor({ state: "visible" });
  assert(
    (await taobaoCurrentStep.innerText()).includes("逐图生产"),
    "淘宝生成首图后没有进入共享的逐图生产阶段",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await captureEvidence(page, "taobao-production-1280.png");
  await page.getByRole("button", { name: "手机预览", exact: true }).click();
  const taobaoPreview = page.getByRole("dialog", { name: "淘宝手机商品页预览", exact: true });
  await taobaoPreview.waitFor({ state: "visible" });
  assert((await taobaoPreview.locator('[aria-label^="查看 TB-HERO-"]').count()) === 5, "手机预览主图位不是 5 个");
  assert((await taobaoPreview.locator('[data-slot-key^="TB-DETAIL-"]').count()) === 7, "手机预览详情位不是 7 个");
  const taobaoPreviewText = await taobaoPreview.innerText();
  assert(taobaoPreviewText.includes("还需完成 11 个槽位"), "手机预览缺失槽位提示不准确");
  assert(taobaoPreviewText.includes("头图 4 个 · 详情 7 个"), "手机预览缺失槽位分组不准确");
  assert(!taobaoPreviewText.includes("当前 session"), "手机预览仍暴露开发态 session 文案");
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1280, height: 800 },
    { width: 1100, height: 800 },
    { width: 900, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    assert(
      !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)),
      `${viewport.width}px 淘宝手机预览出现横向溢出`,
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await captureEvidence(page, "taobao-mobile-preview-1280.png");
  await taobaoPreview.getByRole("button", { name: "关闭弹窗", exact: true }).click();

  // Connection test may not log a browser console 503 depending on fetch/error handling.
  // The UI error path was already asserted above; keep console count as soft signal only.
  if (expectedConsoleErrorCount === 0) {
    console.warn("Browser smoke note: no console 503 observed for connection fixture (UI path covered).");
  }
  const unexpectedRuntimeErrors = runtimeErrors.filter(
    (entry) =>
      !entry.includes("status of 404") &&
      !entry.includes("status of 503") &&
      !entry.includes("Failed to load resource"),
  );
  assert(unexpectedRuntimeErrors.length === 0, unexpectedRuntimeErrors.join("\n"));
  if (runtimeErrors.length) {
    console.warn("Browser smoke console notes:", runtimeErrors.join(" | "));
  }
  console.log(
    "Browser smoke passed: project/assets restore, planning, pending/cancel recovery, five-action Copilot, runtime lock, fail/retry preservation, multi-version generation, dirty-draft lock, desktop min-width gate, column scroll model, dialog, overflow, console.",
  );
  console.log(`UI governance evidence: ${evidenceFiles.join(", ")}`);
} finally {
  await browser?.close();
  if (!viteProcess.killed) viteProcess.kill("SIGTERM");
  await Promise.race([
    once(viteProcess, "exit"),
    new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
  ]);
}
