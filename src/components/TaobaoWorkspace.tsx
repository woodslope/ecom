import type { ReactNode } from "react";

import type { ProductProject } from "../domain/projects/types";
import type { PlatformSession } from "../domain/workspace/project-workspace";
import type { AnalyzeTaobaoProductInput, WorkbenchAsset } from "../store/workbench-store";
import { TaobaoAnalysisSummary, TaobaoIntake } from "./TaobaoIntake";

export function TaobaoWorkspace({
  activeProject,
  assets,
  session,
  loading,
  error,
  onAnalyze,
  children,
}: {
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  session?: PlatformSession;
  loading: boolean;
  error: string | null;
  onAnalyze: (input: AnalyzeTaobaoProductInput) => Promise<unknown>;
  children: ReactNode;
}) {
  if (!session?.taobaoAnalysis) {
    return (
      <TaobaoIntake
        activeProject={activeProject}
        assets={assets}
        session={session}
        loading={loading}
        error={error}
        onAnalyze={onAnalyze}
      />
    );
  }
  return (
    <div className="taobao-workspace">
      <TaobaoAnalysisSummary analysis={session.taobaoAnalysis} />
      {children}
    </div>
  );
}
