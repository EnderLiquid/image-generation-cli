import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ImageInput } from "../api/types.js";
import { ioError, usageError } from "../errors.js";
import { detectImageFormat, mimeForFormat } from "./mime.js";

export const MAX_IMAGE_URL_CHARS = 20_971_520;
const MAX_LOCAL_BYTES =
  Math.floor((MAX_IMAGE_URL_CHARS - 64) / 4) * 3;

export interface ImageReference {
  input: ImageInput;
  rawBytes: number;
  display: string;
}

export interface LoadImageOptions {
  requirePng?: boolean;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function loadImageReference(
  value: string,
  options: LoadImageOptions = {},
): Promise<ImageReference> {
  if (!value) {
    throw usageError("图片参数不能为空");
  }

  if (value.startsWith("file-")) {
    throw usageError(
      "不支持 Files API file_id，请使用本地文件或 HTTPS URL",
    );
  }

  if (isHttpUrl(value)) {
    if (value.length > MAX_IMAGE_URL_CHARS) {
      throw usageError(
        `图片 URL 长度超过 ${MAX_IMAGE_URL_CHARS} 字符限制`,
      );
    }

    return {
      input: { image_url: value },
      rawBytes: 0,
      display: value,
    };
  }

  const filePath = path.resolve(value);

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    throw ioError(
      `无法读取图片文件: ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      6,
      error,
    );
  }

  if (!fileStat.isFile()) {
    throw usageError(`图片路径不是文件: ${filePath}`);
  }

  if (fileStat.size > MAX_LOCAL_BYTES) {
    throw usageError(
      `本地图片超过 data URL 大小限制: ${filePath} (${fileStat.size} 字节)`,
    );
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    throw ioError(
      `读取图片失败: ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      6,
      error,
    );
  }

  const format = detectImageFormat(buffer);
  if (!format) {
    throw usageError(
      `无法识别图片格式: ${filePath}，仅支持 png、jpeg、webp`,
    );
  }

  if (options.requirePng && format !== "png") {
    throw usageError(`mask 和 markup 必须是 PNG: ${filePath}`);
  }

  const dataUrl = `data:${mimeForFormat(format)};base64,${buffer.toString("base64")}`;

  if (dataUrl.length > MAX_IMAGE_URL_CHARS) {
    throw usageError(
      `图片转换为 data URL 后超过 ${MAX_IMAGE_URL_CHARS} 字符限制: ${filePath}`,
    );
  }

  return {
    input: { image_url: dataUrl },
    rawBytes: buffer.length,
    display: `${filePath} (${format}, ${buffer.length} 字节)`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function sanitizeImageInput(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const imageUrl = value.image_url;
  if (typeof imageUrl !== "string" || !imageUrl.startsWith("data:")) {
    return value;
  }

  const comma = imageUrl.indexOf(",");
  const header = comma >= 0 ? imageUrl.slice(0, comma) : "data:";

  return {
    ...value,
    image_url: `[data-url ${header}; ${imageUrl.length} 字符]`,
  };
}

export function sanitizeRequestForDryRun(request: unknown): unknown {
  if (!isRecord(request)) return request;

  return Object.fromEntries(
    Object.entries(request).map(([key, value]) => {
      if (key === "images" && Array.isArray(value)) {
        return [key, value.map(sanitizeImageInput)];
      }

      if (key === "mask" || key === "markup") {
        return [key, sanitizeImageInput(value)];
      }

      return [key, value];
    }),
  );
}
