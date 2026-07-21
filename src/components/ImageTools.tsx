import { Download, ImagePlus, ScanLine } from "lucide-react";

import { Button, IconButton, StatusMessage } from "./ui";

export function ImageTools({
  fileName,
  editingSupported,
  editingDisabledReason = "当前图片服务不支持显式遮罩编辑。",
  showEditingHint = true,
  busy = false,
  onDownload,
  onUseAsReference,
  onEdit,
}: {
  fileName: string;
  editingSupported: boolean;
  editingDisabledReason?: string;
  showEditingHint?: boolean;
  busy?: boolean;
  onDownload: () => void;
  onUseAsReference: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="image-tools" aria-label="图片工具">
      <IconButton label={`下载 ${fileName}`} disabled={busy} onClick={onDownload}>
        <Download size={15} />
      </IconButton>
      <Button variant="secondary" size="compact" disabled={busy} onClick={onUseAsReference}>
        <ImagePlus size={15} />
        用作参考图
      </Button>
      <Button
        variant="secondary"
        size="compact"
        disabled={busy || !editingSupported}
        title={!editingSupported ? editingDisabledReason : undefined}
        onClick={onEdit}
      >
        <ScanLine size={15} />
        局部编辑
      </Button>
      {!editingSupported && showEditingHint ? (
        <StatusMessage className="image-tools__hint">{editingDisabledReason}</StatusMessage>
      ) : null}
    </div>
  );
}
