export const CANCELED_GENERATION_MESSAGE = "已取消本次图片生成，已有版本未受影响。";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "工作台操作失败";
}

function withoutTerminalPunctuation(message: string): string {
  return message.trim().replace(/[。.!！?？]+$/u, "");
}

export function generationErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "图片生成超时（请求可能已提交并产生费用），请先检查中转站任务状态，确认没有生成中的任务后再重试。已有版本未受影响。";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "本次图片生成已取消，已有版本未受影响。";
  }
  return `图片生成失败：${withoutTerminalPunctuation(errorMessage(error))}。已有版本未受影响。`;
}

export function generationOperationId(projectId: string, requestId: number, edit = false): string {
  return `generation${edit ? "-edit" : ""}-${projectId}-${requestId}`;
}
