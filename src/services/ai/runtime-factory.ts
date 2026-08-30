import type { CopilotEngine } from "../../domain/copilot";
import type { ImageGenerator } from "../../domain/generation/types";
import type { ProductLocalizer } from "../../domain/localization/product-localizer";
import type { PlannerEngine } from "../../domain/planning/types";
import type { IndustryTemplateTransformer } from "../../domain/prompt-templates/industry-template-transformer";
import {
  runtimeImageService,
  runtimeSettingsFromV2,
  runtimeTextService,
} from "../../domain/settings/runtime-settings";
import { testImageApiConnection, testTextApiConnection } from "../../domain/settings/test-connection";
import type { ConnectionTestResult } from "../../domain/settings/types";
import { detectProviderCapabilities } from "../../domain/settings/provider-capabilities";
import type { RuntimeSettings, RuntimeSettingsV2 } from "../../domain/settings/types";
import { OpenAICopilot } from "../openai-copilot";
import { OpenAIIndustryTemplateTransformer } from "../openai-industry-template-transformer";
import { OpenAIPlanner } from "../openai-planner";
import { OpenAIProductLocalizer } from "../openai-product-localizer";
import { OpenAICompatibleImageTransport } from "./transport/image-transport";

export interface AiRuntime {
  planner: PlannerEngine;
  imageGenerator: ImageGenerator;
  copilot: CopilotEngine;
  productLocalizer: ProductLocalizer;
  industryTemplateTransformer: IndustryTemplateTransformer;
  testTextConnection(): Promise<ConnectionTestResult>;
  testImageConnection(): Promise<ConnectionTestResult>;
}

export interface AiRuntimeFactoryOptions {
  fetch?: typeof fetch;
  plannerTimeoutMs?: number;
  imageTimeoutMs?: number;
  copilotTimeoutMs?: number;
  industryTemplateTimeoutMs?: number;
}

export interface AiRuntimeFactory {
  create(settings: RuntimeSettings | RuntimeSettingsV2): AiRuntime;
  resolve(settings: RuntimeSettings | RuntimeSettingsV2): AiRuntime;
  createPlanner(settings: RuntimeSettings | RuntimeSettingsV2): PlannerEngine;
  createImageGenerator(settings: RuntimeSettings | RuntimeSettingsV2): ImageGenerator;
  createCopilot(settings: RuntimeSettings | RuntimeSettingsV2): CopilotEngine;
  createProductLocalizer(settings: RuntimeSettings | RuntimeSettingsV2): ProductLocalizer;
  createIndustryTemplateTransformer(settings: RuntimeSettings | RuntimeSettingsV2): IndustryTemplateTransformer;
  testTextConnection(settings: RuntimeSettings | RuntimeSettingsV2): Promise<ConnectionTestResult>;
  testImageConnection(settings: RuntimeSettings | RuntimeSettingsV2): Promise<ConnectionTestResult>;
}

function endpoint(baseUrl: string, explicit?: string): string {
  const configured = explicit?.trim();
  if (!configured) return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  if (/^https?:\/\//i.test(configured)) return configured;
  return `${baseUrl.replace(/\/+$/, "")}/${configured.replace(/^\/+/, "")}`;
}

/**
 * Builds the existing OpenAI-compatible adapters from named runtime profiles.
 * The factory is deliberately dependency-light so callers can inject fetch in tests.
 */
export function createAiRuntimeFactory(options: AiRuntimeFactoryOptions = {}): AiRuntimeFactory {
  const createPlanner = (settings: RuntimeSettings | RuntimeSettingsV2): PlannerEngine => {
    const text = runtimeTextService(settings);
    return new OpenAIPlanner({
      endpoint: endpoint(text.baseUrl, text.endpoint),
      apiKey: text.apiKey,
      model: text.model,
      protocol: text.protocol,
      fetch: options.fetch,
      timeoutMs: options.plannerTimeoutMs,
    });
  };
  const createImageGenerator = (settings: RuntimeSettings | RuntimeSettingsV2): ImageGenerator => {
    const image = runtimeImageService(settings);
    return new OpenAICompatibleImageTransport({
      baseUrl: image.baseUrl,
      apiKey: image.apiKey,
      model: image.model,
      fetch: options.fetch,
      timeoutMs: options.imageTimeoutMs,
      transport: image.protocol ?? detectProviderCapabilities(image.baseUrl).imageTransport,
    });
  };
  const createCopilot = (settings: RuntimeSettings | RuntimeSettingsV2): CopilotEngine => {
    const text = runtimeTextService(settings);
    return new OpenAICopilot({
      endpoint: endpoint(text.baseUrl, text.endpoint),
      apiKey: text.apiKey,
      model: text.model,
      protocol: text.protocol,
      fetch: options.fetch,
      timeoutMs: options.copilotTimeoutMs,
    });
  };
  const createProductLocalizer = (settings: RuntimeSettings | RuntimeSettingsV2): ProductLocalizer => {
    const text = runtimeTextService(settings);
    return new OpenAIProductLocalizer({
      endpoint: endpoint(text.baseUrl, text.endpoint),
      apiKey: text.apiKey,
      model: text.model,
      protocol: text.protocol,
      fetch: options.fetch,
    });
  };
  const createIndustryTemplateTransformer = (settings: RuntimeSettings | RuntimeSettingsV2): IndustryTemplateTransformer => {
    const text = runtimeTextService(settings);
    return new OpenAIIndustryTemplateTransformer({
      endpoint: endpoint(text.baseUrl, text.endpoint),
      apiKey: text.apiKey,
      model: text.model,
      protocol: text.protocol,
      fetch: options.fetch,
      timeoutMs: options.industryTemplateTimeoutMs,
    });
  };
  const testTextConnection = (settings: RuntimeSettings | RuntimeSettingsV2) =>
    testTextApiConnection(runtimeSettingsFromV2(settings), { fetch: options.fetch });
  const testImageConnection = (settings: RuntimeSettings | RuntimeSettingsV2) =>
    testImageApiConnection(runtimeSettingsFromV2(settings), { fetch: options.fetch });
  const createRuntime = (settings: RuntimeSettings | RuntimeSettingsV2): AiRuntime => ({
    planner: createPlanner(settings),
    imageGenerator: createImageGenerator(settings),
    copilot: createCopilot(settings),
    productLocalizer: createProductLocalizer(settings),
    industryTemplateTransformer: createIndustryTemplateTransformer(settings),
    testTextConnection: () => testTextConnection(settings),
    testImageConnection: () => testImageConnection(settings),
  });
  return {
    create: createRuntime,
    resolve: createRuntime,
    createPlanner,
    createImageGenerator,
    createCopilot,
    createProductLocalizer,
    createIndustryTemplateTransformer,
    testTextConnection,
    testImageConnection,
  };
}

export const createAIRuntimeFactory = createAiRuntimeFactory;
