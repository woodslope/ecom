import { useState, type ReactNode } from "react";

import { planningInputQualityLabel } from "../domain/planning/input-assessment";
import type { ProductProject } from "../domain/projects/types";
import type { PlatformSession } from "../domain/workspace/project-workspace";
import type { AnalyzeTaobaoProductInput, WorkbenchAsset } from "../store/workbench-store";
import { ProductContextBar } from "./ProductContextBar";
import { TaobaoAnalysisSummary, TaobaoIntake } from "./TaobaoIntake";

export function TaobaoWorkspace({
  activeProject,
  assets,
  session,
  loading,
  analysisLockedReason,
  onCancelPlanning,
  error,
  onAnalyze,
  onOpenLibrary,
  onOpenProductPicker,
  onWorkspaceDirtyChange,
  onReanalyze,
  reanalyzeDisabled = false,
  reanalyzeDisabledReason,
  stylePresetId,
  children,
}: {
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  session?: PlatformSession;
  loading: boolean;
  analysisLockedReason?: string;
  onCancelPlanning?: () => void;
  error: string | null;
  onAnalyze: (input: AnalyzeTaobaoProductInput) => Promise<unknown>;
  onOpenLibrary?: () => void;
  onOpenProductPicker?: () => void;
  onWorkspaceDirtyChange?: (reason: string | null) => void;
  onReanalyze?: () => void;
  reanalyzeDisabled?: boolean;
  reanalyzeDisabledReason?: string;
  /** Prompt profile id for Taobao planning. */
  stylePresetId?: string | null;
  children: ReactNode | ((contextBar: ReactNode) => ReactNode);
}) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const analysis = session?.taobaoAnalysis;
  const hasPlan = Boolean(session?.plan);
  const qualityLabel = session?.planningInput
    ? planningInputQualityLabel(session.planningInput.quality)
    : null;

  return (
    <div className="taobao-workspace">
      {hasPlan ? (
        typeof children === "function" ? children(
          <ProductContextBar
            platformLabel="淘宝 / 天猫"
            project={activeProject}
            statusLabel={qualityLabel ?? "图片策划"}
            statusTone="success"
            detailLabel={analysis ? "分析详情" : undefined}
            disabled={loading}
            onOpenDetails={analysis ? () => setAnalysisOpen(true) : undefined}
            onSwitchProduct={onOpenProductPicker}
            onOpenLibrary={onOpenLibrary}
          />,
        ) : (
          <>
            <ProductContextBar
              platformLabel="淘宝 / 天猫"
              project={activeProject}
              statusLabel={qualityLabel ?? "图片策划"}
              statusTone="success"
              detailLabel={analysis ? "分析详情" : undefined}
              disabled={loading}
              onOpenDetails={analysis ? () => setAnalysisOpen(true) : undefined}
              onSwitchProduct={onOpenProductPicker}
              onOpenLibrary={onOpenLibrary}
            />
            {children}
          </>
        )
      ) : (
        <TaobaoIntake
          activeProject={activeProject}
          assets={assets}
          session={session}
          loading={loading}
          lockedReason={analysisLockedReason}
          onCancelLockedTask={onCancelPlanning}
          error={error}
          onAnalyze={onAnalyze}
          onDirtyChange={onWorkspaceDirtyChange}
          onOpenLibrary={onOpenLibrary}
          onOpenProductPicker={onOpenProductPicker}
          onOpenAnalysisDetails={
            session?.taobaoAnalysis
              ? () => setAnalysisOpen(true)
              : undefined
          }
          stylePresetId={stylePresetId}
        />
      )}
      {reanalyzeDisabledReason ? (
        <p className="taobao-intake__reanalyze-status">
          {reanalyzeDisabledReason}
        </p>
      ) : null}
      {analysis ? (
        <TaobaoAnalysisSummary
          open={analysisOpen}
          analysis={analysis}
          planningInput={session?.planningInput}
          onClose={() => setAnalysisOpen(false)}
          onReanalyze={onReanalyze}
          reanalyzeDisabled={reanalyzeDisabled}
          reanalyzeDisabledReason={reanalyzeDisabledReason}
        />
      ) : null}
    </div>
  );
}
