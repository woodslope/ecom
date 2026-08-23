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
const runtimeErrors = [];
let contextSequence = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function monitorPage(page, label) {
  page.on("pageerror", (error) => runtimeErrors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`${label} console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      runtimeErrors.push(`${label} HTTP ${response.status()}: ${response.url()}`);
    }
  });
}

async function createMonitoredContext(browser, options) {
  contextSequence += 1;
  const label = `context-${contextSequence}`;
  const context = await browser.newContext(options);
  context.on("page", (page) => monitorPage(page, label));
  return context;
}

async function assertModalIsolation(page, label) {
  const state = await page.evaluate(() => {
    const app = document.querySelector(".app-desktop-content");
    const activeLayers = [...document.querySelectorAll(".dialog-layer")].filter((layer) =>
      layer instanceof HTMLElement && !layer.inert && layer.getAttribute("aria-hidden") !== "true",
    );
    const leakedFocusTargets = [...document.querySelectorAll(
      'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((node) =>
      node instanceof HTMLElement &&
      node.getClientRects().length > 0 &&
      getComputedStyle(node).visibility !== "hidden" &&
      !node.closest("[inert]") &&
      !node.closest(".dialog-layer"),
    );
    return {
      appInert: app instanceof HTMLElement && app.inert,
      appHidden: app?.getAttribute("aria-hidden") === "true",
      activeLayerCount: activeLayers.length,
      leakedFocusTargets: leakedFocusTargets.length,
    };
  });
  assert(state.appInert, `${label} 打开时底层工作台未 inert`);
  assert(state.appHidden, `${label} 打开时底层工作台未 aria-hidden`);
  assert(state.activeLayerCount === 1, `${label} 可操作模态层数量异常：${state.activeLayerCount}`);
  assert(state.leakedFocusTargets === 0, `${label} 外仍有 ${state.leakedFocusTargets} 个可聚焦目标`);
}

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

async function inspectProductionLayout(page) {
  return page.evaluate(() => {
    const slots = document.querySelector(".workbench-panel--slots");
    const inspector = document.querySelector(".workbench-panel--inspector");
    const list = document.querySelector(".workbench-panel--slots .slot-list");
    if (!(slots instanceof HTMLElement) || !(inspector instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      return null;
    }
    const slotsRect = slots.getBoundingClientRect();
    const inspectorRect = inspector.getBoundingClientRect();
    return {
      slotsX: slotsRect.x,
      slotsWidth: slotsRect.width,
      inspectorX: inspectorRect.x,
      inspectorWidth: inspectorRect.width,
      listColumns: getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

const port = await openPort();
const baseUrl = `http://127.0.0.1:${port}/`;
const vite = spawn(
  process.execPath,
  [resolve(projectRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: projectRoot, stdio: "ignore" },
);

let browser;
try {
  await mkdir(evidenceDir, { recursive: true });
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });

  for (const viewport of [
    { width: 1200, height: 800 },
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1600, height: 900 },
  ]) {
    const { width } = viewport;
    const context = await createMonitoredContext(browser, { viewport });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const runtimeButton = page.getByRole("button", { name: /当前运行模式：本地演示，打开设置/ });
    assert(await runtimeButton.isVisible(), `${width}px 左栏未显示 Demo 运行模式`);
    for (const platform of ["Amazon", "淘宝 / 天猫"]) {
      await page.getByRole("button", { name: platform, exact: true }).click();
      const requirement = page.locator(".planning-input-requirement");
      assert(await requirement.isVisible(), `${width}px ${platform} 空输入要求不可见`);
      assert((await page.locator(".workbench-chrome__tools").getByRole("button", { name: "新任务", exact: true }).count()) === 0, `${platform} 首次空白任务仍显示冗余新任务入口`);
      const historyTrigger = page.getByRole("button", { name: "历史记录", exact: true });
      await historyTrigger.click();
      const historyDialog = page.getByRole("dialog", { name: `${platform}历史记录`, exact: true });
      assert(await historyDialog.isVisible(), `${width}px ${platform} 历史抽屉未打开`);
      await assertModalIsolation(page, `${width}px ${platform} 历史抽屉`);
      await page.keyboard.press("Escape");
      assert(!(await historyDialog.isVisible()), `${width}px ${platform} Escape 未关闭历史抽屉`);
      assert(await historyTrigger.evaluate((node) => node === document.activeElement), `${width}px ${platform} Escape 后焦点未返回历史入口`);
      assert(!(await page.getByTestId("app-desktop-content").evaluate((node) => node.inert)), `${width}px ${platform} 历史关闭后底层仍 inert`);
      await historyTrigger.click();
      await page.getByText("还没有任务记录", { exact: true }).waitFor({ state: "visible" });
      assert((await page.getByRole("button", { name: "新任务", exact: true }).count()) === 0, `${platform} 首次空白状态仍显示新任务入口`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert(!overflow, `${width}px ${platform} 出现横向溢出`);
      const topHeight = await page.locator(".workbench-chrome").evaluate((node) => node.getBoundingClientRect().height);
      assert(topHeight >= 56 && topHeight <= 64, `${platform} 顶部工作栏高度异常：${topHeight}`);
      await page.getByRole("button", { name: "关闭历史记录", exact: true }).click();
      assert(await historyTrigger.evaluate((node) => node === document.activeElement), `${width}px ${platform} 关闭按钮后焦点未返回历史入口`);
      if (width === 1600) {
        await page.screenshot({
          path: resolve(evidenceDir, platform === "Amazon" ? "governance-amazon-empty-1600.png" : "governance-taobao-empty-1600.png"),
          animations: "disabled",
        });
      }
    }
    const railLabels = await page.locator(".platform-rail .rail-item").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
    assert(JSON.stringify(railLabels) === JSON.stringify(["淘宝 / 天猫", "Amazon", "设置"]), "左栏不是两个平台加设置");
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1199, height: 800 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert(await page.getByTestId("desktop-only-gate").isVisible(), "1199px 未显示桌面宽度门槛");
    assert(await page.getByTestId("app-desktop-content").getAttribute("inert") !== null, "1199px 底层工作台未隔离");
    assert(await page.getByTestId("app-desktop-content").getAttribute("aria-hidden") === "true", "1199px 底层工作台未从辅助技术隐藏");
    await page.getByTestId("desktop-only-gate").waitFor();
    assert(await page.getByTestId("desktop-only-gate").evaluate((node) => node === document.activeElement), "1199px 门槛未接管焦点");
    await page.screenshot({ path: resolve(evidenceDir, "governance-desktop-gate-1199.png"), animations: "disabled" });
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1200, height: 800 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "设置", exact: true }).click();
    assert(await page.getByRole("dialog", { name: "连接与生成模式", exact: true }).isVisible(), "调整到门禁前设置弹窗未打开");
    await page.setViewportSize({ width: 1199, height: 800 });
    await page.getByTestId("desktop-only-gate").waitFor({ state: "visible" });
    assert((await page.getByRole("dialog", { name: "连接与生成模式", exact: true }).count()) === 0, "进入桌面门禁后设置弹窗仍挂载");
    assert((await page.locator('[role="alertdialog"]:visible').count()) === 1, "进入桌面门禁后出现多个可见模态 owner");
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      if (location.protocol !== "http:" && location.protocol !== "https:") return;
      const now = "2026-01-01T00:00:00.000Z";
      localStorage.setItem("ecom-workbench.projects.v2", JSON.stringify({
        version: 2,
        activeProjectId: "history-project",
        projects: [{
          id: "history-project",
          name: "分页历史商品",
          scope: "task-draft",
          factsLocale: "zh-CN",
          facts: { productName: "分页历史商品", category: "测试", brand: "", model: "", sku: "PAGE-120", targetAudience: "", description: "", sellingPoints: [], forbiddenClaims: [], specifications: {} },
          createdAt: now,
          updatedAt: now,
        }],
      }));
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}?fixture=history-page-fail-once`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("ecom-workbench-runs-v1", 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("production-runs", { keyPath: "id" });
          store.createIndex("by-project", "projectId", { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction("production-runs", "readwrite");
      const store = transaction.objectStore("production-runs");
      for (let index = 0; index < 120; index += 1) {
        const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
        store.put({
          id: `history-run-${String(index).padStart(3, "0")}`,
          projectId: "history-project",
          sessionId: "history-session",
          platformId: "amazon",
          workflowId: "amazon-listing",
          source: "demo",
          status: "planned",
          contextSnapshot: {
            sourceInput: { listingText: "" },
            options: { platformId: "amazon", marketplaceId: "us", plannerMode: "listing", sizeTier: "2K" },
            selectedReferenceAssetIds: [],
          },
          planSnapshot: {
            platformId: "amazon",
            source: "demo",
            slots: [{ slotKey: "MAIN", visibleCopy: "", strategy: "分页验证", evidence: [], prompt: "seed", negativePrompt: "" }],
          },
          events: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    });
    await page.getByRole("button", { name: "Amazon", exact: true }).click();
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    await page.locator(".production-run-card").first().waitFor({ state: "visible" });
    assert((await page.locator(".production-run-card").count()) === 50, "120 条历史首屏不是 50 条");
    const loadEarlier = page.getByRole("button", { name: "加载更早记录", exact: true });
    await loadEarlier.click();
    await page.getByText(/模拟加载更早记录失败.*已加载的记录仍可继续使用/).waitFor({ state: "visible" });
    assert((await page.locator(".production-run-card").count()) === 50, "较早页失败后已加载的 50 条记录未保留");
    await page.getByRole("button", { name: "重试加载", exact: true }).click();
    await page.locator(".production-run-card").nth(99).waitFor({ state: "attached" });
    assert((await page.locator(".production-run-card").count()) === 100, "历史第二页未累加到 100 条");
    await loadEarlier.click();
    await page.locator(".production-run-card").nth(119).waitFor({ state: "attached" });
    assert((await page.locator(".production-run-card").count()) === 120, "历史末页未累加到 120 条");
    assert((await loadEarlier.count()) === 0, "历史末页仍显示加载更早记录");
    await page.screenshot({ path: resolve(evidenceDir, "governance-history-pagination-120-1280.png"), animations: "disabled" });
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}?fixture=history-fail-once`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Amazon", exact: true }).click();
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    await page.getByText("暂时无法读取任务历史", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "重试读取", exact: true }).click();
    await page.getByText("还没有任务记录", { exact: true }).waitFor({ state: "visible" });
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, {
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const theme = await page.evaluate(() => ({
      scheme: getComputedStyle(document.documentElement).colorScheme,
      page: getComputedStyle(document.documentElement).getPropertyValue("--page").trim(),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    }));
    assert(theme.scheme === "light", `深色系统偏好下 color-scheme 不是 light：${theme.scheme}`);
    assert(theme.page.toLowerCase() === "#f3f5f7", `深色系统偏好改变了页面 Token：${theme.page}`);
    assert(theme.themeColor?.toLowerCase() === "#20252b", `浏览器主题色不正确：${theme.themeColor}`);
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, {
      viewport: { width: 1200, height: 640 },
      screen: { width: 1500, height: 800 },
      deviceScaleFactor: 1.25,
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const metrics = await page.evaluate(() => ({ width: window.innerWidth, dpr: window.devicePixelRatio }));
    assert(metrics.width === 1200 && Math.abs(metrics.dpr - 1.25) < 0.01, "125% 缩放等效环境未生效");
    assert(!(await page.getByTestId("desktop-only-gate").isVisible()), "125% 缩放等效的 1200 CSS px 错误触发门禁");
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), "125% 缩放等效环境出现横向溢出");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await assertModalIsolation(page, "125% 缩放等效设置弹窗");
    await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, {
      viewport: { width: 1280, height: 800 },
      forcedColors: "active",
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const historyTrigger = page.getByRole("button", { name: "历史记录", exact: true });
    await historyTrigger.focus();
    const focus = await historyTrigger.evaluate((node) => {
      const style = getComputedStyle(node);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    assert(focus.style !== "none" && focus.width >= 2, "强制色模式下键盘焦点不可见");
    await historyTrigger.click();
    await assertModalIsolation(page, "强制色模式历史抽屉");
    await page.getByRole("button", { name: "关闭历史记录", exact: true }).click();
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, {
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert(await page.evaluate(() => window.devicePixelRatio === 2), "DPR 2 环境未生效");
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), "DPR 2 环境出现横向溢出");
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "设置", exact: true }).click();
    const settingsDialog = page.getByRole("dialog", { name: "连接与生成模式", exact: true });
    assert(await settingsDialog.isVisible(), "设置弹窗未打开");
    await assertModalIsolation(page, "设置弹窗");
    await settingsDialog.getByRole("button", { name: "API", exact: true }).click();
    await page.screenshot({ path: resolve(evidenceDir, "governance-settings-api-dual-1280.png"), animations: "disabled" });
    await settingsDialog.getByRole("button", { name: "单连接", exact: true }).click();
    assert((await settingsDialog.getByText("图片生成服务", { exact: true }).count()) === 0, "单连接模式仍显示独立图片服务");
    await page.screenshot({ path: resolve(evidenceDir, "governance-settings-api-single-1280.png"), animations: "disabled" });
    await settingsDialog.getByRole("button", { name: "关闭弹窗", exact: true }).click();
    const discardDialog = page.getByRole("dialog", { name: "放弃未保存设置？", exact: true });
    assert(await discardDialog.isVisible(), "修改设置后关闭未显示放弃确认");
    await assertModalIsolation(page, "放弃设置确认弹窗");
    assert((await page.locator('[role="dialog"]:visible').count()) === 1, "确认弹窗出现时父设置弹窗仍可操作");
    await page.screenshot({ path: resolve(evidenceDir, "governance-settings-discard-confirm-1280.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    assert(!(await discardDialog.isVisible()), "Escape 未关闭最上层确认弹窗");
    assert(await settingsDialog.isVisible(), "关闭确认弹窗后未返回设置草稿");
    assert(await settingsDialog.getByRole("button", { name: "API", exact: true }).getAttribute("aria-pressed") === "true", "返回设置后草稿状态丢失");
    await settingsDialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "放弃修改", exact: true }).click();
    assert(!(await settingsDialog.isVisible()), "放弃修改后设置弹窗未关闭");
    assert(await page.getByRole("button", { name: "设置", exact: true }).evaluate((node) => node === document.activeElement), "设置关闭后焦点未返回触发按钮");
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1200, height: 800 } });
    await context.addInitScript(() => {
      if (location.protocol !== "http:" && location.protocol !== "https:") return;
      const now = "2026-01-01T00:00:00.000Z";
      localStorage.setItem("ecom-workbench.projects.v2", JSON.stringify({
        version: 2,
        activeProjectId: "old-project",
        projects: [{
          id: "old-project",
          name: "旧项目",
          scope: "library",
          factsLocale: "zh-CN",
          facts: { productName: "旧商品", category: "", brand: "", model: "", sku: "", targetAudience: "", description: "", sellingPoints: [], forbiddenClaims: [], specifications: {} },
          createdAt: now,
          updatedAt: now,
        }],
      }));
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Amazon", exact: true }).click();
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    assert(await page.getByText("还没有任务记录", { exact: true }).isVisible(), "旧项目无 Run 时未显示空历史");
    assert((await page.getByText("筛选条件没有结果", { exact: true }).count()) === 0, "隐藏 platformId 被误判为主动筛选");
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Amazon", exact: true }).click();
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    await page.getByRole("button", { name: "关闭历史记录", exact: true }).click();
    await page.getByText("粘贴 Amazon Listing（可选）", { exact: true }).click();
    await page.getByLabel("Amazon Listing 原文").fill("Title: Demo Travel Pillow\n- Foldable memory foam\n- Washable cover");
    await page.getByRole("button", { name: "填入空字段", exact: true }).click();
    await page.getByRole("button", { name: "生成图片策划", exact: true }).click();
    await page.getByRole("button", { name: "确认并生成策划", exact: true }).click();
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    await page.locator(".production-run-card").waitFor();
    assert((await page.locator(".production-run-card").count()) === 1, "Amazon 策划后历史未显示");
    await page.getByLabel("状态", { exact: true }).selectOption("failed");
    await page.getByText("筛选条件没有结果", { exact: true }).waitFor({ state: "visible" });
    await page.screenshot({ path: resolve(evidenceDir, "governance-history-filter-empty-1280.png"), animations: "disabled" });
    await page.getByRole("button", { name: "清除 1", exact: true }).click();
    await page.locator(".production-run-card").waitFor();
    await page.getByRole("button", { name: "关闭历史记录", exact: true }).click();
    await page.getByText("任务设置", { exact: true }).click();
    await page.getByRole("button", { name: /批量生成/ }).click();
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    await page.locator(".platform-history-pane__active").waitFor();
    assert((await page.locator(".execution-job-panel").count()) === 1, "进行中批量任务未显示");
    await page.getByRole("button", { name: "关闭历史记录", exact: true }).click();
    await page.getByRole("button", { name: "新任务", exact: true }).click();
    assert((await page.getByLabel("Amazon Listing 原文").inputValue()) === "", "Amazon 新任务不是空白输入");
    await page.getByRole("button", { name: "淘宝 / 天猫", exact: true }).click();
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    assert((await page.locator(".production-run-card").count()) === 0, "Amazon 历史泄漏到淘宝");
    assert(await page.getByText("还没有任务记录", { exact: true }).isVisible(), "淘宝空历史不正确");
    await page.getByRole("button", { name: "关闭历史记录", exact: true }).click();
    assert((await page.getByRole("button", { name: "新任务", exact: true }).count()) === 0, "淘宝首次空白状态仍显示新任务入口");
    assert((await page.locator("[role=dialog]:visible").count()) === 0, "新任务打开了对话框");
    assert((await page.getByLabel("商品名称").inputValue()) === "", "淘宝新任务不是空白结构化输入");
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Amazon", exact: true }).click();
    await page.getByLabel("商品名称", { exact: true }).fill("手动填写的保温杯");
    await page.getByLabel("商品描述", { exact: true }).fill("316L 不锈钢内胆，容量 500ml，杯盖可拆洗。");
    await page.getByLabel("核心卖点", { exact: true }).fill("便携防漏\n杯盖可拆洗");
    await page.getByRole("button", { name: "生成图片策划", exact: true }).click();
    await page.getByRole("button", { name: "确认并生成策划", exact: true }).click();
    await page.locator(".slot-card").first().waitFor({ state: "visible" });
    assert((await page.locator(".slot-card").count()) === 7, "Amazon 结构化资料未生成 7 个 Listing 槽位");
    assert(await page.locator(".slot-card__title", { hasText: "核心卖点" }).isVisible(), "Amazon 槽位未使用中文 UI 标签");
    assert((await page.locator(".slot-card__media small").count()) === 0, "空缩略图重复显示槽位 key");
    assert((await page.locator(".workbench-chrome__tools").getByRole("button", { name: /生成下一张|导出/ }).count()) === 0, "生产顶栏仍复制生成或导出主动作");

    const wide = await inspectProductionLayout(page);
    assert(wide && wide.slotsX < wide.inspectorX, "1600px 槽位与检查器顺序错误");
    assert(wide && wide.listColumns === 2, `1600px 槽位列表不是双列：${wide?.listColumns}`);
    assert(wide && wide.inspectorWidth > wide.slotsWidth, "1600px 检查器未保持较宽主工作区");
    assert(wide && !wide.overflow, "1600px Amazon 生产区出现横向溢出");
    await page.screenshot({
      path: resolve(evidenceDir, "governance-amazon-structured-planned-1600.png"),
      animations: "disabled",
    });

    for (const size of [
      { width: 1280, height: 800 },
      { width: 1200, height: 650 },
    ]) {
      await page.setViewportSize(size);
      const compact = await inspectProductionLayout(page);
      assert(compact && compact.slotsX < compact.inspectorX, `${size.width}px 槽位与检查器顺序错误`);
      assert(compact && compact.listColumns === 1, `${size.width}px 槽位列表不是单列：${compact?.listColumns}`);
      assert(compact && compact.inspectorWidth > compact.slotsWidth, `${size.width}px 检查器未保持较宽主工作区`);
      assert(compact && !compact.overflow, `${size.width}px Amazon 生产区出现横向溢出`);
    }

    await page.getByRole("button", { name: "设置", exact: true }).click();
    const settingsDialog = page.getByRole("dialog", { name: "连接与生成模式", exact: true });
    assert(await settingsDialog.isVisible(), "1200×650 设置弹窗未打开");
    const settingsGeometry = await settingsDialog.evaluate((node) => {
      const body = node.querySelector(".dialog__body");
      const footer = node.querySelector(".dialog__footer");
      return {
        withinViewport: node.getBoundingClientRect().bottom <= window.innerHeight,
        bodyScrollable: body instanceof HTMLElement && body.scrollHeight >= body.clientHeight,
        footerVisible: footer instanceof HTMLElement && footer.getBoundingClientRect().bottom <= window.innerHeight,
      };
    });
    assert(settingsGeometry.withinViewport && settingsGeometry.bodyScrollable && settingsGeometry.footerVisible, "1200×650 设置弹窗滚动或底部操作不可达");
    await context.close();
  }

  {
    const context = await createMonitoredContext(browser, { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "淘宝 / 天猫", exact: true }).click();
    await page.getByLabel("商品名称", { exact: true }).fill("云感旅行颈枕");
    await page.getByLabel("商品描述", { exact: true }).fill("慢回弹记忆棉，支持折叠收纳，外套可拆洗。");
    await page.getByLabel("核心卖点", { exact: true }).fill("慢回弹支撑\n折叠收纳\n外套可拆洗");
    await page.getByRole("button", { name: "生成图片策划", exact: true }).click();
    await page.locator(".slot-card").first().waitFor({ state: "visible" });
    assert((await page.locator(".slot-card").count()) === 12, "淘宝策划未生成固定 5+7 槽位");
    await page.getByText("任务设置", { exact: true }).click();
    await page.getByRole("button", { name: "手机预览", exact: true }).click();
    const taobaoPreview = page.getByRole("dialog", { name: "淘宝手机商品页预览", exact: true });
    await taobaoPreview.waitFor({ state: "visible" });
    assert((await taobaoPreview.locator(".taobao-phone-preview__thumbs > button").count()) === 5, "淘宝手机预览主图数量不正确");
    assert((await taobaoPreview.locator('[data-slot-key^="TB-DETAIL"]').count()) === 7, "淘宝手机预览详情图数量不正确");
    assert((await taobaoPreview.innerText()).includes("还需完成 12 个槽位"), "淘宝空结果预览缺失提示不正确");
    await page.screenshot({ path: resolve(evidenceDir, "governance-taobao-planned-preview-1280.png"), animations: "disabled" });
    await context.close();
  }

  assert(runtimeErrors.length === 0, `浏览器出现未预期错误：\n${runtimeErrors.join("\n")}`);
  console.log("桌面双平台工作台浏览器验收通过。");
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
