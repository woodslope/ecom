import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "../src/components/AppShell";
import {
  connectionFeedbackMessage,
  runConnectionTestSafely,
  SettingsDialog,
} from "../src/components/SettingsDialog";
import type { RuntimeSettings } from "../src/domain/settings";

const apiSettings: RuntimeSettings = {
  mode: "api",
  apiKey: "sk-password-field-only",
  planningEndpoint: "https://provider.example/v1/chat/completions",
  planningModel: "planning-model",
  imageBaseUrl: "https://provider.example/v1",
  imageModel: "image-model",
  textBaseUrl: "https://provider.example/v1",
  textApiKey: "text-key",
  imageApiKey: "image-key",
  imageGenerationMode: "sync",
};

describe("settings UI", () => {
  it("renders usable API configuration and keeps the key inside a password field", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsDialog, {
        open: true,
        settings: apiSettings,
        loading: false,
        error: null,
        connectionStatus: "idle",
        connectionMessage: null,
        onClose: () => undefined,
        onSave: async () => true,
        onTest: async () => ({ ok: true, message: "连接成功" }),
      }),
    );

    expect(markup).toContain("文本策划服务");
    expect(markup).toContain("图片生成服务");
    expect(markup).toContain("文本 API 根地址");
    expect(markup).toContain("图片 API 根地址");
    expect(markup).toContain("测试文本 API");
    expect(markup).toContain("测试图片 API");
    expect(markup).toContain("填写到 /v1");
    expect(markup).toContain('aria-label="运行模式"');
    expect(markup).toContain('aria-label="API Key"');
    expect(markup).toContain('type="password"');
    expect(markup.match(/sk-password-field-only/g)).toHaveLength(1);
    expect(markup).toContain("测试连接");
    expect(markup).toContain("保存设置");
    expect(markup).toContain("未加密的浏览器本地数据");
    expect(markup).toContain("文本与图片服务地址");
    expect(markup).toContain("清空此字段");
    expect(markup).toContain("同时删除本地项目与素材");
    expect(markup).not.toContain("API 配置尚未启用");
  });

  it("shows API mode honestly in desktop and mobile context badges", () => {
    const markup = renderToStaticMarkup(
      createElement(AppShell, {
        activeItem: "amazon",
        runtimeSettings: apiSettings,
        onActiveItemChange: () => undefined,
        children: createElement("div"),
      }),
    );

    expect(markup).toContain("API 引擎");
    expect(markup).toContain("当前运行模式：API 引擎");
    expect(markup).not.toContain("真实 API 尚未配置");
  });

  it("does not reuse an old connection result after the draft changes", () => {
    expect(
      connectionFeedbackMessage({
        draftChanged: true,
        testing: false,
        result: null,
      }),
    ).toBeNull();
    expect(
      connectionFeedbackMessage({
        draftChanged: false,
        testing: false,
        result: { ok: true, message: "文本策划 API 连接成功。" },
      }),
    ).toBe("文本策划 API 连接成功。");

    const markup = renderToStaticMarkup(
      createElement(SettingsDialog, {
        open: true,
        settings: apiSettings,
        connectionStatus: "success",
        connectionMessage: "旧配置连接成功",
        onClose: () => undefined,
      }),
    );
    expect(markup).not.toContain("旧配置连接成功");
  });

  it("turns an unexpected connection-test rejection into safe feedback", async () => {
    const result = await runConnectionTestSafely(async () => {
      throw new Error("transport leaked sk-secret-value");
    }, apiSettings);

    expect(result).toEqual({
      ok: false,
      message: "API 连接测试未能完成，请检查网络、代理或服务配置后重试。",
    });
    expect(result.message).not.toContain("sk-secret-value");
  });

  it("locks settings controls while a connection test is running", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsDialog, {
        open: true,
        settings: apiSettings,
        connectionStatus: "testing",
        connectionMessage: "正在测试文本策划 API...",
        onClose: () => undefined,
      }),
    );

    expect(markup).toContain("正在测试文本策划 API...");
    expect(markup).toContain("正在测试...");
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it("keeps runtime settings read-only while an AI task is active", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsDialog, {
        open: true,
        settings: apiSettings,
        lockReason: "Amazon · PT01 正在生成，请完成或取消后再修改运行设置。",
        onClose: () => undefined,
      }),
    );

    expect(markup).toContain("Amazon · PT01 正在生成，请完成或取消后再修改运行设置。");
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });
});
