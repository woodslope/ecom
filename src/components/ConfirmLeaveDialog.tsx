import { Button, Dialog } from "./ui";

/**
 * Lightweight leave/switch confirmation when the current task has unsaved changes.
 * Leave without saving or cancel. The owning form keeps the unsaved values,
 * and leaving intentionally discards them.
 */
export function ConfirmLeaveDialog({
  open,
  description,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  description: string;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      title="提示"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            放弃
          </Button>
        </>
      }
    >
      <p>{description}</p>
    </Dialog>
  );
}
