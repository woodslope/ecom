import { useCallback, useEffect, useState } from "react";

import {
  defaultRuntimeSettings,
  runtimeTextBaseUrl,
  type ConnectionTestResult,
  type RuntimeSettings,
} from "../domain/settings";
import { Button, Dialog, Field, SegmentedControl, StatusMessage } from "./ui";

export function connectionFeedbackMessage({
  draftChanged,
  testing,
  result,
}: {
  draftChanged: boolean;
  testing: boolean;
  result: ConnectionTestResult | null;
}): string | null {
  if (testing) return "正在测试文本策划 API...";
  if (draftChanged) return null;
  return result?.message ?? null;
}

export async function runConnectionTestSafely(
  onTest: (settings: RuntimeSettings) => Promise<ConnectionTestResult>,
  settings: RuntimeSettings,
  service: "text" | "image" = "text",
): Promise<ConnectionTestResult> {
  try {
    return await onTest(settings);
  } catch {
    return {
      ok: false,
      message:
        service === "image"
          ? "图片 API 连接测试未能完成，请检查网络、代理或服务配置后重试。"
          : "API 连接测试未能完成，请检查网络、代理或服务配置后重试。",
    };
  }
}

function baseFromEndpoint(settings: RuntimeSettings): string {
  return runtimeTextBaseUrl(settings);
}

export function SettingsDialog({
  open,
  settings = defaultRuntimeSettings,
  loading = false,
  error = null,
  connectionStatus = "idle",
  connectionMessage = null,
  textConnectionStatus,
  textConnectionMessage = null,
  imageConnectionStatus,
  imageConnectionMessage = null,
  lockReason = null,
  onClose,
  onSave = async () => true,
  onTest = async () => ({ ok: true, message: "连接成功" }),
  onTestText,
  onTestImage,
}: {
  open: boolean;
  settings?: RuntimeSettings;
  loading?: boolean;
  error?: string | null;
  connectionStatus?: "idle" | "testing" | "success" | "error";
  connectionMessage?: string | null;
  textConnectionStatus?: "idle" | "testing" | "success" | "error";
  textConnectionMessage?: string | null;
  imageConnectionStatus?: "idle" | "testing" | "success" | "error";
  imageConnectionMessage?: string | null;
  lockReason?: string | null;
  onClose: () => void;
  onSave?: (settings: RuntimeSettings) => Promise<boolean>;
  onTest?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  onTestText?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  onTestImage?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
}) {
  const [draft, setDraft] = useState<RuntimeSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [testingService, setTestingService] = useState<"text" | "image" | null>(null);
  const [draftChanged, setDraftChanged] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [textResult, setTextResult] = useState<ConnectionTestResult | null>(null);
  const [imageResult, setImageResult] = useState<ConnectionTestResult | null>(null);
  const activeTesting =
    testingService !== null ||
    connectionStatus === "testing" ||
    textConnectionStatus === "testing" ||
    imageConnectionStatus === "testing";
  const operationBusy = saving || activeTesting || loading;
  const controlsDisabled = operationBusy || Boolean(lockReason);

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setDraftChanged(false);
    setSaveMessage(null);
    setTextResult(null);
    setImageResult(null);
  }, [open, settings]);

  const update = <Key extends keyof RuntimeSettings>(key: Key, value: RuntimeSettings[Key]) => {
    setDraft((current) => {
      if (key === "textBaseUrl") {
        const base = String(value ?? "").replace(/\/+$/, "");
        return { ...current, textBaseUrl: base, planningEndpoint: `${base}/chat/completions` };
      }
      if (key === "textApiKey") {
        const next = String(value ?? "");
        return { ...current, textApiKey: next, apiKey: next };
      }
      return { ...current, [key]: value };
    });
    setDraftChanged(true);
    setSaveMessage(null);
    setTextResult(null);
    setImageResult(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    const saved = await onSave(draft);
    setSaving(false);
    if (saved) setSaveMessage("设置已保存。");
  };

  const testService = async (service: "text" | "image") => {
    setTestingService(service);
    setDraftChanged(false);
    if (service === "text") setTextResult(null);
    else setImageResult(null);
    try {
      const result = await runConnectionTestSafely(
        service === "text" ? onTestText ?? onTest : onTestImage ?? onTest,
        draft,
        service,
      );
      if (service === "text") setTextResult(result);
      else setImageResult(result);
    } finally {
      setTestingService(null);
    }
  };

  const closeDialog = useCallback(() => {
    if (!operationBusy) onClose();
  }, [operationBusy, onClose]);

  const textStatus = textConnectionStatus ?? connectionStatus;
  const textTesting = testingService === "text" || textStatus === "testing";
  const imageTesting = testingService === "image" || imageConnectionStatus === "testing";
  const textMessage = textTesting
    ? "正在测试文本策划 API..."
    : draftChanged
      ? null
      : textResult?.message ?? textConnectionMessage;
  const imageMessage = imageTesting
    ? "正在测试图片生成 API..."
    : draftChanged
      ? null
      : imageResult?.message ?? imageConnectionMessage;
  const textTone = (textResult?.ok ?? (textConnectionStatus === "success" ? true : undefined))
    ? "success"
    : textResult?.ok === false || textConnectionStatus === "error"
      ? "danger"
      : "neutral";
  const imageTone = (imageResult?.ok ?? (imageConnectionStatus === "success" ? true : undefined))
    ? "success"
    : imageResult?.ok === false || imageConnectionStatus === "error"
      ? "danger"
      : "neutral";
  const textKey = draft.apiKey || draft.textApiKey || "";
  const imageKey = draft.imageApiKey !== undefined ? draft.imageApiKey : draft.apiKey || "";
  const effectiveConnectionMode = draft.connectionMode ?? "dual";

  return (
    <Dialog
      open={open}
      title="连接与生成模式"
      eyebrow="运行设置"
      className="settings-dialog"
      onClose={closeDialog}
      footer={
        <>
          <Button variant="secondary" onClick={closeDialog} disabled={operationBusy}>
            取消
          </Button>
          <Button form="runtime-settings-form" type="submit" disabled={controlsDisabled}>
            {saving || loading ? "正在保存..." : "保存设置"}
          </Button>
        </>
      }
    >
      <form id="runtime-settings-form" className="settings-form" onSubmit={submit}>
        <Field label="运行模式" hint="演示模式不会将商品资料发送到外部服务；API 模式使用下面两组服务配置。">
          <SegmentedControl
            ariaLabel="运行模式"
            value={draft.mode}
            disabled={controlsDisabled}
            options={[
              { value: "demo", label: "本地演示" },
              { value: "api", label: "API" },
            ]}
            onChange={(mode) => update("mode", mode)}
          />
        </Field>

        {draft.mode === "demo" ? (
          <StatusMessage tone="warning">
            当前使用本地演示引擎。它可以走通策划、版本和导出流程，但不会调用真实模型。
          </StatusMessage>
        ) : (
          <>
            <StatusMessage tone="warning">
              API Key 会作为未加密的浏览器本地数据保存，并发送到你填写的文本与图片服务地址。请勿在共享设备使用；移除密钥时先清空此字段（或对应服务字段），再切换为演示模式并保存。清除整个网站数据会同时删除本地项目与素材。
            </StatusMessage>

            <Field label="连接模式" hint="双配置分别连接策划与生图；单连接复用同一根地址和密钥。">
              <SegmentedControl
                ariaLabel="连接模式"
                value={effectiveConnectionMode}
                disabled={controlsDisabled}
                options={[{ value: "dual", label: "双配置" }, { value: "single", label: "单连接" }]}
                onChange={(connectionMode) => update("connectionMode", connectionMode)}
              />
            </Field>

            <section className="settings-service-group" aria-labelledby="planning-service-title">
              <div className="settings-service-group__heading">
                <h3 id="planning-service-title">{effectiveConnectionMode === "single" ? "统一模型连接" : "文本策划服务"}</h3>
                <p>{effectiveConnectionMode === "single" ? "策划与生图复用此根地址和密钥，模型仍可分别指定。" : "用于生成平台策划、槽位文案与图像提示词。根地址统一填写到 /v1。"}</p>
              </div>
              <Field label="文本 API 根地址" hint="例如 https://provider.example/v1">
                <input
                  type="url"
                  value={draft.textBaseUrl ?? baseFromEndpoint(draft)}
                  disabled={controlsDisabled}
                  onChange={(event) => update("textBaseUrl", event.target.value)}
                />
              </Field>
              <Field label="文本 API Key">
                <input aria-label="API Key" type="password" value={textKey} autoComplete="off" disabled={controlsDisabled} onChange={(event) => update("textApiKey", event.target.value)} />
              </Field>
              {effectiveConnectionMode === "single" ? <Field label="图片生成模型"><input value={draft.imageModel} disabled={controlsDisabled} onChange={(event) => update("imageModel", event.target.value)} /></Field> : null}
              {String(draft.textBaseUrl ?? baseFromEndpoint(draft)).includes("api.deepseek.com") ? <StatusMessage tone="warning">{effectiveConnectionMode === "single" ? "DeepSeek 官方连接不支持生图；请改用双配置并设置独立图片服务。" : "DeepSeek 官方策划接口仅接收文本；参考图会在策划请求中明确跳过，正式生图仍使用独立图片服务。"}</StatusMessage> : null}
              <Field label="文本策划模型">
                <input
                  value={draft.planningModel}
                  disabled={controlsDisabled}
                  onChange={(event) => update("planningModel", event.target.value)}
                />
              </Field>
              <div className="settings-service-actions">
                <Button
                  variant="secondary"
                  className="settings-form__test"
                  data-legacy-label="测试连接"
                  disabled={controlsDisabled}
                  onClick={() => void testService("text")}
                >
                  {textTesting ? "正在测试..." : "测试文本 API"}
                </Button>
                {textMessage ? <StatusMessage tone={textTone}>{textMessage}</StatusMessage> : null}
              </div>
            </section>

            {effectiveConnectionMode === "dual" ? <section className="settings-service-group" aria-labelledby="image-service-title">
              <div className="settings-service-group__heading">
                <h3 id="image-service-title">图片生成服务</h3>
                <p>用于根据已确认的槽位提示词生成商品图片。连接测试只验证权限，不实际生图。</p>
              </div>
              <Field label="图片 API 根地址" hint="例如 https://provider.example/v1">
                <input
                  type="url"
                  value={draft.imageBaseUrl}
                  disabled={controlsDisabled}
                  onChange={(event) => update("imageBaseUrl", event.target.value)}
                />
              </Field>
              <Field label="图片 API Key">
                <input aria-label="图片 API Key" type="password" value={imageKey} autoComplete="off" disabled={controlsDisabled} onChange={(event) => update("imageApiKey", event.target.value)} />
              </Field>
              <Field label="图片生成模型">
                <input
                  value={draft.imageModel}
                  disabled={controlsDisabled}
                  onChange={(event) => update("imageModel", event.target.value)}
                />
              </Field>
              <Field label="生成方式" hint="当前工作台先使用同步生成；异步状态机后续接入。">
                <div className="settings-mode-switch" role="group" aria-label="图片生成方式">
                  <Button
                    type="button"
                    variant={draft.imageGenerationMode !== "async" ? "primary" : "secondary"}
                    size="compact"
                    disabled={controlsDisabled}
                    aria-pressed={draft.imageGenerationMode !== "async"}
                    onClick={() => update("imageGenerationMode", "sync")}
                  >
                    同步生成
                  </Button>
                  <Button
                    type="button"
                    variant={draft.imageGenerationMode === "async" ? "primary" : "secondary"}
                    size="compact"
                    disabled={controlsDisabled}
                    aria-pressed={draft.imageGenerationMode === "async"}
                    onClick={() => update("imageGenerationMode", "async")}
                  >
                    异步生成（预留）
                  </Button>
                </div>
              </Field>
              <div className="settings-service-actions">
                <Button
                  variant="secondary"
                  className="settings-form__test"
                  disabled={controlsDisabled}
                  onClick={() => void testService("image")}
                >
                  {imageTesting ? "正在测试..." : "测试图片 API"}
                </Button>
                {imageMessage ? <StatusMessage tone={imageTone}>{imageMessage}</StatusMessage> : null}
              </div>
            </section> : null}
          </>
        )}

        {lockReason ? <StatusMessage tone="warning">{lockReason}</StatusMessage> : null}
        {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
        {saveMessage ? <StatusMessage tone="success">{saveMessage}</StatusMessage> : null}
        {connectionMessage && !textConnectionStatus && !imageConnectionStatus ? null : null}
      </form>
    </Dialog>
  );
}
