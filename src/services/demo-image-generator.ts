import type {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerator,
} from "../domain/generation/types";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("图片生成已取消", "AbortError");
}

function waitForDemo(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new DOMException("图片生成已取消", "AbortError"));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function buildDemoSvg(request: ImageGenerationRequest): string {
  const { width, height } = request.dimensions;
  const shortPrompt = request.prompt.replace(/\s+/g, " ").trim().slice(0, 120);
  const copy = request.visibleCopy.trim() || "No overlay copy";
  const baseSize = Math.max(20, Math.round(Math.min(width, height) * 0.028));
  const titleSize = Math.max(30, Math.round(Math.min(width, height) * 0.052));
  const mockLabel = request.edit ? "DEMO LOCAL EDIT" : "DEMO MOCK";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f7f9fb"/>
  <rect x="${width * 0.055}" y="${height * 0.055}" width="${width * 0.89}" height="${height * 0.89}" rx="${Math.max(12, Math.round(Math.min(width, height) * 0.02))}" fill="#ffffff" stroke="#cfd8df" stroke-width="${Math.max(2, Math.round(Math.min(width, height) * 0.002))}"/>
  <rect x="${width * 0.105}" y="${height * 0.16}" width="${width * 0.79}" height="${height * 0.46}" rx="${Math.max(10, Math.round(Math.min(width, height) * 0.018))}" fill="#e8f1ff"/>
  <path d="M ${width * 0.2} ${height * 0.52} C ${width * 0.34} ${height * 0.25}, ${width * 0.66} ${height * 0.25}, ${width * 0.8} ${height * 0.52}" fill="none" stroke="#2470e8" stroke-width="${Math.max(6, Math.round(Math.min(width, height) * 0.014))}" stroke-linecap="round"/>
  <circle cx="${width * 0.5}" cy="${height * 0.39}" r="${Math.min(width, height) * 0.095}" fill="#eeeafb" stroke="#7057d9" stroke-width="${Math.max(4, Math.round(Math.min(width, height) * 0.008))}"/>
  <rect x="${width * 0.105}" y="${height * 0.09}" width="${width * 0.22}" height="${height * 0.055}" rx="${height * 0.014}" fill="#fff3d6"/>
  <text x="${width * 0.125}" y="${height * 0.128}" font-family="Arial, sans-serif" font-size="${baseSize}" font-weight="700" fill="#7c5815">${mockLabel}</text>
  <text x="${width * 0.105}" y="${height * 0.7}" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="#171a1c">${escapeXml(request.slotKey)}</text>
  <text x="${width * 0.105}" y="${height * 0.77}" font-family="Arial, sans-serif" font-size="${baseSize}" font-weight="700" fill="#2470e8">${escapeXml(request.productName)}</text>
  <text x="${width * 0.105}" y="${height * 0.825}" font-family="Arial, sans-serif" font-size="${baseSize * 0.82}" fill="#555d63">${escapeXml(copy.slice(0, 72))}</text>
  <text x="${width * 0.105}" y="${height * 0.875}" font-family="Arial, sans-serif" font-size="${baseSize * 0.7}" fill="#7d858b">${escapeXml(shortPrompt)}</text>
</svg>`;
}

export class DemoImageGenerator implements ImageGenerator {
  constructor(private readonly delayMs = 0) {}

  async generate(
    request: ImageGenerationRequest,
    signal: AbortSignal,
  ): Promise<GeneratedImage> {
    throwIfAborted(signal);
    await waitForDemo(this.delayMs, signal);
    const svg = buildDemoSvg(request);
    throwIfAborted(signal);
    return {
      blob: new Blob([svg], { type: "image/svg+xml" }),
      width: request.dimensions.width,
      height: request.dimensions.height,
      mimeType: "image/svg+xml",
      source: "demo",
      parameters: {
        engine: request.edit ? "demo-svg-edit-v1" : "demo-svg-v1",
        operation: request.edit ? "edit" : "generation",
        ...(request.edit ? { masked: true } : {}),
        size: `${request.dimensions.width}x${request.dimensions.height}`,
        uploadSize: `${request.uploadDimensions.width}x${request.uploadDimensions.height}`,
        ...(request.sizeTier ? { sizeTier: request.sizeTier } : {}),
      },
    };
  }
}

export const demoImageGenerator = new DemoImageGenerator();
export const interactiveDemoImageGenerator = new DemoImageGenerator(600);

export function createFailOnceImageGenerator(
  delegate: ImageGenerator,
  message = "本地验收夹具：模拟图片服务失败",
): ImageGenerator {
  let shouldFail = true;
  return {
    async generate(request, signal) {
      const result = await delegate.generate(request, signal);
      if (shouldFail) {
        shouldFail = false;
        throw new Error(message);
      }
      return result;
    },
  };
}
