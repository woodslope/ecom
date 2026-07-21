import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GenerationActions,
  GenerationFailureStatus,
  GenerationTaskStatus,
} from "../src/components/GenerationActions";
import { VersionStrip } from "../src/components/VersionStrip";
import { AssetLibrary } from "../src/components/AssetLibrary";
import {
  copilotDraftDisabledReason,
  isSlotDraftDirty,
  SlotInspector,
} from "../src/components/SlotInspector";
import type { SlotVersionState } from "../src/domain/generation/types";
import { amazonRulePack } from "../src/domain/platforms/amazon";

const versionState: SlotVersionState = {
  activeVersionId: "version_02",
  versions: [
    {
      id: "version_01",
      slotKey: "PT01",
      assetId: "asset_01",
      createdAt: "2026-07-17T08:00:00.000Z",
      source: "demo",
      promptSnapshot: "First prompt",
      visibleCopySnapshot: "First copy",
      width: 2000,
      height: 2000,
      mimeType: "image/svg+xml",
      parameters: { engine: "demo-svg-v1" },
    },
    {
      id: "version_02",
      slotKey: "PT01",
      assetId: "asset_02",
      createdAt: "2026-07-17T09:00:00.000Z",
      source: "demo",
      promptSnapshot: "Second prompt",
      visibleCopySnapshot: "Second copy",
      width: 2000,
      height: 2000,
      mimeType: "image/svg+xml",
      parameters: { engine: "demo-svg-v1" },
    },
  ],
};

const assets = [
  {
    metadata: {
      id: "asset_01",
      projectId: "project_01",
      name: "version-01.svg",
      kind: "generated" as const,
      role: "amazon:PT01",
      tags: [],
      mimeType: "image/svg+xml",
      size: 128,
      createdAt: "2026-07-17T08:00:00.000Z",
      updatedAt: "2026-07-17T08:00:00.000Z",
    },
    objectUrl: "blob:test/version-01",
  },
  {
    metadata: {
      id: "asset_02",
      projectId: "project_01",
      name: "version-02.svg",
      kind: "generated" as const,
      role: "amazon:PT01",
      tags: [],
      mimeType: "image/svg+xml",
      size: 128,
      createdAt: "2026-07-17T09:00:00.000Z",
      updatedAt: "2026-07-17T09:00:00.000Z",
    },
    objectUrl: "blob:test/version-02",
  },
];

describe("generation UI contract", () => {
  it("renders honest first-generation, pending cancel, and retry actions", () => {
    const firstMarkup = renderToStaticMarkup(
      createElement(GenerationActions, {
        hasVersion: false,
        generating: false,
        onGenerate: () => undefined,
      }),
    );
    const pendingMarkup = renderToStaticMarkup(
      createElement(GenerationActions, {
        hasVersion: true,
        generating: true,
        onGenerate: () => undefined,
      }),
    );
    const apiMarkup = renderToStaticMarkup(
      createElement(GenerationActions, {
        hasVersion: false,
        generating: false,
        runtimeMode: "api",
        onGenerate: () => undefined,
      }),
    );
    const taskMarkup = renderToStaticMarkup(
      createElement(GenerationTaskStatus, {
        target: { platformId: "amazon", slotKey: "PT01" },
        onCancel: () => undefined,
      }),
    );
    const cancelingMarkup = renderToStaticMarkup(
      createElement(GenerationTaskStatus, {
        target: { platformId: "amazon", slotKey: "PT01" },
        canceling: true,
        onCancel: () => undefined,
      }),
    );
    const lockedMarkup = renderToStaticMarkup(
      createElement(GenerationActions, {
        hasVersion: false,
        generating: false,
        disabled: true,
        disabledReason: "Amazon · PT01 正在生成，请先等待或取消。",
        onGenerate: () => undefined,
      }),
    );

    expect(firstMarkup).toContain("生成图片");
    expect(firstMarkup).toContain("本地 Demo mock");
    expect(apiMarkup).toContain("API 图片生成");
    expect(apiMarkup).not.toContain("本地 Demo mock");
    expect(pendingMarkup).toContain("正在生成");
    expect(pendingMarkup).not.toContain("取消生成");
    expect(taskMarkup).toContain("Amazon · PT01 正在生成");
    expect(taskMarkup).toContain("取消生成");
    expect(cancelingMarkup).toContain("正在取消生成");
    expect(cancelingMarkup).toContain("正在取消...");
    expect(cancelingMarkup).toContain("disabled");
    expect(lockedMarkup).toContain("Amazon · PT01 正在生成，请先等待或取消。");
    expect(lockedMarkup).toContain("disabled");
  });

  it("detects an unsaved prompt or visible-copy draft before generation", () => {
    const slot = {
      slotKey: "PT01",
      visibleCopy: "Saved copy",
      strategy: "Strategy",
      evidence: ["Evidence"],
      prompt: "Saved prompt",
      negativePrompt: "Negative",
    };

    expect(isSlotDraftDirty(slot, "Saved copy", "Saved prompt")).toBe(false);
    expect(isSlotDraftDirty(slot, "Unsaved copy", "Saved prompt")).toBe(true);
    expect(isSlotDraftDirty(slot, "Saved copy", "Unsaved prompt")).toBe(true);
  });

  it("requires saving a dirty slot draft before Copilot can run", () => {
    expect(copilotDraftDisabledReason(false)).toBeUndefined();
    expect(copilotDraftDisabledReason(true)).toBe(
      "当前 Prompt 或可见文案尚未保存，请先保存文案与提示词后再使用 Copilot。",
    );
  });

  it("keeps an off-screen generation failure attributable and recoverable", () => {
    const markup = renderToStaticMarkup(
      createElement(GenerationFailureStatus, {
        target: { platformId: "amazon", slotKey: "PT01" },
        message: "图片生成失败：服务暂时不可用。",
        onOpen: () => undefined,
        onClear: () => undefined,
      }),
    );

    expect(markup).toContain("Amazon · PT01 生成未完成");
    expect(markup).toContain("图片生成失败：服务暂时不可用。");
    expect(markup).toContain("查看槽位");
    expect(markup).toContain('aria-label="关闭生成提示"');
  });

  it("renders two switchable thumbnail versions with an explicit active state", () => {
    const markup = renderToStaticMarkup(
      createElement(VersionStrip, {
        state: versionState,
        assets,
        disabled: false,
        onActivate: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="图片版本"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('alt="版本 1"');
    expect(markup).toContain('alt="版本 2"');
    expect(markup).toContain("当前版本");
  });

  it("marks an active image created from an older slot draft as stale", () => {
    const markup = renderToStaticMarkup(
      createElement(SlotInspector, {
        rulePack: amazonRulePack,
        slot: {
          slotKey: "PT01",
          visibleCopy: "Current copy",
          strategy: "Current strategy",
          evidence: ["Current evidence"],
          prompt: "Current prompt",
          negativePrompt: "Negative",
        },
        versionState,
        assets,
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("当前图基于旧草稿");
    expect(markup).toContain("请重新生成后再计入交付");
  });

  it("shows a current generated version as complete instead of keeping the planning gap badge", () => {
    const currentVersionState: SlotVersionState = {
      ...versionState,
      versions: versionState.versions.map((version) =>
        version.id === versionState.activeVersionId
          ? { ...version, planningInputSignature: "input-v2" }
          : version,
      ),
    };
    const markup = renderToStaticMarkup(
      createElement(SlotInspector, {
        rulePack: amazonRulePack,
        slot: {
          slotKey: "PT01",
          visibleCopy: "Second copy",
          strategy: "Current strategy",
          evidence: ["待补资料：需要补充更多商品视角"],
          prompt: "Second prompt",
          negativePrompt: "Negative",
        },
        versionState: currentVersionState,
        planningInputSignature: "input-v2",
        assets,
        onSave: async () => true,
      }),
    );
    const identityHeader = markup.slice(
      markup.indexOf('aria-label="槽位身份"'),
      markup.indexOf("</header>"),
    );

    expect(identityHeader).toContain("已完成");
    expect(identityHeader).not.toContain("待补资料");
  });

  it("distinguishes actual, requested, and target upload image sizes", () => {
    const sizedVersionState: SlotVersionState = {
      activeVersionId: "version_api",
      versions: [
        {
          ...versionState.versions[1],
          id: "version_api",
          source: "api",
          width: 1254,
          height: 1254,
          parameters: {
            size: "2048x2048",
            requestedSize: "2048x2048",
            actualSize: "1254x1254",
            uploadSize: "2000x2000",
          },
        },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(SlotInspector, {
        rulePack: amazonRulePack,
        slot: {
          slotKey: "PT01",
          visibleCopy: "Second copy",
          strategy: "Current strategy",
          evidence: ["Current evidence"],
          prompt: "Second prompt",
          negativePrompt: "Negative",
        },
        versionState: sizedVersionState,
        assets,
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("实际图片 1254×1254px");
    expect(markup).toContain("生成请求 2048×2048px");
    expect(markup).toContain("目标上传 2000×2000px");
  });

  it("does not expose the generic asset delete action for generated version Blobs", () => {
    const markup = renderToStaticMarkup(
      createElement(AssetLibrary, {
        assets: [assets[0]],
        loading: false,
        title: "生成结果",
        allowUpload: false,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
      }),
    );

    expect(markup).not.toContain('aria-label="删除素材 version-01.svg"');
    expect(markup).toContain("生成结果");
    expect(markup).not.toContain("上传图片");
  });
});
