import type {
  PlatformSession,
  PlatformSessionOptions,
  PlatformWorkflowId,
  ProductionEvent,
  ProductionRun,
} from "../domain/workspace/project-workspace";
import type { PlatformId } from "../domain/platforms/types";
import type { PlatformPlan } from "../domain/planning/types";
import type { SlotVersion, SlotVersionState } from "../domain/generation/types";
import { currentSlotVersion } from "../domain/generation/current-version";

export interface PlanCommitInput {
  projectId: string;
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  source: ProductionRun["source"];
  sourceInput: PlatformSession["sourceInput"];
  options: PlatformSessionOptions;
  selectedReferenceAssetIds: string[];
  selectedStyleReferenceId?: string;
  taobaoAnalysis?: PlatformSession["taobaoAnalysis"];
  plan: PlatformPlan;
  planInputSignature?: string;
  selectedSlotKey?: string;
  sessionId: string;
  runId: string;
  eventId: string;
  now: string;
  createdAt?: string;
}

export function startSession(
  input: Omit<PlatformSession, "slotVersions" | "createdAt" | "updatedAt"> & {
    slotVersions?: PlatformSession["slotVersions"];
    createdAt?: string;
    now: string;
  },
): PlatformSession {
  const { now, slotVersions = {}, createdAt, ...session } = input;
  return {
    ...structuredClone(session),
    slotVersions: structuredClone(slotVersions),
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
}

export function commitAnalysis(
  session: PlatformSession,
  sourceInput: PlatformSession["sourceInput"],
  taobaoAnalysis: PlatformSession["taobaoAnalysis"] | undefined,
  now: string,
): PlatformSession {
  return {
    ...structuredClone(session),
    sourceInput: structuredClone(sourceInput),
    ...(taobaoAnalysis ? { taobaoAnalysis: structuredClone(taobaoAnalysis) } : {}),
    updatedAt: now,
  };
}

export function commitPlan(input: PlanCommitInput): {
  session: PlatformSession;
  run: ProductionRun;
} {
  const session: PlatformSession = {
    id: input.sessionId,
    projectId: input.projectId,
    platformId: input.platformId,
    workflowId: input.workflowId,
    sourceInput: structuredClone(input.sourceInput),
    options: structuredClone(input.options),
    selectedReferenceAssetIds: [...input.selectedReferenceAssetIds],
    ...(input.selectedStyleReferenceId
      ? { selectedStyleReferenceId: input.selectedStyleReferenceId }
      : {}),
    ...(input.taobaoAnalysis ? { taobaoAnalysis: structuredClone(input.taobaoAnalysis) } : {}),
    plan: structuredClone(input.plan),
    ...(input.planInputSignature ? { planInputSignature: input.planInputSignature } : {}),
    ...(input.selectedSlotKey ? { selectedSlotKey: input.selectedSlotKey } : {}),
    slotVersions: {},
    activeRunId: input.runId,
    createdAt: input.createdAt ?? input.now,
    updatedAt: input.now,
  };
  const run: ProductionRun = {
    id: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    platformId: input.platformId,
    workflowId: input.workflowId,
    source: input.source,
    status: "planned",
    contextSnapshot: {
      sourceInput: structuredClone(input.sourceInput),
      options: structuredClone(input.options),
      selectedReferenceAssetIds: [...input.selectedReferenceAssetIds],
      ...(input.selectedStyleReferenceId
        ? { selectedStyleReferenceId: input.selectedStyleReferenceId }
        : {}),
      ...(input.taobaoAnalysis ? { taobaoAnalysis: structuredClone(input.taobaoAnalysis) } : {}),
    },
    planSnapshot: structuredClone(input.plan),
    ...(input.planInputSignature
      ? { planningInputSignatureSnapshot: input.planInputSignature }
      : {}),
    slotVersionsSnapshot: {},
    events: [{
      id: input.eventId,
      runId: input.runId,
      kind: "plan",
      status: "success",
      createdAt: input.now,
    }],
    createdAt: input.now,
    updatedAt: input.now,
  };
  return { session, run };
}

export function appendRunEvent(
  run: ProductionRun,
  event: ProductionEvent,
): ProductionRun {
  return {
    ...structuredClone(run),
    events: [...run.events, structuredClone(event)],
    updatedAt: event.createdAt,
  };
}

export function updateSlot(
  session: PlatformSession,
  slotKey: string,
  patch: Partial<Pick<PlatformPlan["slots"][number], "visibleCopy" | "prompt" | "externalText">>,
  now: string,
): PlatformSession {
  if (!session.plan || !session.plan.slots.some((slot) => slot.slotKey === slotKey)) {
    throw new Error(`Unknown plan slot: ${slotKey}`);
  }
  return {
    ...structuredClone(session),
    plan: {
      ...structuredClone(session.plan),
      slots: session.plan.slots.map((slot) =>
        slot.slotKey === slotKey ? { ...structuredClone(slot), ...structuredClone(patch) } : structuredClone(slot),
      ),
    },
    updatedAt: now,
  };
}

function statusForVersions(
  plan: PlatformPlan,
  versions: Record<string, SlotVersionState>,
  planningInputSignature?: string,
): ProductionRun["status"] {
  const completed = plan.slots.filter((slot) =>
    Boolean(currentSlotVersion(slot, versions[slot.slotKey], planningInputSignature)),
  ).length;
  if (completed === 0) return "planned";
  return completed === plan.slots.length ? "ready" : "producing";
}

export function commitVersion(input: {
  session: PlatformSession;
  run: ProductionRun;
  version: SlotVersion;
  eventId: string;
  eventKind?: Extract<ProductionEvent["kind"], "generate" | "regenerate" | "edit">;
  now: string;
}): { session: PlatformSession; run: ProductionRun; versionState: SlotVersionState } {
  if (!input.session.plan || input.session.activeRunId !== input.run.id) {
    throw new Error("Version commit requires the active planned session and run");
  }
  const previous = input.session.slotVersions[input.version.slotKey] ?? {
    versions: [],
    activeVersionId: null,
  };
  const versionState: SlotVersionState = {
    versions: [...previous.versions, structuredClone(input.version)],
    activeVersionId: input.version.id,
  };
  const slotVersions = {
    ...structuredClone(input.session.slotVersions),
    [input.version.slotKey]: versionState,
  };
  const session = {
    ...structuredClone(input.session),
    slotVersions,
    updatedAt: input.now,
  };
  const run = appendRunEvent({
    ...structuredClone(input.run),
    status: statusForVersions(input.session.plan, slotVersions, input.session.planInputSignature),
    planSnapshot: structuredClone(input.session.plan),
    planningInputSignatureSnapshot: input.session.planInputSignature,
    slotVersionsSnapshot: structuredClone(slotVersions),
  }, {
    id: input.eventId,
    runId: input.run.id,
    kind: input.eventKind ?? (previous.versions.length > 0 ? "regenerate" : "generate"),
    status: "success",
    slotKey: input.version.slotKey,
    assetId: input.version.assetId,
    versionId: input.version.id,
    createdAt: input.now,
  });
  return { session, run, versionState };
}

export function activateVersion(
  session: PlatformSession,
  run: ProductionRun,
  slotKey: string,
  versionId: string,
  now: string,
): { session: PlatformSession; run: ProductionRun } {
  const current = session.slotVersions[slotKey];
  if (!current?.versions.some((version) => version.id === versionId)) {
    throw new Error(`Unknown slot version: ${versionId}`);
  }
  const slotVersions = {
    ...structuredClone(session.slotVersions),
    [slotKey]: { versions: structuredClone(current.versions), activeVersionId: versionId },
  };
  return {
    session: { ...structuredClone(session), slotVersions, updatedAt: now },
    run: {
      ...structuredClone(run),
      ...(session.plan
        ? {
            status: statusForVersions(session.plan, slotVersions, session.planInputSignature),
            planSnapshot: structuredClone(session.plan),
          }
        : {}),
      planningInputSignatureSnapshot: session.planInputSignature,
      slotVersionsSnapshot: structuredClone(slotVersions),
      updatedAt: now,
    },
  };
}

export function forkRun(
  sourceRun: ProductionRun,
  input: {
    sessionId: string;
    runId: string;
    eventId: string;
    planInputSignature: string;
    now: string;
  },
): { session: PlatformSession; run: ProductionRun } {
  const plan = structuredClone(sourceRun.planSnapshot);
  return commitPlan({
    projectId: sourceRun.projectId,
    platformId: sourceRun.platformId,
    workflowId: sourceRun.workflowId,
    source: sourceRun.source,
    sourceInput: structuredClone(sourceRun.contextSnapshot.sourceInput),
    options: structuredClone(sourceRun.contextSnapshot.options),
    selectedReferenceAssetIds: [...sourceRun.contextSnapshot.selectedReferenceAssetIds],
    ...(sourceRun.contextSnapshot.selectedStyleReferenceId
      ? { selectedStyleReferenceId: sourceRun.contextSnapshot.selectedStyleReferenceId }
      : {}),
    ...(sourceRun.contextSnapshot.taobaoAnalysis
      ? { taobaoAnalysis: structuredClone(sourceRun.contextSnapshot.taobaoAnalysis) }
      : {}),
    plan,
    planInputSignature: input.planInputSignature,
    selectedSlotKey: plan.slots[0]?.slotKey,
    sessionId: input.sessionId,
    runId: input.runId,
    eventId: input.eventId,
    now: input.now,
  });
}
