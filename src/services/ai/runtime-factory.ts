import type { ImageGenerator } from "../../domain/generation/types";
import type { ProductLocalizer } from "../../domain/localization/product-localizer";
import type { PlannerEngine } from "../../domain/planning/types";
import type { IndustryTemplateTransformer } from "../../domain/prompt-templates/industry-template-transformer";
import {
  normalizeRuntimeSettings,
  runtimeImageService,
  runtimeTextService,
} from "../../domain/settings/runtime-settings";
import { testImageApiConnection, testTextApiConnection } from "../../domain/settings/test-connection";
import type { ConnectionTestResult, RuntimeSettings } from "../../domain/settings/types";
import { OpenAIIndustryTemplateTransformer } from "../openai-industry-template-transformer";
import { OpenAIPlanner } from "../openai-planner";
import { OpenAIProductLocalizer } from "../openai-product-localizer";
import { OpenAICompatibleImageTransport } from "./transport/image-transport";

export interface AiRuntime {
  planner: PlannerEngine;
  imageGenerator: ImageGenerator;
  productLocalizer: ProductLocalizer;
  industryTemplateTransformer: IndustryTemplateTransformer;
  testTextConnection(): Promise<ConnectionTestResult>;
  testImageConnection(): Promise<ConnectionTestResult>;
}

export interface AiRuntimeFactoryOptions {
  fetch?: typeof fetch;
  plannerTimeoutMs?: number;
  imageTimeoutMs?: number;
  industryTemplateTimeoutMs?: number;
}

export interface AiRuntimeFactory {
  create(settings: RuntimeSettings): AiRuntime;
  resolve(settings: RuntimeSettings): AiRuntime;
  createPlanner(settings: RuntimeSettings): PlannerEngine;
  createImageGenerator(settings: RuntimeSettings): ImageGenerator;
  createProductLocalizer(settings: RuntimeSettings): ProductLocalizer;
  createIndustryTemplateTransformer(settings: RuntimeSettings): IndustryTemplateTransformer;
  testTextConnection(settings: RuntimeSettings): Promise<ConnectionTestResult>;
  testImageConnection(settings: RuntimeSettings): Promise<ConnectionTestResult>;
}

/** Builds the OpenAI-compatible adapters from the single runtime settings shape. */
export function createAiRuntimeFactory(options: AiRuntimeFactoryOptions = {}): AiRuntimeFactory {
  const createPlanner = (settings: RuntimeSettings): PlannerEngine => {
    const text = runtimeTextService(settings);
    return new OpenAIPlanner({
      endpoint: text.endpoint ?? text.baseUrl,
      apiKey: text.apiKey,
      model: text.model,
      protocol: text.protocol,
      fetch: options.fetch,
      timeoutMs: options.plannerTimeoutMs,
    });
  };
  const createImageGenerator = (settings: RuntimeSettings): ImageGenerator => {
    const image = runtimeImageService(settings);
    return new OpenAICompatibleImageTransport({
      baseUrl: image.baseUrl,
      apiKey: image.apiKey,
      model: image.model,
      fetch: options.fetch,
      timeoutMs: options.imageTimeoutMs,
      transport: image.protocol,
    });
  };
  const createProductLocalizer = (settings: RuntimeSettings): ProductLocalizer => {
    const text = runtimeTextService(settings);
    return new OpenAIProductLocalizer({
      endpoint: text.endpoint ?? text.baseUrl,
      apiKey: text.apiKey,
      model: text.model,
      protocol: text.protocol,
      fetch: options.fetch,
    });
  };
  const createIndustryTemplateTransformer = (settings: RuntimeSettings): IndustryTemplateTransformer => {
    const text = runtimeTextService(settings);
    return new OpenAIIndustryTemplateTransformer({
      endpoint: text.endpoint ?? text.baseUrl,
      apiKey: text.apiKey,
      model: text.model,
      protocol: text.protocol,
      fetch: options.fetch,
      timeoutMs: options.industryTemplateTimeoutMs,
    });
  };
  const testTextConnection = (settings: RuntimeSettings) =>
    testTextApiConnection(normalizeRuntimeSettings(settings), { fetch: options.fetch });
  const testImageConnection = (settings: RuntimeSettings) =>
    testImageApiConnection(normalizeRuntimeSettings(settings), { fetch: options.fetch });
  const createRuntime = (settings: RuntimeSettings): AiRuntime => ({
    planner: createPlanner(settings),
    imageGenerator: createImageGenerator(settings),
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
    createProductLocalizer,
    createIndustryTemplateTransformer,
    testTextConnection,
    testImageConnection,
  };
}

export const createAIRuntimeFactory = createAiRuntimeFactory;
