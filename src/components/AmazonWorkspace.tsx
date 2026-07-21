import type { ReactNode } from "react";
import { ChevronDown, FileText, Images } from "lucide-react";

import type { ProductProject } from "../domain/projects/types";
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
import { StatusMessage } from "./ui";

function sessionModeLabel(session: PlatformSession): string {
  if (session.options.platformId !== "amazon") return "Amazon";
  if (session.options.plannerMode === "listing") {
    return `Listing ${session.options.listingImageCount ?? 7} 张`;
  }
  return `${getAPlusContentTypeLabel(session.options.aPlusType ?? "standard-large")} ${
    session.options.aPlusModuleSpecs?.length ?? session.plan?.slots.length ?? 0
  } 个模块`;
}

function AmazonSessionSummary({
  session,
  assets,
}: {
  session: PlatformSession;
  assets: WorkbenchAsset[];
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

  return (
    <details className="amazon-session-summary">
      <summary>
        <FileText size={16} aria-hidden="true" />
        <strong>本次任务输入</strong>
        <span>
          {sessionModeLabel(session)} · {getAmazonMarketplaceLabel(options.marketplaceId)} · {options.sizeTier}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
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
      {session.styleReferenceNotice ? (
        <StatusMessage tone="warning">{session.styleReferenceNotice}</StatusMessage>
      ) : null}
    </details>
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
  onCreateStyleReference?: (presetId: string, draft: Partial<StyleReferenceDraft>) => Promise<WorkbenchAsset | null>;
  onRemoveAsset?: (id: string) => Promise<void>;
  children: ReactNode;
}) {
  if (session?.plan) {
    return (
      <div className="amazon-workspace">
        <AmazonSessionSummary session={session} assets={assets} />
        {children}
      </div>
    );
  }
  return (
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
      onCreateStyleReference={onCreateStyleReference}
      onRemoveAsset={onRemoveAsset}
    />
  );
}
