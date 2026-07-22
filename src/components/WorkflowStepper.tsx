import type { PlatformId } from "../domain/platforms/types";

export type WorkflowStage = "prepare" | "review" | "produce" | "deliver";

const WORKFLOW_STEPS: Array<{ id: WorkflowStage; label: string; hint: string }> = [
  { id: "prepare", label: "准备", hint: "商品事实与参考图" },
  { id: "review", label: "策划检查", hint: "确认槽位与 Prompt" },
  { id: "produce", label: "逐图生产", hint: "生成并选择版本" },
  { id: "deliver", label: "交付检查", hint: "预览、合规与导出" },
];

export function WorkflowStepper({
  platform,
  stage,
  completedSlots,
  totalSlots,
}: {
  platform: PlatformId;
  stage: WorkflowStage;
  completedSlots: number;
  totalSlots: number;
}) {
  const currentIndex = WORKFLOW_STEPS.findIndex((step) => step.id === stage);
  const progressLabel = totalSlots > 0 ? `${completedSlots}/${totalSlots} 个槽位已完成` : "等待策划";
  return (
    <div
      className="workbench-chrome__progress-row"
      aria-label={`${platform === "amazon" ? "Amazon" : "淘宝 / 天猫"} 工作流程`}
    >
      <ol className="workbench-stepper">
        {WORKFLOW_STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex;
          return (
            <li
              key={step.id}
              className={`workbench-stepper__item${isCurrent ? " is-current" : ""}${isComplete ? " is-complete" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="workbench-stepper__marker" aria-hidden="true">
                {isComplete ? "✓" : index + 1}
              </span>
              <span className="workbench-stepper__copy">
                <strong>{step.label}</strong>
                <small>{step.hint}</small>
              </span>
            </li>
          );
        })}
      </ol>
      <span className="workbench-chrome__progress-summary">{progressLabel}</span>
    </div>
  );
}
