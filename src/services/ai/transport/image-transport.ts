import type { GeneratedImage, ImageGenerationRequest } from "../../../domain/generation/types";
import {
  OpenAIImageGenerator,
  type OpenAIImageGeneratorOptions,
} from "../../openai-image-generator";

/** Shared image transport boundary used by the runtime factory.
 *
 * The legacy generator remains the compatibility implementation for Images
 * API, multipart edit, base64 and URL responses. Keeping this boundary small
 * lets adapters depend on a transport contract without changing those paths.
 */
export interface ImageRequest {
  request: ImageGenerationRequest;
  signal: AbortSignal;
}

export interface ImageResponse extends GeneratedImage {}

export type ImageTransportOptions = OpenAIImageGeneratorOptions;

export class OpenAICompatibleImageTransport {
  private readonly generator: OpenAIImageGenerator;

  constructor(options: ImageTransportOptions) {
    this.generator = new OpenAIImageGenerator(options);
  }

  request(input: ImageRequest): Promise<ImageResponse> {
    return this.generator.generate(input.request, input.signal);
  }

  generate(request: ImageGenerationRequest, signal: AbortSignal): Promise<GeneratedImage> {
    return this.generator.generate(request, signal);
  }
}

export const createImageTransport = (options: ImageTransportOptions) =>
  new OpenAICompatibleImageTransport(options);
