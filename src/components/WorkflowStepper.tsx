import type { PlatformId } from "../domain/platforms/types";
import { Button } from "./ui";

export type WorkflowStage = "prepare" | "review" | "produce" | "deliver";

const WORKFLOW_STEPS: Array<{ id: WorkflowStage; label: string }> = [
  { id: "prepare", label: "准备资料" },
  { id: "review", label: "生成交付" },
];

const COMPACT_STEP_LABELS: Record<WorkflowStage, string> = {
  prepare: "准备资料",
  review: "生成交付",
  produce: "生成交付",
  deliver: "生成交付",
};

export function WorkflowStepper({
  platform,
  stage,
  completedSlots,
  totalSlots,
  compact = false,
  selectableStages = [],
  onStageSelect,
}: {
  platform: PlatformId;
  stage: WorkflowStage;
  completedSlots: number;
  totalSlots: number;
  compact?: boolean;
  selectableStages?: readonly WorkflowStage[];
  onStageSelect?: (stage: WorkflowStage) => void;
}) {
  const currentIndex = stage === "prepare" ? 0 : 1;
  return (
    <div
      className={`workbench-chrome__progress-row${compact ? " workbench-chrome__progress-row--compact" : ""}`}
      aria-label={`${platform === "amazon" ? "Amazon" : "淘宝 / 天猫"} 工作流程`}
    >
      <ol className="workbench-stepper">
        {WORKFLOW_STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex;
          const selectable = Boolean(
            onStageSelect &&
              (step.id === "prepare"
                ? selectableStages.includes("prepare")
                : selectableStages.some((candidate) => candidate !== "prepare")),
          );
          const content = (
            <>
              <span className="workbench-stepper__marker" aria-hidden="true">
                {isComplete ? "✓" : index + 1}
              </span>
              <span className="workbench-stepper__copy">
                <strong>{compact ? COMPACT_STEP_LABELS[step.id] : step.label}</strong>
              </span>
            </>
          );
          return (
            <li
              key={step.id}
              className={`workbench-stepper__item${isCurrent ? " is-current" : ""}${isComplete ? " is-complete" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {selectable ? (
                <Button
                  variant="quiet"
                  size="compact"
                  type="button"
                  className="workbench-stepper__button"
                  aria-label={`前往${step.label}`}
                  onClick={() => onStageSelect?.(step.id)}
                >
                  {content}
                </Button>
              ) : content}
            </li>
          );
        })}
      </ol>
      {stage !== "prepare" ? <span className="visually-hidden">制作</span> : null}
    </div>
  );
}
