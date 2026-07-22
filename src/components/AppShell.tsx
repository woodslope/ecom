import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Cloud, CloudOff, Monitor } from "lucide-react";

import type { NavigationItemId } from "../domain/platforms/types";
import type { ProductProject } from "../domain/projects/types";
import { defaultRuntimeSettings, type ConnectionTestResult, type RuntimeSettings } from "../domain/settings";
import { PlatformRail } from "./PlatformRail";
import { SettingsDialog } from "./SettingsDialog";
import { StatusChip } from "./ui";

export type AppShellHandle = {
  openSettings: () => void;
};

export const DESKTOP_MIN_WIDTH = 900;

export function AppShell({
  activeItem,
  onActiveItemChange,
  projects = [],
  activeProject = null,
  loading = false,
  onCreateProject = () => undefined,
  onSelectProject = () => undefined,
  runtimeSettings = defaultRuntimeSettings,
  settingsLoading = false,
  settingsError = null,
  connectionTestStatus = "idle",
  connectionTestMessage = null,
  textConnectionTestStatus = "idle",
  textConnectionTestMessage = null,
  imageConnectionTestStatus = "idle",
  imageConnectionTestMessage = null,
  settingsLockReason = null,
  onSaveRuntimeSettings = async () => true,
  onTestRuntimeConnection = async () => ({ ok: true, message: "连接成功" }),
  onTestTextConnection,
  onTestImageConnection,
  onSettingsOpenChange,
  children,
}: {
  activeItem: NavigationItemId;
  onActiveItemChange: (item: NavigationItemId) => void;
  projects?: ProductProject[];
  activeProject?: ProductProject | null;
  loading?: boolean;
  onCreateProject?: () => void;
  onSelectProject?: (id: string) => void;
  runtimeSettings?: RuntimeSettings;
  settingsLoading?: boolean;
  settingsError?: string | null;
  connectionTestStatus?: "idle" | "testing" | "success" | "error";
  connectionTestMessage?: string | null;
  textConnectionTestStatus?: "idle" | "testing" | "success" | "error";
  textConnectionTestMessage?: string | null;
  imageConnectionTestStatus?: "idle" | "testing" | "success" | "error";
  imageConnectionTestMessage?: string | null;
  settingsLockReason?: string | null;
  onSaveRuntimeSettings?: (settings: RuntimeSettings) => Promise<boolean>;
  onTestRuntimeConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  onTestTextConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  onTestImageConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  /** Notify parent when settings dialog opens/closes (e.g. demo banner → open settings). */
  onSettingsOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? DESKTOP_MIN_WIDTH : window.innerWidth,
  );
  const setSettingsOpenAndNotify = useCallback(
    (open: boolean) => {
      setSettingsOpen(open);
      onSettingsOpenChange?.(open);
    },
    [onSettingsOpenChange],
  );
  const openSettings = useCallback(() => setSettingsOpenAndNotify(true), [setSettingsOpenAndNotify]);
  const closeSettings = useCallback(() => setSettingsOpenAndNotify(false), [setSettingsOpenAndNotify]);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Parent can open settings without mounting a settings nav item (demo banner, runtime badge).
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (detail?.open === false) closeSettings();
      else openSettings();
    };
    window.addEventListener("ecom:open-settings", handle);
    return () => window.removeEventListener("ecom:open-settings", handle);
  }, [closeSettings, openSettings]);

  const changeDestination = (item: NavigationItemId) => {
    if (item === "settings") {
      openSettings();
      return;
    }
    onActiveItemChange(item);
  };

  // Create/select/project identity belong to 资料库 pages, not a global chrome bar.
  void projects;
  void activeProject;
  void loading;
  void onCreateProject;
  void onSelectProject;

  const usesApi = runtimeSettings.mode === "api";
  const runtimeLabel = usesApi ? "API 引擎" : "演示引擎";
  const desktopSupported = viewportWidth >= DESKTOP_MIN_WIDTH;

  return (
    <div className="app-frame" data-testid="app-frame">
      <PlatformRail
        activeItem={activeItem}
        onChange={changeDestination}
        runtimeBadge={
          <button
            type="button"
            className="runtime-badge-button"
            onClick={openSettings}
            aria-label={`当前运行模式：${runtimeLabel}。打开设置切换 Demo / API`}
            title="打开设置 · 切换 Demo / API"
          >
            <StatusChip tone="mode" className="runtime-badge">
              {usesApi ? <Cloud size={12} /> : <CloudOff size={12} />}
              <span className="runtime-badge__text">{usesApi ? "API" : "演示"}</span>
            </StatusChip>
          </button>
        }
      />
      <div className="app-surface">
        <main className="workspace" data-testid="workspace">
          {children}
        </main>
      </div>

      {/* Keep a stable test hook for smoke after top bar removal */}
      <div className="context-bar" data-testid="context-bar" hidden aria-hidden="true" />

      <div
        className="desktop-only-gate"
        data-testid="desktop-only-gate"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="desktop-only-gate-title"
        aria-describedby="desktop-only-gate-description"
        hidden={desktopSupported}
      >
        <div className="desktop-only-gate__card">
          <div className="desktop-only-gate__icon" aria-hidden="true">
            <Monitor size={28} strokeWidth={1.8} />
          </div>
          <strong id="desktop-only-gate-title">当前只支持电脑端浏览</strong>
          <p id="desktop-only-gate-description">
            电商工作台需要足够宽度同时查看资料、槽位和检查器。请将窗口调整到至少{" "}
            {DESKTOP_MIN_WIDTH}px。
          </p>
          <span className="desktop-only-gate__meta">
            当前约 {viewportWidth}px · 最低 {DESKTOP_MIN_WIDTH}px
          </span>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        settings={runtimeSettings}
        loading={settingsLoading}
        error={settingsError}
        connectionStatus={connectionTestStatus}
        connectionMessage={connectionTestMessage}
        textConnectionStatus={textConnectionTestStatus}
        textConnectionMessage={textConnectionTestMessage}
        imageConnectionStatus={imageConnectionTestStatus}
        imageConnectionMessage={imageConnectionTestMessage}
        lockReason={settingsLockReason}
        onClose={closeSettings}
        onSave={onSaveRuntimeSettings}
        onTest={onTestRuntimeConnection}
        onTestText={onTestTextConnection ?? onTestRuntimeConnection}
        onTestImage={onTestImageConnection ?? onTestRuntimeConnection}
      />
    </div>
  );
}
