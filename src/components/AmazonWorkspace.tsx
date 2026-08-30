import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, Images } from "lucide-react";

import { planningInputQualityLabel } from "../domain/planning/input-assessment";
import type { ProductFacts, ProductProject } from "../domain/projects/types";
import { getAPlusContentTypeLabel } from "../domain/platforms/amazon-catalog";
import { getAmazonMarketplaceLabel } from "../domain/platforms/amazon-marketplaces";
import type {
  AmazonWorkspaceMode,
  PlatformSession,
} from "../domain/workspace/project-workspace";
import type { StartAmazonSessionInput, WorkbenchAsset } from "../store/workbench-store";
import { AmazonIntake } from "./AmazonIntake";
import { ProductContextBar } from "./ProductContextBar";
import { LocalizedFactsReview } from "./LocalizedFactsReview";
import { Dialog, StatusMessage } from "./ui";

function sessionModeLabel(session: PlatformSession): string {
  if (session.options.platformId !== "amazon") return "Amazon";
  if (session.options.plannerMode === "listing") {
    return `Listing ${session.options.listingImageCount ?? 7} 张`;
  }
  return `${getAPlusContentTypeLabel(session.options.aPlusType ?? "standard-large")} ${
    session.options.aPlusModuleSpecs?.length ?? session.plan?.slots.length ?? 0
  } 个模块`;
}

export function AmazonSessionSummary({
  open,
  session,
  assets,
  onClose,
  onConfirmLocalizedFacts = async () => undefined,
}: {
  open: boolean;
  session: PlatformSession;
  assets: WorkbenchAsset[];
  onClose: () => void;
  onConfirmLocalizedFacts?: (facts: ProductFacts) => Promise<void> | void;
}) {
  if (session.options.platformId !== "amazon") return null;
  const options = session.options;
  const selectedNames = session.selectedReferenceAssetIds.map(
    (id) => assets.find((asset) => asset.metadata.id === id)?.metadata.name ?? `素材 ${id}`,
  );
  const planningInput = session.planningInput;

  return (
    <Dialog
      open={open}
      title="本次任务输入"
      eyebrow="Amazon 商品上下文"
      variant="sidebar"
      className="amazon-session-summary"
      onClose={onClose}
    >
      <StatusMessage>
        {sessionModeLabel(session)} · {getAmazonMarketplaceLabel(options.marketplaceId)} · {options.sizeTier}
      </StatusMessage>
      {planningInput ? (
        <StatusMessage tone={planningInput.quality === "standard" ? "success" : "warning"}>
          {planningInput.sourceMode === "library" ? "已保存任务资料" : "当前任务填写"} · {planningInputQualityLabel(planningInput.quality)}
          {planningInput.missingFacts.length > 0
            ? ` · 待补：${planningInput.missingFacts.join("、")}`
            : " · 输入完整"}
        </StatusMessage>
      ) : null}
      <div className="amazon-session-summary__body">
        <section>
          <strong>Listing 原文</strong>
          <pre>{session.sourceInput.listingText}</pre>
        </section>
        <section>
          <strong>策划参数</strong>
          <dl>
            <div><dt>模式</dt><dd>{sessionModeLabel(session)}</dd></div>
            <div><dt>站点</dt><dd>{getAmazonMarketplaceLabel(options.marketplaceId)}</dd></div>
            <div><dt>尺寸</dt><dd>{options.sizeTier}</dd></div>
            <div>
              <dt>行业模板</dt>
              <dd>{session.industryTemplate ? `${session.industryTemplate.name} v${session.industryTemplate.version}` : "旧任务未选择"}</dd>
            </div>
          </dl>
        </section>
        <section>
          <strong><Images size={14} aria-hidden="true" />参考素材</strong>
          <p>{selectedNames.length > 0 ? selectedNames.join("、") : "本次任务未选择参考素材"}</p>
        </section>
      </div>
      {session.localizedFactsDraft && onConfirmLocalizedFacts ? (
        <LocalizedFactsReview
          draft={session.localizedFactsDraft}
          actionLabel="保存并重新策划"
          onConfirm={onConfirmLocalizedFacts}
        />
      ) : null}
      {session.styleReferenceNotice ? (
        <StatusMessage tone="warning" live="polite">{session.styleReferenceNotice}</StatusMessage>
      ) : null}
    </Dialog>
  );
}

export function AmazonWorkspace({
  activeProject,
  assets,
  session,
  plannerMode,
  loading,
  planning,
  error,
  onStartSession,
  onStartNewTask,
  onConfirmLocalizedFacts = async () => undefined,
  onWorkspaceDirtyChange,
  historyAction,
  children,
}: {
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  session?: PlatformSession;
  plannerMode?: AmazonWorkspaceMode;
  loading: boolean;
  planning: boolean;
  error: string | null;
  onStartSession: (input: StartAmazonSessionInput) => Promise<PlatformSession | null>;
  onStartNewTask?: () => void;
  onConfirmLocalizedFacts?: (sessionId: string, facts: ProductFacts) => Promise<void> | void;
  onWorkspaceDirtyChange?: (reason: string | null) => void;
  historyAction?: ReactNode;
  children: ReactNode | ((contextBar: ReactNode) => ReactNode);
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const resumedDraftRef = useRef<string | null>(null);
  const qualityLabel = session?.planningInput
    ? planningInputQualityLabel(session.planningInput.quality)
    : null;
  const statusLabel = session?.plan
    ? `${qualityLabel ?? "图片策划"} · ${sessionModeLabel(session)}`
    : qualityLabel ?? "准备";

  useEffect(() => {
    const draft = session?.localizedFactsDraft;
    if (
      !session ||
      session.plan ||
      !draft ||
      draft.status === "confirmed" ||
      loading ||
      planning
    ) {
      return;
    }
    const resumeKey = `${session.id}:${draft.updatedAt}`;
    if (resumedDraftRef.current === resumeKey) return;
    resumedDraftRef.current = resumeKey;
    void Promise.resolve(onConfirmLocalizedFacts(session.id, draft.localizedFacts)).catch(
      () => undefined,
    );
  }, [loading, onConfirmLocalizedFacts, planning, session]);

  const showProductionWorkspace = Boolean(session?.plan || session?.localizedFactsDraft);

  return (
    <div className="amazon-workspace">
      {showProductionWorkspace ? (
        typeof children === "function" ? children(
          <ProductContextBar
            platformLabel="Amazon"
            project={activeProject}
            statusLabel={statusLabel}
            statusTone={session?.plan ? "success" : "warning"}
            detailLabel={session?.plan ? "任务输入" : undefined}
            disabled={loading || planning}
            onOpenDetails={session?.plan ? () => setSummaryOpen(true) : undefined}
          />,
        ) : (
          <>
            <ProductContextBar
              platformLabel="Amazon"
              project={activeProject}
              statusLabel={statusLabel}
              statusTone={session?.plan ? "success" : "warning"}
              detailLabel={session?.plan ? "任务输入" : undefined}
              disabled={loading || planning}
              onOpenDetails={session?.plan ? () => setSummaryOpen(true) : undefined}
            />
            {children}
          </>
        )
      ) : (
        <AmazonIntake
          activeProject={activeProject}
          assets={assets}
          session={session}
          plannerMode={plannerMode}
          loading={loading}
          planning={planning}
          error={error}
          onSubmit={onStartSession}
          onStartNewTask={onStartNewTask}
          historyAction={historyAction}
          onDirtyChange={onWorkspaceDirtyChange}
        />
      )}
      {session?.plan ? (
        <AmazonSessionSummary
          open={summaryOpen}
          session={session}
          assets={assets}
          onClose={() => setSummaryOpen(false)}
          onConfirmLocalizedFacts={(facts) => onConfirmLocalizedFacts(session.id, facts)}
        />
      ) : null}
    </div>
  );
}
