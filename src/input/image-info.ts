import sharp from "sharp";
import type { ImageFormat } from "../types.js";

export interface ImageInfo {
  width: number;
  height: number;
  hasAlpha: boolean;
}

export async function readImageInfo(
  buffer: Buffer,
  format: ImageFormat,
): Promise<ImageInfo | undefined> {
  try {
    const metadata = await sharp(buffer).metadata();

    if (metadata.format !== format) return undefined;

    const { width, height } = metadata.autoOrient;

    if (width === 0 || height === 0) return undefined;

    return {
      width,
      height,
      hasAlpha: metadata.hasAlpha,
    };
  } catch {
    return undefined;
  }
}
