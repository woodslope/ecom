import type { PlatformPlanningRequest } from "../planning/types";
import type { SlotGenerationRequest } from "../generation/types";

export class RequestBoundaryError extends Error {
  readonly name = "RequestBoundaryError";
}

/** Shared, platform-neutral validation for runtime request envelopes. */
export function assertPlatformPlanningRequest(request: PlatformPlanningRequest): void {
  if (!request.platformId || !request.projectId || request.taskId !== request.projectId) {
    throw new RequestBoundaryError("策划请求缺少有效的平台或任务标识。");
  }
  if (!request.operationId || !request.inputSignature) {
    throw new RequestBoundaryError("策划请求缺少 operation id 或输入签名。");
  }
  if (request.platformRules.platformId !== request.platformId) {
    throw new RequestBoundaryError("策划请求的平台规则与当前平台不一致。");
  }
  if (request.outputConstraints.format !== "json-object") {
    throw new RequestBoundaryError("策划请求必须声明 JSON 对象输出约束。");
  }
  const required = request.outputConstraints.requiredSlotKeys;
  if (required.length === 0 || required.some((key) => !request.platformRules.slots.some((slot) => slot.key === key))) {
    throw new RequestBoundaryError("策划请求的槽位约束与平台规则不一致。");
  }
}

export function assertSlotGenerationRequest(request: SlotGenerationRequest): void {
  if (!request.platformId || !request.projectId || request.taskId !== request.projectId) {
    throw new RequestBoundaryError("生图请求缺少有效的平台或任务标识。");
  }
  if (!request.operationId || !request.inputSignature || !request.prompt.trim()) {
    throw new RequestBoundaryError("生图请求缺少 operation id、输入签名或槽位提示词。");
  }
  if (request.platformRules.platformId !== request.platformId) {
    throw new RequestBoundaryError("生图请求的平台规则与当前平台不一致。");
  }
  if (request.outputConstraints.format !== "image" || request.outputConstraints.slotKey !== request.slotKey) {
    throw new RequestBoundaryError("生图请求的槽位输出约束不一致。");
  }
}
