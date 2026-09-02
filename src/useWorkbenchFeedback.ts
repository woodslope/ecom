import { useEffect, useState } from "react";
import type { WorkbenchAsset } from "./store/workbench-store";

type ExportedFile = { blob: Blob; fileName: string };

export function useWorkbenchFeedback({
  warning,
  assets,
  uploadReferenceFiles,
  exportPlatform,
  exportRun,
}: {
  warning: string | null;
  assets: WorkbenchAsset[];
  uploadReferenceFiles: (files: File[]) => Promise<WorkbenchAsset[]>;
  exportPlatform: (platformId: "taobao" | "amazon") => Promise<ExportedFile | null>;
  exportRun: (runId: string) => Promise<ExportedFile | null>;
}) {
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [warningVisible, setWarningVisible] = useState(false);

  useEffect(() => {
    if (!uploadFeedback) return;
    const timer = window.setTimeout(() => setUploadFeedback(null), 3600);
    return () => window.clearTimeout(timer);
  }, [uploadFeedback]);

  useEffect(() => {
    if (!exportFeedback) return;
    const timer = window.setTimeout(() => setExportFeedback(null), 3600);
    return () => window.clearTimeout(timer);
  }, [exportFeedback]);

  useEffect(() => {
    setWarningVisible(Boolean(warning));
    if (!warning) return;
    const timer = window.setTimeout(() => setWarningVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, [warning]);

  const upload = async (files: File[]) => {
    const beforeIds = new Set(assets.map((asset) => asset.metadata.id));
    const result = await uploadReferenceFiles(files);
    const addedCount = result.filter((asset) => !beforeIds.has(asset.metadata.id)).length;
    if (addedCount > 0) setUploadFeedback(`已上传 ${addedCount} 张参考图`);
  };

  const downloadExport = (exported: ExportedFile | null) => {
    if (!exported) return;
    const url = URL.createObjectURL(exported.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exported.fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setExportFeedback(`已开始下载 ${exported.fileName}`);
  };

  const downloadGeneratedImage = (asset: WorkbenchAsset) => {
    const anchor = document.createElement("a");
    anchor.href = asset.objectUrl;
    anchor.download = asset.metadata.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };

  return {
    uploadFeedback,
    exportFeedback,
    warningVisible,
    upload,
    downloadExport,
    downloadGeneratedImage,
    exportCurrentPlatform: async (platformId: "taobao" | "amazon") => {
      downloadExport(await exportPlatform(platformId));
    },
    exportHistoryRun: async (runId: string) => {
      downloadExport(await exportRun(runId));
    },
    dismissUploadFeedback: () => setUploadFeedback(null),
    dismissExportFeedback: () => setExportFeedback(null),
  };
}
