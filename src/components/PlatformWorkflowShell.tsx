import type { ReactNode } from "react";

import type { PlatformId } from "../domain/platforms/types";
import type { WorkflowStage } from "./WorkflowStepper";
import { WorkflowStepper } from "./WorkflowStepper";

export function PlatformWorkflowShell({
  platform,
  title,
  stage,
  completedSlots,
  totalSlots,
  contextBar,
  historyAction,
  actions,
  selectableStages,
  onStageSelect,
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
  selectableStages?: readonly WorkflowStage[];
  onStageSelect?: (stage: WorkflowStage) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`platform-workflow-shell${className ? ` ${className}` : ""}`}>
      <header
        className="workbench-chrome"
        aria-label={`${title}工作台顶栏`}
      >
        <div className="workbench-chrome__main">
          <div className="workbench-chrome__brand">
            <h1>{title}</h1>
          </div>
          <div className="workbench-chrome__center">
            <div className="workbench-chrome__workflow">
              <WorkflowStepper
                platform={platform}
                stage={stage}
                completedSlots={completedSlots}
                totalSlots={totalSlots}
                selectableStages={selectableStages}
                onStageSelect={onStageSelect}
              />
            </div>
            {contextBar ? <div className="workbench-chrome__context">{contextBar}</div> : null}
          </div>
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
