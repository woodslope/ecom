import type {
  ProductionEvent,
  ProductionRun,
} from "../workspace/project-workspace";

export type RunOutputPreviewEvent = ProductionEvent & {
  assetId: string;
  slotKey: string;
};

function isOutputPreviewEvent(event: ProductionEvent): event is RunOutputPreviewEvent {
  return Boolean(event.assetId && event.slotKey && event.status === "success");
}

export function selectRunOutputPreviews(
  run: ProductionRun,
  limit = Number.POSITIVE_INFINITY,
): RunOutputPreviewEvent[] {
  const latestBySlot = new Map<string, RunOutputPreviewEvent>();

  for (let index = run.events.length - 1; index >= 0; index -= 1) {
    const event = run.events[index]!;
    if (!isOutputPreviewEvent(event) || latestBySlot.has(event.slotKey)) continue;
    latestBySlot.set(event.slotKey, event);
  }

  const slotOrder = new Map(
    run.planSnapshot.slots.map((slot, index) => [slot.slotKey, index]),
  );

  return [...latestBySlot.values()]
    .sort((left, right) => {
      const leftIndex = slotOrder.get(left.slotKey) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = slotOrder.get(right.slotKey) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.createdAt.localeCompare(right.createdAt);
    })
    .slice(0, limit);
}
