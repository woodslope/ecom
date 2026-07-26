import { applyTaobaoAnalysisToFacts } from "../platforms/taobao-analysis";
import {
  createEmptyProductFacts,
  resolveAmazonPlanningFacts,
} from "../planning/input-assessment";
import type { ProductProject } from "../projects/types";
import type { PlatformSession } from "./project-workspace";
import { productFactsEqual } from "../localization/product-localizer";

type EffectiveSessionContext = Pick<
  PlatformSession,
  | "projectId"
  | "workflowId"
  | "sourceInput"
  | "planningInput"
  | "taobaoAnalysis"
  | "localizedFactsDraft"
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
  let sourceFacts: ProductProject["facts"];
  if (session.workflowId === "taobao-product") {
    const baseFacts = session.planningInput?.sourceMode === "manual"
      ? createEmptyProductFacts()
      : project.facts;
    sourceFacts = applyTaobaoAnalysisToFacts(baseFacts, session.taobaoAnalysis);
  } else {
    sourceFacts = resolveAmazonPlanningFacts(
      project.facts,
      session.sourceInput.listingText,
      session.planningInput?.sourceMode ?? "library",
    );
  }
  if (
    session.localizedFactsDraft?.status === "confirmed" &&
    productFactsEqual(session.localizedFactsDraft.sourceFactsSnapshot, sourceFacts)
  ) {
    return session.localizedFactsDraft.localizedFacts;
  }
  return sourceFacts;
}

export function resolveSessionEffectiveProject(
  project: ProductProject,
  session?: EffectiveSessionContext,
): ProductProject {
  const facts = resolveSessionEffectiveFacts(project, session);
  return facts === project.facts ? project : { ...project, facts };
}
