import { useState, type ReactNode } from "react";
import { FileText, Images } from "lucide-react";

import { planningInputQualityLabel } from "../domain/planning/input-assessment";
import type { ProductFacts, ProductProject } from "../domain/projects/types";
import { getAPlusContentTypeLabel } from "../domain/platforms/amazon-catalog";
import { getAmazonMarketplaceLabel } from "../domain/platforms/amazon-marketplaces";
import { AMAZON_STYLE_PRESETS } from "../domain/platforms/amazon-style-presets";
import type {
  AmazonWorkspaceMode,
  PlatformSession,
} from "../domain/workspace/project-workspace";
import type { StartAmazonSessionInput, WorkbenchAsset } from "../store/workbench-store";
import type { StyleReferenceDraft } from "../domain/assets/style-reference";
import { AmazonIntake } from "./AmazonIntake";
import { ProductContextBar } from "./ProductContextBar";
import { LocalizedFactsReview } from "./LocalizedFactsReview";
import { PlatformWorkflowShell } from "./PlatformWorkflowShell";
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
  const styleLabel =
    AMAZON_STYLE_PRESETS.find((preset) => preset.id === options.stylePresetId)?.label ??
    options.stylePresetId ??
    "默认风格";
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
          {planningInput.sourceMode === "library" ? "资料库来源" : "手动来源"} · {planningInputQualityLabel(planningInput.quality)}
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
            <div><dt>风格</dt><dd>{styleLabel}</dd></div>
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
          actionLabel="保存并重新生成策划"
          onConfirm={onConfirmLocalizedFacts}
        />
      ) : null}
      {session.styleReferenceNotice ? (
        <StatusMessage tone="warning">{session.styleReferenceNotice}</StatusMessage>
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
  onSyncListingFacts,
  onConfirmLocalizedFacts = async () => undefined,
  onOpenLibrary,
  onOpenProductPicker,
  onWorkspaceDirtyChange,
  onCreateStyleReference = async () => null,
  onRemoveAsset = async () => undefined,
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
  onSyncListingFacts: (listingText: string) => Promise<boolean>;
  onConfirmLocalizedFacts?: (sessionId: string, facts: ProductFacts) => Promise<void> | void;
  onOpenLibrary?: () => void;
  onOpenProductPicker?: () => void;
  onWorkspaceDirtyChange?: (reason: string | null) => void;
  onCreateStyleReference?: (presetId: string, draft: Partial<StyleReferenceDraft>) => Promise<WorkbenchAsset | null>;
  onRemoveAsset?: (id: string) => Promise<void>;
  children: ReactNode;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const qualityLabel = session?.planningInput
    ? planningInputQualityLabel(session.planningInput.quality)
    : null;
  const statusLabel = session?.plan
    ? `${qualityLabel ?? "图片策划"} · ${sessionModeLabel(session)}`
    : qualityLabel ?? "准备";

  return (
    <div className="amazon-workspace">
      {session?.plan ? (
        <>
          <ProductContextBar
            platformLabel="Amazon"
            project={activeProject}
            statusLabel={statusLabel}
            statusTone="success"
            detailLabel="任务输入"
            disabled={loading || planning}
            onOpenDetails={() => setSummaryOpen(true)}
            onSwitchProduct={onOpenProductPicker}
            onOpenLibrary={onOpenLibrary}
          />
          {children}
        </>
      ) : session?.localizedFactsDraft ? (
        <PlatformWorkflowShell
          platform="amazon"
          title="Amazon"
          stage="review"
          completedSlots={0}
          totalSlots={0}
          className="platform-workflow-shell--scroll-content"
          contextBar={
            <ProductContextBar
              platformLabel="Amazon"
              project={activeProject}
              statusLabel="待确认"
              statusTone="warning"
              disabled={loading || planning}
              onOpenLibrary={onOpenLibrary}
            />
          }
        >
          <LocalizedFactsReview
            draft={session.localizedFactsDraft}
            disabled={loading || planning}
            onConfirm={(facts) => onConfirmLocalizedFacts(session.id, facts)}
          />
        </PlatformWorkflowShell>
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
          onSyncListingFacts={onSyncListingFacts}
          onChooseLibrary={onOpenProductPicker}
          onOpenLibrary={onOpenLibrary}
          onDirtyChange={onWorkspaceDirtyChange}
          onCreateStyleReference={onCreateStyleReference}
          onRemoveAsset={onRemoveAsset}
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
