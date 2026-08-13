import type { PlatformId } from "../platforms/types";

export type OverviewDestination = PlatformId | "library";

export interface OverviewNextAction {
  readonly title: string;
  readonly actionLabel: string;
  readonly destination: OverviewDestination;
}

/**
 * Route the overview primary CTA by project readiness and the user's last platform.
 * Defaults still prefer Amazon for brand-new workspaces, but an explicit Taobao
 * preference must not be overwritten by Amazon-only copy.
 */
export function resolveOverviewNextAction(input: {
  hasActiveProject: boolean;
  hasUsableFacts: boolean;
  assetCount: number;
  preferredPlatform: PlatformId;
}): OverviewNextAction {
  if (!input.hasActiveProject) {
    return {
      title: "从资料库建立商品档案",
      actionLabel: "进入资料库",
      destination: "library",
    };
  }

  if (input.preferredPlatform === "taobao") {
    if (!input.hasUsableFacts && input.assetCount === 0) {
      return {
        title: "补商品资料或参考图后进入淘宝生产",
        actionLabel: "进入淘宝 / 天猫",
        destination: "taobao",
      };
    }
    return {
      title: "淘宝：分析商品后策划主图与详情",
      actionLabel: "进入淘宝 / 天猫",
      destination: "taobao",
    };
  }

  if (!input.hasUsableFacts && input.assetCount === 0) {
    return {
      title: "补商品资料或参考图后进入 Amazon",
      actionLabel: "进入 Amazon",
      destination: "amazon",
    };
  }

  return {
    title: "Amazon：选 Listing 或 A+ 后策划出图",
    actionLabel: "进入 Amazon",
    destination: "amazon",
  };
}

export const OVERVIEW_EMPTY_STATUS =
  "资料库建档 → 平台策划 → 逐图生成 → 导出";
