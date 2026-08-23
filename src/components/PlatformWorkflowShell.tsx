import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { PlatformId } from "../domain/platforms/types";
import type { WorkflowStage } from "./WorkflowStepper";
import { WorkflowStepper } from "./WorkflowStepper";

const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  prepare: "准备",
  review: "策划检查",
  produce: "逐图生产",
  deliver: "交付检查",
};

const WORKFLOW_STAGE_INDEX: Record<WorkflowStage, number> = {
  prepare: 1,
  review: 2,
  produce: 3,
  deliver: 4,
};

export function PlatformWorkflowShell({
  platform,
  title,
  stage,
  completedSlots,
  totalSlots,
  contextBar,
  historyAction,
  actions,
  children,
  className = "",
}: {
  platform: PlatformId;
  title: string;
  stage: WorkflowStage;
  completedSlots: number;
  totalSlots: number;
  contextBar?: ReactNode;
  historyAction?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const progressLabel = totalSlots > 0 ? `${completedSlots}/${totalSlots}` : "等待策划";
  const [progressMenuOpen, setProgressMenuOpen] = useState(false);

  useEffect(() => {
    if (!progressMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setProgressMenuOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [progressMenuOpen]);

  return (
    <div className={`platform-workflow-shell${className ? ` ${className}` : ""}`}>
      <header
        className="workbench-chrome"
        aria-label={`${title}工作台顶栏`}
      >
        <div className="workbench-chrome__main">
          <div className="workbench-chrome__brand">
            <h1>{title}</h1>
            <details
              className="workbench-chrome__progress-menu"
              open={progressMenuOpen}
              onToggle={(event) => setProgressMenuOpen(event.currentTarget.open)}
            >
              <summary aria-label={`当前步骤 ${WORKFLOW_STAGE_INDEX[stage]} / 4，展开完整流程`}>
                <span className="workbench-chrome__progress-marker" aria-hidden="true">
                  {WORKFLOW_STAGE_INDEX[stage]}
                </span>
                <span>{WORKFLOW_STAGE_LABELS[stage]}</span>
                <small>{progressLabel}</small>
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <div className="workbench-chrome__progress-popover">
                <WorkflowStepper
                  platform={platform}
                  stage={stage}
                  completedSlots={completedSlots}
                  totalSlots={totalSlots}
                />
              </div>
            </details>
          </div>
          {contextBar ? <div className="workbench-chrome__context">{contextBar}</div> : null}
          {historyAction || actions ? (
            <div className="workbench-chrome__tools">
              {historyAction}
              {actions}
            </div>
          ) : null}
        </div>
      </header>
      <div className="platform-workflow-shell__content">{children}</div>
    </div>
  );
}
