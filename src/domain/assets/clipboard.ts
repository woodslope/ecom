/** Return image files exposed by a paste event's clipboard payload. */
export function extractClipboardImageFiles(
  clipboardData: DataTransfer | null | undefined,
): File[] {
  if (!clipboardData) return [];

  const files: File[] = [];
  const seen = new Set<File>();
  const add = (file: File | null) => {
    if (!file || !file.type.toLowerCase().startsWith("image/") || seen.has(file)) return;
    seen.add(file);
    files.push(file);
  };

  Array.from(clipboardData.files ?? []).forEach(add);
  Array.from(clipboardData.items ?? []).forEach((item) => {
    if (item.kind === "file" && item.type.toLowerCase().startsWith("image/")) {
      add(item.getAsFile());
    }
  });

  return files;
}
