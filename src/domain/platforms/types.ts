export type PlatformId = "taobao" | "amazon";
export type PlatformWorkflowId = "amazon-listing" | "amazon-aplus" | "taobao-product" | "taobao-detail";

export type NavigationItemId = "overview" | PlatformId | "library" | "history" | "settings";

export interface NavigationItem {
  id: NavigationItemId;
  label: string;
  kind: "global" | "platform" | "tool";
  accent?: string;
}

export type PlatformSlotGroup = "gallery" | "detail" | "listing" | "a-plus";
export type PromptLanguage = "en" | "source";

export interface SlotDimensions {
  readonly width: number;
  readonly height: number;
  readonly unit: "px";
}

export interface PlatformSlotRule {
  readonly key: string;
  readonly label: string;
  readonly group: PlatformSlotGroup;
  readonly order: number;
  readonly required: true;
  readonly dimensions: SlotDimensions;
  readonly purpose: string;
  readonly planningHints: readonly string[];
  readonly complianceReminders: readonly string[];
}

export interface PlatformExportRules {
  readonly folder: string;
  readonly fileName: (slot: PlatformSlotRule, extension: string) => string;
}

export interface PlatformRulePack {
  readonly platformId: PlatformId;
  readonly label: string;
  readonly locale: string;
  readonly promptLanguage: PromptLanguage;
  readonly slots: readonly PlatformSlotRule[];
  readonly planningInstructions: readonly string[];
  readonly promptGuardrails: readonly string[];
  readonly complianceReminders: readonly string[];
  readonly exportRules: PlatformExportRules;
}

export function definePlatformRulePack(rulePack: PlatformRulePack): PlatformRulePack {
  for (const slot of rulePack.slots) {
    Object.freeze(slot.dimensions);
    Object.freeze(slot.planningHints);
    Object.freeze(slot.complianceReminders);
    Object.freeze(slot);
  }

  Object.freeze(rulePack.slots);
  Object.freeze(rulePack.planningInstructions);
  Object.freeze(rulePack.promptGuardrails);
  Object.freeze(rulePack.complianceReminders);
  Object.freeze(rulePack.exportRules);
  return Object.freeze(rulePack);
}
