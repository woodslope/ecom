import { currentSlotVersion } from "../generation/current-version";
import type { PlatformId } from "../platforms/types";
import type { PlatformPlan } from "../planning/types";
import type { SlotVersionState } from "../generation/types";
import {
  getAmazonCompletedSlotKeys,
  getAmazonPrimaryAction,
  getAmazonStage,
  type AmazonPrimaryAction,
  type AmazonStage,
} from "./amazon-stage";
import type { PlatformSession } from "./project-workspace";

export type PlatformStage = AmazonStage;

export type PlatformPrimaryAction =
  | AmazonPrimaryAction
  | { kind: "plan"; label: "生成图片策划" | "重新策划" }
  | { kind: "generate"; label: "生成当前图片"; slotKey: string }
  | { kind: "select"; label: "继续下一槽位"; slotKey: string }
  | { kind: "export"; label: "导出完整交付包" };

const STAGE_LABEL: Record<PlatformStage, string> = {
  prepare: "准备",
  review: "策划检查",
  produce: "逐图生产",
  deliver: "交付检查",
};

export function getPlatformStageLabel(stage: PlatformStage): string {
  return STAGE_LABEL[stage];
}

export function getPlatformStageIndex(stage: PlatformStage): 1 | 2 | 3 | 4 {
  if (stage === "prepare") return 1;
  if (stage === "review") return 2;
  if (stage === "produce") return 3;
  return 4;
}

export function getTaobaoCompletedSlotKeys(input: {
  plan?: PlatformPlan | null;
  slotVersions?: Record<string, SlotVersionState>;
  planInputSignature?: string;
}): string[] {
  if (!input.plan) return [];
  return input.plan.slots.flatMap((slot) =>
    currentSlotVersion(
      slot,
      input.slotVersions?.[slot.slotKey],
      input.planInputSignature,
    )
      ? [slot.slotKey]
      : [],
  );
}

/**
 * Shared stage model for Amazon + Taobao chrome.
 * Amazon delegates to getAmazonStage; Taobao maps analysis → plan → produce → deliver.
 */
export function getPlatformStage(input: {
  platform: PlatformId;
  session?: PlatformSession | null;
  plan?: PlatformPlan | null;
  hasTaobaoAnalysis?: boolean;
  slotVersions?: Record<string, SlotVersionState>;
  planInputSignature?: string;
  selectedSlotKey?: string;
}): PlatformStage {
  if (input.platform === "amazon") {
    if (input.session) {
      const withPlan = input.plan
        ? {
            ...input.session,
            plan: input.plan,
            planInputSignature: input.planInputSignature ?? input.session.planInputSignature,
            selectedSlotKey: input.selectedSlotKey ?? input.session.selectedSlotKey,
            slotVersions: input.slotVersions ?? input.session.slotVersions,
          }
        : input.session;
      return getAmazonStage(withPlan);
    }
    return input.plan ? "review" : "prepare";
  }

  // Taobao: prepare until analysis exists; review once planned with 0 outputs.
  if (!input.hasTaobaoAnalysis && !input.plan && !input.session?.taobaoAnalysis) {
    return "prepare";
  }
  if (!input.plan) return "prepare";
  const completed = getTaobaoCompletedSlotKeys({
    plan: input.plan,
    slotVersions: input.slotVersions ?? input.session?.slotVersions,
    planInputSignature: input.planInputSignature ?? input.session?.planInputSignature,
  }).length;
  if (completed === 0) return "review";
  return completed === input.plan.slots.length ? "deliver" : "produce";
}

export function getPlatformPrimaryAction(input: {
  platform: PlatformId;
  session?: PlatformSession | null;
  plan?: PlatformPlan | null;
  hasTaobaoAnalysis?: boolean;
  slotVersions?: Record<string, SlotVersionState>;
  planInputSignature?: string;
  selectedSlotKey?: string;
}): PlatformPrimaryAction {
  if (input.platform === "amazon") {
    if (input.session) {
      const withPlan = input.plan
        ? {
            ...input.session,
            plan: input.plan,
            planInputSignature: input.planInputSignature ?? input.session.planInputSignature,
            selectedSlotKey: input.selectedSlotKey ?? input.session.selectedSlotKey,
            slotVersions: input.slotVersions ?? input.session.slotVersions,
          }
        : input.session;
      return getAmazonPrimaryAction(withPlan);
    }
    return { kind: "plan", label: "生成图片策划" };
  }

  const stage = getPlatformStage(input);
  if (stage === "prepare" || !input.plan) {
    return {
      kind: "plan",
      label: input.hasTaobaoAnalysis || input.session?.taobaoAnalysis ? "重新策划" : "生成图片策划",
    };
  }
  if (stage === "deliver") {
    return { kind: "export", label: "导出完整交付包" };
  }
  const completed = new Set(
    getTaobaoCompletedSlotKeys({
      plan: input.plan,
      slotVersions: input.slotVersions ?? input.session?.slotVersions,
      planInputSignature: input.planInputSignature ?? input.session?.planInputSignature,
    }),
  );
  const selectedKey = input.selectedSlotKey ?? input.session?.selectedSlotKey;
  const selectedSlot = input.plan.slots.find((slot) => slot.slotKey === selectedKey);
  if (selectedSlot && !completed.has(selectedSlot.slotKey)) {
    return { kind: "generate", label: "生成当前图片", slotKey: selectedSlot.slotKey };
  }
  const nextSlot = input.plan.slots.find((slot) => !completed.has(slot.slotKey));
  if (stage === "produce" && nextSlot) {
    return { kind: "select", label: "继续下一槽位", slotKey: nextSlot.slotKey };
  }
  const slotKey = nextSlot?.slotKey ?? selectedKey ?? input.plan.slots[0]?.slotKey;
  if (!slotKey) {
    return { kind: "plan", label: "重新策划" };
  }
  return { kind: "generate", label: "生成当前图片", slotKey };
}

export { getAmazonCompletedSlotKeys, getAmazonPrimaryAction, getAmazonStage };
