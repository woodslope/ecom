import { Button, Dialog } from "./ui";

/**
 * Lightweight leave/switch confirmation when workspace has unsaved drafts.
 * Return to save / discard / cancel. The owning form keeps the unsaved draft,
 * so this dialog does not pretend it can submit that form on the user's behalf.
 */
export function ConfirmLeaveDialog({
  open,
  title = "有未保存的修改",
  description,
  saving = false,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  title?: string;
  description: string;
  saving?: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      eyebrow="未保存修改"
      onClose={saving ? () => undefined : onCancel}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onCancel}>
            取消
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onDiscard}>
            丢弃修改
          </Button>
          <Button disabled={saving} onClick={() => void onSave()}>
            {saving ? "处理中…" : "返回保存"}
          </Button>
        </>
      }
    >
      <p>{description}</p>
    </Dialog>
  );
}
