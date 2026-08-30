import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import {
  defaultRuntimeSettings,
  runtimeTextBaseUrl,
  type ConnectionTestResult,
  type RuntimeSettings,
} from "../domain/settings";
import { Button, ConfirmDialog, Dialog, Field, IconButton, SegmentedControl, Select, StatusMessage } from "./ui";

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
  if (result) return result.message;
  if (draftChanged) return null;
  return null;
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

type RuntimeSettingsField =
  | "connectionMode"
  | "textBaseUrl"
  | "textApiKey"
  | "planningModel"
  | "imageBaseUrl"
  | "imageApiKey"
  | "imageModel";

function runtimeSettingsFieldError(
  error: string | null | undefined,
  field: RuntimeSettingsField,
): string | undefined {
  if (!error) return undefined;
  if (field === "textApiKey" && error === "请填写文本策划 API Key。") return error;
  if (field === "imageApiKey" && error === "请填写图片生成 API Key。") return error;
  if (field === "planningModel" && error === "请填写文本策划模型。") return error;
  if (field === "imageModel" && error === "请填写图片生成模型。") return error;
  if (field === "connectionMode" && error.startsWith("DeepSeek 官方连接仅支持文本策划")) return error;
  if (
    field === "textBaseUrl" &&
    (error.startsWith("文本 API 根地址") || error.startsWith("文本策划请求地址"))
  ) {
    return error;
  }
  if (field === "imageBaseUrl" && error.startsWith("图片服务地址")) return error;
  return undefined;
}

export function SettingsDialog({
  open,
  settings = defaultRuntimeSettings,
  loading = false,
  error = null,
  connectionStatus = "idle",
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
  onExportLocalBackup,
  onImportLocalBackup,
}: {
  open: boolean;
  settings?: RuntimeSettings;
  loading?: boolean;
  error?: string | null;
  connectionStatus?: "idle" | "testing" | "success" | "error";
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
  onExportLocalBackup?: () => Promise<string>;
  onImportLocalBackup?: (file: File) => Promise<string>;
}) {
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<RuntimeSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [testingService, setTestingService] = useState<"text" | "image" | null>(null);
  const [draftChanged, setDraftChanged] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [textResult, setTextResult] = useState<ConnectionTestResult | null>(null);
  const [imageResult, setImageResult] = useState<ConnectionTestResult | null>(null);
  const [textKeyVisible, setTextKeyVisible] = useState(false);
  const [imageKeyVisible, setImageKeyVisible] = useState(false);
  const [backupOperation, setBackupOperation] = useState<"export" | "import" | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [backupConfirmFile, setBackupConfirmFile] = useState<File | null>(null);
  const activeTesting =
    testingService !== null ||
    connectionStatus === "testing" ||
    textConnectionStatus === "testing" ||
    imageConnectionStatus === "testing";
  const operationBusy = saving || activeTesting || loading || backupOperation !== null;
  const controlsDisabled = operationBusy || Boolean(lockReason);

  useEffect(() => {
    if (!open) return;
    setDraft({ ...settings, mode: "api" });
    setDraftChanged(false);
    setSaveMessage(null);
    setTextResult(null);
    setImageResult(null);
    setTextKeyVisible(false);
    setImageKeyVisible(false);
    setBackupOperation(null);
    setBackupMessage(null);
    setBackupError(null);
    setDiscardConfirmOpen(false);
    setBackupConfirmFile(null);
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
    const saved = await onSave({ ...draft, mode: "api" });
    setSaving(false);
    if (saved) {
      setDraftChanged(false);
      setSaveMessage("设置已保存。");
    }
  };

  const testService = async (service: "text" | "image") => {
    setTestingService(service);
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

  const exportBackup = async () => {
    if (!onExportLocalBackup) return;
    setBackupOperation("export");
    setBackupMessage(null);
    setBackupError(null);
    try {
      setBackupMessage(await onExportLocalBackup());
    } catch (backupFailure) {
      setBackupError(backupFailure instanceof Error ? backupFailure.message : "导出本地备份失败，请重试。");
    } finally {
      setBackupOperation(null);
    }
  };

  const importBackup = async (file: File) => {
    if (!onImportLocalBackup) return;
    setBackupConfirmFile(file);
  };

  const confirmImportBackup = async () => {
    const file = backupConfirmFile;
    if (!onImportLocalBackup || !file) return;
    setBackupConfirmFile(null);
    setBackupOperation("import");
    setBackupMessage(null);
    setBackupError(null);
    try {
      setBackupMessage(await onImportLocalBackup(file));
    } catch (backupFailure) {
      setBackupError(backupFailure instanceof Error ? backupFailure.message : "恢复本地备份失败，请检查文件后重试。");
    } finally {
      setBackupOperation(null);
    }
  };

  const closeDialog = useCallback(() => {
    if (operationBusy) return;
    if (draftChanged) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  }, [draftChanged, operationBusy, onClose]);

  const discardChangesAndClose = useCallback(() => {
    setDiscardConfirmOpen(false);
    setDraftChanged(false);
    onClose();
  }, [onClose]);

  const textStatus = textConnectionStatus ?? connectionStatus;
  const textTesting = testingService === "text" || textStatus === "testing";
  const imageTesting = testingService === "image" || imageConnectionStatus === "testing";
  const textMessage = textTesting
    ? "正在测试文本策划 API..."
    : textResult?.message ?? (draftChanged ? null : textConnectionMessage);
  const imageMessage = imageTesting
    ? "正在测试图片生成 API..."
    : imageResult?.message ?? (draftChanged ? null : imageConnectionMessage);
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
  const fieldError = (field: RuntimeSettingsField) => runtimeSettingsFieldError(error, field);
  const hasFieldError = (
    [
      "connectionMode",
      "textBaseUrl",
      "textApiKey",
      "planningModel",
      "imageBaseUrl",
      "imageApiKey",
      "imageModel",
    ] as RuntimeSettingsField[]
  ).some((field) => Boolean(fieldError(field)));

  return (
    <>
      <Dialog
      open={open && !discardConfirmOpen && backupConfirmFile === null}
      title="运行设置"
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
            <Field
              label="连接模式"
              error={fieldError("connectionMode")}
            >
              <SegmentedControl
                className="settings-connection-tabs"
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
              <Field
                label="文本 API 根地址"
                hint="例如 https://provider.example/v1"
                error={fieldError("textBaseUrl")}
              >
                <input
                  name="textBaseUrl"
                  type="url"
                  value={draft.textBaseUrl ?? baseFromEndpoint(draft)}
                  disabled={controlsDisabled}
                  onChange={(event) => update("textBaseUrl", event.target.value)}
                />
              </Field>
              <Field label="文本 API Key" error={fieldError("textApiKey")}>
                <div className="settings-secret-field">
                  <input name="textApiKey" aria-label="API Key" type={textKeyVisible ? "text" : "password"} value={textKey} autoComplete="off" disabled={controlsDisabled} onChange={(event) => update("textApiKey", event.target.value)} />
                  <IconButton
                    label={textKeyVisible ? "隐藏文本 API Key" : "显示文本 API Key"}
                    aria-pressed={textKeyVisible}
                    disabled={controlsDisabled}
                    onClick={() => setTextKeyVisible((visible) => !visible)}
                  >
                    {textKeyVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  </IconButton>
                </div>
              </Field>
              {effectiveConnectionMode === "single" ? <Field label="图片生成模型" name="imageModel" error={fieldError("imageModel")}><input value={draft.imageModel} disabled={controlsDisabled} onChange={(event) => update("imageModel", event.target.value)} /></Field> : null}
              {String(draft.textBaseUrl ?? baseFromEndpoint(draft)).includes("api.deepseek.com") ? <StatusMessage tone="warning">{effectiveConnectionMode === "single" ? "DeepSeek 官方连接不支持生图；请改用双配置并设置独立图片服务。" : "DeepSeek 官方策划接口仅接收文本；参考图会在策划请求中明确跳过，正式生图仍使用独立图片服务。"}</StatusMessage> : null}
              <Field label="文本策划模型" error={fieldError("planningModel")}>
                <input
                  name="planningModel"
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
                {textMessage ? <StatusMessage tone={textTone} live={textTone === "danger" ? "assertive" : "polite"}>{textMessage}</StatusMessage> : null}
              </div>
            </section>

            {effectiveConnectionMode === "dual" ? <section className="settings-service-group" aria-labelledby="image-service-title">
              <div className="settings-service-group__heading">
                <h3 id="image-service-title">图片生成服务</h3>
                <p>用于根据已确认的槽位提示词生成商品图片。连接测试只验证权限，不实际生图。</p>
              </div>
              <Field
                label="图片 API 根地址"
                hint="例如 https://provider.example/v1"
                error={fieldError("imageBaseUrl")}
              >
                <input
                  name="imageBaseUrl"
                  type="url"
                  value={draft.imageBaseUrl}
                  disabled={controlsDisabled}
                  onChange={(event) => update("imageBaseUrl", event.target.value)}
                />
              </Field>
              <Field label="图片 API Key" error={fieldError("imageApiKey")}>
                <div className="settings-secret-field">
                  <input name="imageApiKey" aria-label="图片 API Key" type={imageKeyVisible ? "text" : "password"} value={imageKey} autoComplete="off" disabled={controlsDisabled} onChange={(event) => update("imageApiKey", event.target.value)} />
                  <IconButton
                    label={imageKeyVisible ? "隐藏图片 API Key" : "显示图片 API Key"}
                    aria-pressed={imageKeyVisible}
                    disabled={controlsDisabled}
                    onClick={() => setImageKeyVisible((visible) => !visible)}
                  >
                    {imageKeyVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  </IconButton>
                </div>
              </Field>
              <Field label="图片生成模型" error={fieldError("imageModel")}>
                <input
                  name="imageModel"
                  value={draft.imageModel}
                  disabled={controlsDisabled}
                  onChange={(event) => update("imageModel", event.target.value)}
                />
              </Field>
              <Field
                label="生成方式"
                hint="当前工作台使用同步生成。异步生成尚未实现，入口已禁用。"
              >
                <Select
                  aria-label="图片生成方式"
                  value={draft.imageGenerationMode ?? "sync"}
                  disabled={controlsDisabled}
                  onChange={(event) => update("imageGenerationMode", event.target.value as RuntimeSettings["imageGenerationMode"])}
                >
                  <option value="sync">同步生成</option>
                  <option value="async" disabled>异步生成（预留）</option>
                </Select>
              </Field>
              <StatusMessage>
                局部重绘（mask-edit）能力取决于当前图片服务商：OpenAI 兼容端点通常支持；OpenRouter / DeepSeek 等可能仅支持文生图。可在槽位检查器查看是否可用。
              </StatusMessage>
              <div className="settings-service-actions">
                <Button
                  variant="secondary"
                  className="settings-form__test"
                  disabled={controlsDisabled}
                  onClick={() => void testService("image")}
                >
                  {imageTesting ? "正在测试..." : "测试图片 API"}
                </Button>
                {imageMessage ? <StatusMessage tone={imageTone} live={imageTone === "danger" ? "assertive" : "polite"}>{imageMessage}</StatusMessage> : null}
              </div>
            </section> : null}


        <section className="settings-service-group" aria-labelledby="privacy-info-title">
          <div className="settings-service-group__heading">
            <h3 id="privacy-info-title">数据存储说明</h3>
          </div>
          <div className="privacy-info-grid">
            <div className="privacy-info-card">
              <strong>浏览器本地</strong>
              <span>商品资料、参考图、策划方案、生成结果和工作记录仅保存在当前浏览器的 localStorage 和 IndexedDB 中。</span>
            </div>
            <div className="privacy-info-card">
              <strong>API 请求</strong>
              <span>仅在你主动执行策划或生成时，Prompt 和参考图会发送到你配置的 AI 服务地址。Key 不会写入仓库或静态构建。</span>
            </div>
            <div className="privacy-info-card">
              <strong>本地备份</strong>
              <span>导出的 JSON 备份不含 API Key 和 Provider 设置。恢复备份不会覆盖当前运行配置。</span>
            </div>
            <div className="privacy-info-card">
              <strong>你的控制</strong>
              <span>所有数据属于你。删除项目、清空浏览器存储或恢复备份都由你主动操作，没有自动同步或云端上传。</span>
            </div>
          </div>
        </section>

        <section className="settings-service-group" aria-labelledby="local-backup-title">
          <div className="settings-service-group__heading">
            <h3 id="local-backup-title">本地数据备份</h3>
            <p>包含商品、素材、工作区、生产记录和本地任务；不包含 API Key 或 Provider 设置。</p>
          </div>
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="选择本地备份文件"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importBackup(file);
            }}
          />
          <div className="settings-service-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={controlsDisabled || !onExportLocalBackup}
              onClick={() => void exportBackup()}
            >
              {backupOperation === "export" ? "正在导出..." : "导出本地备份"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={controlsDisabled || !onImportLocalBackup}
              onClick={() => backupInputRef.current?.click()}
            >
              {backupOperation === "import" ? "正在恢复..." : "恢复本地备份"}
            </Button>
          </div>
          {backupMessage ? <StatusMessage tone="success" live="polite">{backupMessage}</StatusMessage> : null}
          {backupError ? <StatusMessage tone="danger" live="assertive">{backupError}</StatusMessage> : null}
        </section>

        {lockReason ? <StatusMessage tone="warning">{lockReason}</StatusMessage> : null}
        {error && !hasFieldError ? <StatusMessage tone="danger" live="assertive">{error}</StatusMessage> : null}
        {saveMessage ? <StatusMessage tone="success" live="polite">{saveMessage}</StatusMessage> : null}
      </form>
      </Dialog>
      <ConfirmDialog
        open={discardConfirmOpen}
        title="提示"
        eyebrow=""
        description="当前设置只保存在本次弹窗草稿中，关闭后将丢失这些修改。"
        confirmLabel="放弃"
        onConfirm={discardChangesAndClose}
        onCancel={() => setDiscardConfirmOpen(false)}
      />
      <ConfirmDialog
        open={backupConfirmFile !== null}
        title="恢复本地备份？"
        description="恢复备份会替换当前商品、素材、工作区、生产记录和本地任务；API 设置不会改变。"
        confirmLabel="恢复备份"
        onConfirm={() => void confirmImportBackup()}
        onCancel={() => setBackupConfirmFile(null)}
      />
    </>
  );
}
