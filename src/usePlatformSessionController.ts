import { useCallback, useEffect, useState } from "react";

import { browserStorage } from "./application/browser-storage";
import type { NavigationItemId, PlatformId } from "./domain/platforms/types";
import { readLastPlatformOrDefault, writeLastPlatform } from "./domain/workspace/preferences";

function initialNavigationItem(): NavigationItemId {
  if (typeof window === "undefined") return "amazon";
  return readLastPlatformOrDefault(browserStorage);
}

export function usePlatformSessionController(clearPlanningError: () => void) {
  const [activeItem, setActiveItem] = useState<NavigationItemId>(initialNavigationItem);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newTaskTokens, setNewTaskTokens] = useState<Record<"taobao" | "amazon", number>>({
    taobao: 1,
    amazon: 1,
  });
  const [workspaceDirtyReason, setWorkspaceDirtyReason] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<{ kind: "nav"; item: NavigationItemId } | null>(null);

  useEffect(() => {
    setHistoryOpen(false);
  }, [activeItem]);

  useEffect(() => {
    if (!workspaceDirtyReason) return;
    const preventUnsavedExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnsavedExit);
    return () => window.removeEventListener("beforeunload", preventUnsavedExit);
  }, [workspaceDirtyReason]);

  const handleWorkspaceDirtyChange = useCallback((reason: string | null) => {
    setWorkspaceDirtyReason(reason);
  }, []);

  const blockUnsavedNavigation = useCallback((item: NavigationItemId = activeItem) => {
    if (!workspaceDirtyReason) return false;
    setPendingLeave({ kind: "nav", item });
    return true;
  }, [activeItem, workspaceDirtyReason]);

  const changeActiveItem = useCallback((item: NavigationItemId) => {
    if (item !== activeItem && blockUnsavedNavigation(item)) return;
    setActiveItem(item);
    clearPlanningError();
    if (item === "taobao" || item === "amazon") writeLastPlatform(browserStorage, item);
  }, [activeItem, blockUnsavedNavigation, clearPlanningError]);

  const requestNavigation = useCallback((item: NavigationItemId) => {
    if (item === activeItem) return;
    if (workspaceDirtyReason) {
      setPendingLeave({ kind: "nav", item });
      return;
    }
    changeActiveItem(item);
  }, [activeItem, changeActiveItem, workspaceDirtyReason]);

  const discardPendingLeave = useCallback(() => {
    const pending = pendingLeave;
    setPendingLeave(null);
    handleWorkspaceDirtyChange(null);
    if (!pending) return;
    setActiveItem(pending.item);
    clearPlanningError();
    if (pending.item === "taobao" || pending.item === "amazon") writeLastPlatform(browserStorage, pending.item);
  }, [clearPlanningError, handleWorkspaceDirtyChange, pendingLeave]);

  const cancelPendingLeave = useCallback(() => {
    setPendingLeave(null);
  }, []);

  const clearNewTask = useCallback((platform: "taobao" | "amazon") => {
    setNewTaskTokens((current) => ({ ...current, [platform]: 0 }));
  }, []);

  const startNewTask = useCallback((platform: PlatformId) => {
    if (platform !== "taobao" && platform !== "amazon") return;
    if (blockUnsavedNavigation(platform)) return;
    setNewTaskTokens((current) => ({ ...current, [platform]: current[platform] + 1 }));
    setActiveItem(platform);
    clearPlanningError();
    writeLastPlatform(browserStorage, platform);
  }, [blockUnsavedNavigation, clearPlanningError]);

  return {
    activeItem,
    historyOpen,
    setHistoryOpen,
    newTaskTokens,
    workspaceDirtyReason,
    pendingLeave,
    handleWorkspaceDirtyChange,
    requestNavigation,
    changeActiveItem,
    discardPendingLeave,
    cancelPendingLeave,
    startNewTask,
    clearNewTask,
  };
}
