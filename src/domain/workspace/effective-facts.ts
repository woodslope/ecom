import { applyTaobaoAnalysisToFacts } from "../platforms/taobao-analysis";
import {
  createEmptyProductFacts,
  resolveAmazonPlanningFacts,
} from "../planning/input-assessment";
import type { ProductProject } from "../projects/types";
import type { PlatformSession } from "./project-workspace";

type EffectiveSessionContext = Pick<
  PlatformSession,
  "projectId" | "workflowId" | "sourceInput" | "planningInput" | "taobaoAnalysis"
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
  if (session.workflowId === "taobao-product") {
    const baseFacts = session.planningInput?.sourceMode === "manual"
      ? createEmptyProductFacts()
      : project.facts;
    return applyTaobaoAnalysisToFacts(baseFacts, session.taobaoAnalysis);
  }
  return resolveAmazonPlanningFacts(
    project.facts,
    session.sourceInput.listingText,
    session.planningInput?.sourceMode ?? "library",
  );
}

export function resolveSessionEffectiveProject(
  project: ProductProject,
  session?: EffectiveSessionContext,
): ProductProject {
  const facts = resolveSessionEffectiveFacts(project, session);
  return facts === project.facts ? project : { ...project, facts };
}
