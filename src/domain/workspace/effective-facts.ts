import { applyTaobaoAnalysisToFacts } from "../platforms/taobao-analysis";
import type { ProductProject } from "../projects/types";
import type { PlatformSession } from "./project-workspace";

type EffectiveSessionContext = Pick<
  PlatformSession,
  "projectId" | "workflowId" | "taobaoAnalysis"
>;

/**
 * Resolves the facts visible to a platform workflow without mutating the shared project.
 * Platform-specific intake is session-owned; every downstream consumer must use this view.
 */
export function resolveSessionEffectiveFacts(
  project: ProductProject,
  session?: EffectiveSessionContext,
): ProductProject["facts"] {
  if (!session || session.projectId !== project.id) return project.facts;
  return session.workflowId === "taobao-product"
    ? applyTaobaoAnalysisToFacts(project.facts, session.taobaoAnalysis)
    : project.facts;
}

export function resolveSessionEffectiveProject(
  project: ProductProject,
  session?: EffectiveSessionContext,
): ProductProject {
  const facts = resolveSessionEffectiveFacts(project, session);
  return facts === project.facts ? project : { ...project, facts };
}
