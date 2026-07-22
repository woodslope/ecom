import { useCallback, useRef, type ChangeEvent, type ReactNode } from "react";

/**
 * Always-mounted hidden file input for platform chrome "上传参考图" actions.
 * Avoids relying on AssetLibrary being mounted (intake / collapsed source column).
 */
export function GlobalAssetUpload({
  disabled = false,
  onUpload,
  children,
}: {
  disabled?: boolean;
  onUpload: (files: File[]) => void | Promise<void>;
  children: (api: { openFilePicker: () => void }) => ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const changeFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || disabled) return;
    await onUpload(files);
  };

  return (
    <>
      <input
        ref={inputRef}
        className="visually-hidden-input"
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        onChange={(event) => void changeFiles(event)}
        data-testid="asset-upload"
        aria-hidden="true"
        tabIndex={-1}
      />
      {children({ openFilePicker })}
    </>
  );
}
