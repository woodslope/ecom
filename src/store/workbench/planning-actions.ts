export const STALE_PLAN_MESSAGE = "商品资料或参考素材已更新，请重新策划当前平台后再继续。";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "工作台操作失败";
}

export function planningErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "AI 策划超时，请检查连接后重试。商品资料和已有结果未受影响。";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "本次策划已取消，商品资料和已有结果未受影响。";
  }
  return `AI 策划失败：${errorMessage(error)}。商品资料和已有结果未受影响。`;
}

export function planningOperationId(projectId: string, requestId: number): string {
  return `planning-${projectId}-${requestId}`;
}
