import { MaskValidationError, validateMaskDraft, type MaskDraft } from "./mask";

export interface MaskTarget {
  name: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

export interface PreparedMaskTarget {
  target: MaskTarget;
  mask: MaskDraft;
}

export async function prepareMaskTarget(
  target: MaskTarget | null,
  mask: MaskDraft,
): Promise<PreparedMaskTarget> {
  if (!target || target.blob.size === 0 || !target.mimeType.startsWith("image/")) {
    throw new MaskValidationError("target", "当前版本图片不存在，无法进行局部编辑。");
  }
  validateMaskDraft(mask);
  if (target.width !== mask.width || target.height !== mask.height) {
    throw new MaskValidationError("dimensions", "遮罩尺寸与目标图片不一致，请重新打开图片工具。");
  }
  return { target, mask };
}
