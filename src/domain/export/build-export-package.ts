import { strToU8, zipSync } from "fflate";

import { runCompliance } from "../compliance";
import { currentSlotVersion } from "../generation/current-version";
import type { SlotVersion } from "../generation/types";
import { getAmazonMarketplace } from "../platforms/amazon-marketplaces";
import type {
  BuildExportPackageInput,
  ExportManifest,
  ExportManifestVersion,
  ExportPackage,
} from "./types";

function extensionForMimeType(mimeType: string): string | null {
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return null;
}

function manifestVersion(version: SlotVersion): ExportManifestVersion {
  return {
    id: version.id,
    createdAt: version.createdAt,
    source: version.source,
    promptSnapshot: version.promptSnapshot,
    visibleCopySnapshot: version.visibleCopySnapshot,
    width: version.width,
    height: version.height,
    mimeType: version.mimeType,
    parameters: { ...version.parameters },
  };
}

function safeFilePart(value: string): string {
  const normalized = value.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return normalized.replace(/^-+|-+$/g, "") || "project";
}

function buildPrompts(manifest: ExportManifest): string {
  const lines = [
    `# ${manifest.project.productName} · ${manifest.platform.label} Prompt 快照`,
    "",
    `导出时间：${manifest.exportedAt}`,
    `交付状态：${manifest.ready ? "完整" : `缺少 ${manifest.missingSlots.join("、")}`}`,
    "",
  ];

  for (const slot of manifest.slots) {
    lines.push(`## ${slot.slotKey} · ${slot.label}`, "");
    lines.push(`文件：${slot.fileName ?? "未生成"}`);
    lines.push(`Prompt：${slot.version?.promptSnapshot ?? "暂无活动版本"}`);
    lines.push(`可见文案：${slot.version?.visibleCopySnapshot || "无"}`, "");
  }
  return lines.join("\n");
}

function buildExternalCopy(manifest: ExportManifest): string | null {
  const slots = manifest.slots.filter((slot) => slot.externalText);
  if (slots.length === 0) return null;
  const lines = [`# ${manifest.project.productName} · A+ 外部文案`, ""];
  for (const slot of slots) {
    lines.push(`## ${slot.slotKey} · ${slot.label}`, "");
    lines.push(`标题：${slot.externalText?.title ?? ""}`);
    lines.push(`正文：${slot.externalText?.body ?? ""}`, "");
  }
  return lines.join("\n");
}

export async function buildExportPackage({
  project,
  rulePack,
  plan,
  planningInputSignature,
  slotVersions = {},
  loadAsset,
  now = () => new Date().toISOString(),
  runContext,
}: BuildExportPackageInput): Promise<ExportPackage> {
  if (plan.platformId !== rulePack.platformId) {
    throw new Error("导出策划与平台规则不匹配");
  }

  const archiveFiles: Record<string, Uint8Array> = {};
  const missingSlots: string[] = [];
  const slots = [];

  for (const rule of [...rulePack.slots].sort((a, b) => a.order - b.order)) {
    const plannedSlot = plan.slots.find((slot) => slot.slotKey === rule.key);
    if (!plannedSlot) {
      throw new Error(`导出策划缺少必需槽位：${rule.key}`);
    }
    const versionState = slotVersions[rule.key];
    const activeVersion = currentSlotVersion(
      plannedSlot,
      versionState,
      planningInputSignature,
    );
    let fileName: string | null = null;

    if (activeVersion) {
      const stored = await loadAsset(activeVersion.assetId);
      if (!stored) {
        throw new Error(`历史输出素材不存在：${rule.key} · ${activeVersion.assetId}`);
      }
      const extension = stored ? extensionForMimeType(stored.metadata.mimeType) : null;
      if (!extension) {
        throw new Error(`历史输出素材格式不支持：${rule.key} · ${stored.metadata.mimeType}`);
      }
      if (stored) {
        fileName = rulePack.exportRules.fileName(rule, extension);
        archiveFiles[fileName] = new Uint8Array(await stored.blob.arrayBuffer());
      }
    }

    if (!fileName) missingSlots.push(rule.key);
    slots.push({
      slotKey: rule.key,
      label: rule.label,
      order: rule.order,
      dimensions: { ...rule.dimensions },
      fileName,
      version: activeVersion ? manifestVersion(activeVersion) : null,
      ...(plannedSlot.externalText
        ? { externalText: { ...plannedSlot.externalText } }
        : {}),
      compliance: runCompliance(project, rulePack, plannedSlot),
    });
  }

  const exportedAt = now();
  const marketplace = plan.platformId === "amazon"
    ? getAmazonMarketplace(plan.amazonSession?.marketplaceId)
    : null;
  const manifest: ExportManifest = {
    schemaVersion: 1,
    exportedAt,
    project: {
      id: project.id,
      name: project.name,
      productName: project.facts.productName,
      sku: project.facts.sku,
    },
    platform: {
      id: rulePack.platformId,
      label: rulePack.label,
      locale: rulePack.locale,
      ...(marketplace
        ? {
            marketplaceId: marketplace.id,
            copyLanguage: marketplace.copyLanguage,
          }
        : {}),
    },
    ...(runContext
      ? {
          run: {
            id: runContext.id,
            sessionId: runContext.sessionId,
            workflowId: runContext.workflowId,
            source: runContext.source,
          },
          options: JSON.parse(JSON.stringify(runContext.options)),
        }
      : {}),
    ready: missingSlots.length === 0,
    missingSlots,
    manualReviewRequired: true,
    platformReminders: [...rulePack.complianceReminders],
    slots,
  };

  archiveFiles["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  archiveFiles["prompts.md"] = strToU8(buildPrompts(manifest));
  const externalCopy = buildExternalCopy(manifest);
  if (externalCopy) archiveFiles["external-copy.md"] = strToU8(externalCopy);
  const archive = zipSync(archiveFiles, { level: 6 });

  return {
    blob: new Blob([archive], { type: "application/zip" }),
    fileName: `${safeFilePart(project.name)}-${rulePack.platformId}-${exportedAt.slice(0, 10)}.zip`,
    manifest,
  };
}
