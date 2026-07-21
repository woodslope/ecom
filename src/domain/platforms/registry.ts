import { amazonRulePack } from "./amazon";
import { taobaoRulePack } from "./taobao";
import type {
  NavigationItem,
  PlatformId,
  PlatformRulePack,
  PlatformWorkflowId,
} from "./types";

export const supportedPlatformIds: readonly PlatformId[] = Object.freeze(["taobao", "amazon"]);

export const platformRulePacks: Readonly<Record<PlatformId, PlatformRulePack>> = Object.freeze({
  taobao: taobaoRulePack,
  amazon: amazonRulePack,
});

export function getPlatformRulePack(platformId: PlatformId): PlatformRulePack {
  return platformRulePacks[platformId];
}

export interface PlatformWorkflowDefinition {
  readonly id: PlatformWorkflowId;
  readonly platformId: PlatformId;
  readonly label: string;
  readonly rulePack: PlatformRulePack;
  readonly input: "listing" | "product";
}

export const platformWorkflows: readonly PlatformWorkflowDefinition[] = Object.freeze([
  {
    id: "amazon-listing",
    platformId: "amazon",
    label: "Amazon Listing",
    rulePack: amazonRulePack,
    input: "listing",
  },
  {
    id: "amazon-aplus",
    platformId: "amazon",
    label: "Amazon A+",
    rulePack: amazonRulePack,
    input: "listing",
  },
  {
    id: "taobao-product",
    platformId: "taobao",
    label: "淘宝商品生产包",
    rulePack: taobaoRulePack,
    input: "product",
  },
]);

export function normalizePlatformWorkflowId(value: unknown): PlatformWorkflowId | null {
  if (value === "taobao-detail") return "taobao-product";
  return platformWorkflows.some((workflow) => workflow.id === value)
    ? value as PlatformWorkflowId
    : null;
}

export function getPlatformWorkflow(workflowId: PlatformWorkflowId): PlatformWorkflowDefinition {
  const workflow = platformWorkflows.find((candidate) => candidate.id === workflowId);
  if (!workflow) throw new Error(`Unsupported platform workflow: ${workflowId}`);
  return workflow;
}

export const navigationItems: NavigationItem[] = [
  { id: "overview", label: "概览", kind: "global" },
  { id: "library", label: "资料库", kind: "global" },
  { id: "taobao", label: "淘宝 / 天猫", kind: "platform", accent: "var(--taobao)" },
  { id: "amazon", label: "Amazon", kind: "platform", accent: "var(--amazon)" },
  { id: "history", label: "生产记录", kind: "tool" },
  { id: "settings", label: "设置", kind: "tool" },
];
