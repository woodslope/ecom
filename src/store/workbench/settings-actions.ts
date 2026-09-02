import {
  runtimeImageApiKey,
  runtimeTextApiKey,
  type RuntimeSettings,
} from "../../domain/settings";

export interface RuntimeAvailabilityChecks {
  requireTextRuntime(settings: RuntimeSettings): string | null;
  requireImageRuntime(settings: RuntimeSettings): string | null;
}

export function createRuntimeAvailabilityChecks(input: {
  hasRuntimeFactory: boolean;
  hasInjectedTextEngine: boolean;
  hasInjectedImageEngine: boolean;
}): RuntimeAvailabilityChecks {
  return {
    requireTextRuntime(settings) {
      if (!input.hasInjectedTextEngine && !runtimeTextApiKey(settings)) {
        return "未配置文本 API Key，请先在设置中填写文本 API。";
      }
      if (!input.hasInjectedTextEngine && !settings.planningModel.trim()) {
        return "未配置文本模型，请先在设置中填写文本模型。";
      }
      if (!input.hasRuntimeFactory && !input.hasInjectedTextEngine) {
        return "文本 API 运行时不可用，请检查运行设置。";
      }
      return null;
    },
    requireImageRuntime(settings) {
      if (!input.hasInjectedImageEngine && !runtimeImageApiKey(settings)) {
        return "未配置图片 API Key，请先在设置中填写图片 API。";
      }
      if (!input.hasInjectedImageEngine && settings.connectionMode !== "single" && !settings.imageModel.trim()) {
        return "未配置图片模型，请先在设置中填写图片模型。";
      }
      if (!input.hasRuntimeFactory && !input.hasInjectedImageEngine) {
        return "图片 API 运行时不可用，请检查运行设置。";
      }
      return null;
    },
  };
}
