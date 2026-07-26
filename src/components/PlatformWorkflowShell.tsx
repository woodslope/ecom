import type { ReactNode } from "react";

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
  badge,
  controls,
  actions,
  onboarding,
  children,
  className = "",
}: {
  platform: PlatformId;
  title: string;
  stage: WorkflowStage;
  completedSlots: number;
  totalSlots: number;
  contextBar?: ReactNode;
  badge?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
  onboarding?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`platform-workflow-shell${className ? ` ${className}` : ""}`}>
      {contextBar}
      <header
        className="workbench-chrome"
        aria-label={`${title}工作台顶栏`}
      >
        <div className="workbench-chrome__main">
          <div className="workbench-chrome__brand">
            <h1>{title}</h1>
            {badge}
            <span
              className="workbench-chrome__step"
              aria-label={`当前步骤 ${WORKFLOW_STAGE_INDEX[stage]} / 4`}
            >
              {WORKFLOW_STAGE_INDEX[stage]}/4 · {WORKFLOW_STAGE_LABELS[stage]}
            </span>
          </div>
          {controls}
          {actions ? <div className="workbench-chrome__tools">{actions}</div> : null}
        </div>
        {onboarding ? (
          <div className="workbench-chrome__onboarding">{onboarding}</div>
        ) : null}
        <WorkflowStepper
          platform={platform}
          stage={stage}
          completedSlots={completedSlots}
          totalSlots={totalSlots}
        />
      </header>
      <div className="platform-workflow-shell__content">{children}</div>
    </div>
  );
}
