export type MaskValidationErrorCode = "target" | "empty" | "full" | "dimensions" | "format";

export interface MaskDraft {
  blob: Blob;
  width: number;
  height: number;
  /** Ratio of pixels selected for editing, from 0 to 1. */
  coverage: number;
}

export class MaskValidationError extends Error {
  readonly name = "MaskValidationError";

  constructor(
    readonly code: MaskValidationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function validateMaskDraft(mask: MaskDraft): void {
  if (mask.blob.size === 0 || mask.blob.type !== "image/png") {
    throw new MaskValidationError("format", "遮罩必须是有效的 PNG 图片。");
  }
  if (!Number.isFinite(mask.coverage) || mask.coverage <= 0) {
    throw new MaskValidationError("empty", "请先涂抹需要编辑的区域。");
  }
  if (mask.coverage >= 1) {
    throw new MaskValidationError("full", "遮罩不能覆盖整张图片，请保留无需修改的区域。");
  }
  if (
    !Number.isInteger(mask.width) ||
    !Number.isInteger(mask.height) ||
    mask.width <= 0 ||
    mask.height <= 0
  ) {
    throw new MaskValidationError("dimensions", "遮罩尺寸无效，请重新打开图片工具。");
  }
}
