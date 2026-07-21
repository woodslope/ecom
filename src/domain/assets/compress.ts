export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CompressImageFileOptions {
  maxEdge?: number;
  quality?: number;
}

export function calculateConstrainedDimensions(
  width: number,
  height: number,
  maxEdge: number,
): ImageDimensions {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxEdge) ||
    width <= 0 ||
    height <= 0 ||
    maxEdge <= 0
  ) {
    throw new RangeError("Image dimensions and maxEdge must be positive numbers");
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("The browser could not encode the compressed image"));
        }
      },
      type,
      quality,
    );
  });
}

export async function compressImageFile(
  file: File,
  options: CompressImageFileOptions = {},
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);

    try {
      const dimensions = calculateConstrainedDimensions(
        bitmap.width,
        bitmap.height,
        options.maxEdge ?? 2048,
      );
      if (dimensions.width === bitmap.width && dimensions.height === bitmap.height) {
        return file;
      }

      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas 2D context is unavailable");
      }

      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
      const blob = await encodeCanvas(
        canvas,
        file.type || "image/jpeg",
        options.quality ?? 0.86,
      );

      return new File([blob], file.name, {
        type: blob.type || file.type,
        lastModified: file.lastModified,
      });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
