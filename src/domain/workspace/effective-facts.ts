import { applyTaobaoAnalysisToFacts } from "../platforms/taobao-analysis";
import {
  resolveAmazonPlanningFacts,
} from "../planning/input-assessment";
import type { ProductProject } from "../projects/types";
import type { PlatformSession } from "./project-workspace";
import { productFactsEqual } from "../localization/product-localizer";

type EffectiveSessionContext = Pick<
  PlatformSession,
  | "projectId"
  | "platformId"
  | "workflowId"
  | "sourceInput"
  | "planningInput"
  | "taobaoAnalysis"
  | "localizedFactsDraft"
>;

/**
 * Resolves the facts visible to one platform task without consulting another task.
 */
export function resolveSessionEffectiveFacts(
  project: ProductProject,
  session?: EffectiveSessionContext,
): ProductProject["facts"] {
  if (
    !session ||
    session.projectId !== project.id ||
    (project.platformId !== undefined && session.platformId !== project.platformId)
  ) {
    return project.facts;
  }
  let sourceFacts: ProductProject["facts"];
  if (session.workflowId === "taobao-product") {
    sourceFacts = applyTaobaoAnalysisToFacts(project.facts, session.taobaoAnalysis);
  } else {
    sourceFacts = resolveAmazonPlanningFacts(project.facts, session.sourceInput.listingText, "manual");
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
