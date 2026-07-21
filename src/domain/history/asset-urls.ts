export interface HistoryAssetRecord {
  blob: Blob;
}

export async function loadHistoryAssetUrls(
  assetIds: readonly string[],
  loadAsset: (assetId: string) => Promise<HistoryAssetRecord | Blob | null>,
  createObjectURL: (blob: Blob) => string,
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const assetId of [...new Set(assetIds)]) {
    const asset = await loadAsset(assetId);
    if (!asset) continue;
    urls[assetId] = createObjectURL(asset instanceof Blob ? asset : asset.blob);
  }
  return urls;
}

export function releaseHistoryAssetUrls(
  urls: Record<string, string>,
  revokeObjectURL: (url: string) => void,
): void {
  Object.values(urls).forEach(revokeObjectURL);
}
