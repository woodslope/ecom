import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Monitor } from "lucide-react";

import type { NavigationItemId } from "../domain/platforms/types";
import { defaultRuntimeSettings, type ConnectionTestResult, type RuntimeSettings } from "../domain/settings";
import { PlatformRail } from "./PlatformRail";
import { SettingsDialog } from "./SettingsDialog";
import { syncModalEnvironment } from "./ui";

export const DESKTOP_MIN_WIDTH = 1200;

export function AppShell({
  activeItem,
  onActiveItemChange,
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
  onExportLocalBackup,
  onImportLocalBackup,
  children,
}: {
  activeItem: NavigationItemId;
  onActiveItemChange: (item: NavigationItemId) => void;
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
  onExportLocalBackup?: () => Promise<string>;
  onImportLocalBackup?: (file: File) => Promise<string>;
  children: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const desktopGateRef = useRef<HTMLDivElement>(null);
  const focusBeforeGateRef = useRef<HTMLElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? DESKTOP_MIN_WIDTH : window.innerWidth,
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const changeDestination = (item: NavigationItemId) => {
    if (item === "settings") {
      openSettings();
      return;
    }
    onActiveItemChange(item);
  };

  const desktopSupported = viewportWidth >= DESKTOP_MIN_WIDTH;

  useEffect(() => {
    if (!desktopSupported && settingsOpen) {
      closeSettings();
    }
  }, [closeSettings, desktopSupported, settingsOpen]);

  useEffect(() => {
    if (!desktopSupported) {
      const active = document.activeElement;
      focusBeforeGateRef.current = active instanceof HTMLElement && active !== document.body
        ? active
        : null;
      desktopGateRef.current?.focus();
      return;
    }

    const previous = focusBeforeGateRef.current;
    focusBeforeGateRef.current = null;
    if (previous?.isConnected) previous.focus();
  }, [desktopSupported]);

  useEffect(() => {
    syncModalEnvironment();
  }, [desktopSupported]);

  return (
    <div className="app-frame" data-testid="app-frame">
      <div
        className="app-desktop-content"
        data-testid="app-desktop-content"
        inert={!desktopSupported}
        aria-hidden={!desktopSupported ? true : undefined}
      >
        <PlatformRail
          activeItem={activeItem}
          onChange={changeDestination}
          runtimeMode={runtimeSettings.mode}
        />
        <div className="app-surface">
          <main className="workspace" data-testid="workspace">
            {children}
          </main>
        </div>
      </div>

      {/* Keep a stable test hook for smoke after top bar removal */}
      <div className="context-bar" data-testid="context-bar" hidden aria-hidden="true" />

      <div
        ref={desktopGateRef}
        className="desktop-only-gate"
        data-testid="desktop-only-gate"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="desktop-only-gate-title"
        aria-describedby="desktop-only-gate-description"
        tabIndex={-1}
        hidden={desktopSupported}
      >
        <div className="desktop-only-gate__card">
          <div className="desktop-only-gate__icon" aria-hidden="true">
            <Monitor size={28} strokeWidth={1.8} />
          </div>
          <strong id="desktop-only-gate-title">当前只支持电脑端浏览</strong>
          <p id="desktop-only-gate-description">
            电商工作台需要足够宽度同时查看平台制作区与历史记录。请将窗口调整到至少{" "}
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
        onExportLocalBackup={onExportLocalBackup}
        onImportLocalBackup={onImportLocalBackup}
      />
    </div>
  );
}
