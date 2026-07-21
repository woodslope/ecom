import { currentSlotVersion } from "../generation/current-version";
import type { PlatformSession } from "./project-workspace";

export type AmazonStage = "prepare" | "review" | "produce" | "deliver";

export type AmazonPrimaryAction =
  | { kind: "plan"; label: "生成图片策划" }
  | { kind: "generate"; label: "生成当前图片"; slotKey: string }
  | { kind: "select"; label: "继续下一槽位"; slotKey: string }
  | { kind: "export"; label: "导出完整交付包" };

export function getAmazonCompletedSlotKeys(session: PlatformSession): string[] {
  if (session.platformId !== "amazon" || !session.plan) return [];
  return session.plan.slots.flatMap((slot) =>
    currentSlotVersion(
      slot,
      session.slotVersions[slot.slotKey],
      session.planInputSignature,
    )
      ? [slot.slotKey]
      : [],
  );
}

export function getAmazonStage(session: PlatformSession): AmazonStage {
  if (session.platformId !== "amazon" || !session.plan) return "prepare";
  const completedCount = getAmazonCompletedSlotKeys(session).length;
  if (completedCount === 0) return "review";
  return completedCount === session.plan.slots.length ? "deliver" : "produce";
}

export function getAmazonPrimaryAction(session: PlatformSession): AmazonPrimaryAction {
  const stage = getAmazonStage(session);
  if (stage === "prepare" || !session.plan) {
    return { kind: "plan", label: "生成图片策划" };
  }
  if (stage === "deliver") {
    return { kind: "export", label: "导出完整交付包" };
  }
  const completed = new Set(getAmazonCompletedSlotKeys(session));
  const selectedSlot = session.plan.slots.find(
    (slot) => slot.slotKey === session.selectedSlotKey,
  );
  if (selectedSlot && !completed.has(selectedSlot.slotKey)) {
    return { kind: "generate", label: "生成当前图片", slotKey: selectedSlot.slotKey };
  }
  const nextSlot = session.plan.slots.find((slot) => !completed.has(slot.slotKey));
  if (stage === "produce" && nextSlot) {
    return { kind: "select", label: "继续下一槽位", slotKey: nextSlot.slotKey };
  }
  const slotKey = nextSlot?.slotKey ?? session.selectedSlotKey ?? session.plan.slots[0]?.slotKey;
  if (!slotKey) return { kind: "plan", label: "生成图片策划" };
  return {
    kind: "generate",
    label: "生成当前图片",
    slotKey,
  };
}
