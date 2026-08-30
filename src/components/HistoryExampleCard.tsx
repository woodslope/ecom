import { BookOpen, CopyPlus, Eye, ListChecks } from "lucide-react";
import { useState } from "react";

import { getPlatformRulePack } from "../domain/platforms/registry";
import {
  createHistoryExampleRefillPayload,
  type HistoryProcessExample,
  type HistoryExampleRefillPayload,
} from "../domain/history/examples";
import { Button, StatusChip } from "./ui";

export function HistoryExampleCard({
  example,
  busy = false,
  onRefill,
}: {
  example: HistoryProcessExample;
  busy?: boolean;
  onRefill?: (payload: HistoryExampleRefillPayload) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const platform = getPlatformRulePack(example.platformId);
  return (
    <article className="history-example-card" aria-label={`${example.title}：${platform.label}`}>
      <header className="history-example-card__header">
        <div className="history-example-card__identity">
          <span className="history-example-card__icon" aria-hidden="true"><BookOpen size={17} /></span>
          <div>
            <strong>{example.title}</strong>
            <p>{example.description}</p>
          </div>
        </div>
        <div className="history-example-card__chips">
          <StatusChip tone="info">{platform.label}</StatusChip>
          <StatusChip tone="neutral">只读</StatusChip>
        </div>
      </header>

      <div className="history-example-card__body">
        <div className="history-example-card__facts">
          <span><b>商品</b>{example.project.facts.productName}</span>
          <span><b>工作流</b>{example.workflowId}</span>
        </div>
        <ol className="history-example-card__steps" aria-label="流程步骤">
          {example.steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        {onRefill ? (
          <div className="history-example-card__actions">
            <Button variant="secondary" size="compact" onClick={() => setDetailsOpen((value) => !value)}>
              <Eye size={14} />{detailsOpen ? "收起示例" : "查看示例"}
            </Button>
            <Button
              variant="secondary"
              size="compact"
              disabled={busy}
              onClick={() => onRefill(createHistoryExampleRefillPayload(example))}
            >
              <CopyPlus size={14} />回填为新任务
            </Button>
          </div>
        ) : null}
      </div>
      {detailsOpen ? (
        <div className="history-example-card__details">
          <p><b>任务设置：</b>{example.taskSettings.workflowId} · {example.taskSettings.locale} · {example.taskSettings.selectedReferenceAssetIds.length} 张参考图</p>
          <p><b>行业模板：</b>{example.industryTemplate.name} v{example.industryTemplate.version}</p>
          <p><b>策划槽位：</b>{example.plan.slots.map((slot) => slot.slotKey).join("、")}</p>
          <p><b>导出结构：</b>{example.exportStructure.join("、")}</p>
        </div>
      ) : null}
      <footer className="history-example-card__footer">
        <ListChecks size={14} aria-hidden="true" />示例不会创建生产记录，也不会自动执行策划或生成
      </footer>
    </article>
  );
}
