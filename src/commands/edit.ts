import type {
  ImageEditRequest,
  ImageInput,
} from "../api/types.js";
import type { RetryInfo } from "../api/client.js";
import type { OutputDefaults } from "../config/schema.js";
import { usageError } from "../errors.js";
import {
  loadImageReference,
  type ImageReference,
} from "../input/data-url.js";
import type { ImageInfo } from "../input/image-info.js";
import type { CommandResult } from "../output/result.js";
import { runImageOperation } from "./common.js";

export interface EditCommandOptions {
  prompt: string;
  images: string[];
  mask?: string;
  markup?: string;
  configPath?: string;
  provider?: string;
  model?: string;
  outDir?: string;
  name?: string;
  force?: boolean;
  dryRun?: boolean;
  timeoutSeconds?: number;
  retries?: number;
  cliDefaults?: OutputDefaults;
  cwd?: string;
  onRetry?: (info: RetryInfo) => void;
}

function assertSameSize(
  label: string,
  reference: ImageReference,
  first: ImageInfo | undefined,
): void {
  const info = reference.info;

  // info 的宽高已按 EXIF 方向校正；只对能读取元数据的本地图片预检。
  if (!info || !first) return;

  if (info.width !== first.width || info.height !== first.height) {
    throw usageError(
      `${label} 尺寸 ${info.width}x${info.height} 与第一张输入图 ${first.width}x${first.height} 不一致: ${reference.display}`,
    );
  }
}

export async function editCommand(
  options: EditCommandOptions,
): Promise<CommandResult> {
  if (options.images.length < 1 || options.images.length > 16) {
    throw usageError("--image 必须提供 1 到 16 个");
  }

  if (options.mask && options.markup) {
    throw usageError("--mask 和 --markup 不能同时使用");
  }

  const images: ImageInput[] = [];
  let firstImageInfo: ImageInfo | undefined;

  for (const [index, value] of options.images.entries()) {
    const reference = await loadImageReference(value);
    images.push(reference.input);

    if (index === 0) {
      firstImageInfo = reference.info;
    }
  }

  let mask: ImageInput | undefined;
  if (options.mask) {
    const reference = await loadImageReference(options.mask, {
      requirePng: true,
      requireAlpha: true,
      label: "mask",
    });
    assertSameSize("mask", reference, firstImageInfo);
    mask = reference.input;
  }

  let markup: ImageInput | undefined;
  if (options.markup) {
    const reference = await loadImageReference(options.markup, {
      requirePng: true,
      requireAlpha: true,
      label: "markup",
    });
    assertSameSize("markup", reference, firstImageInfo);
    markup = reference.input;
  }

  const request: ImageEditRequest = {
    model: "",
    prompt: "",
    images,
  };

  if (mask) request.mask = mask;
  if (markup) request.markup = markup;

  const requestSummary = {
    images: images.length,
    mask: Boolean(mask),
    markup: Boolean(markup),
  };

  return runImageOperation({
    operation: "edit",
    prompt: options.prompt,
    request,
    requestSummary,
    configPath: options.configPath,
    provider: options.provider,
    model: options.model,
    outDir: options.outDir,
    name: options.name,
    force: options.force,
    dryRun: options.dryRun,
    timeoutSeconds: options.timeoutSeconds,
    retries: options.retries,
    cliDefaults: options.cliDefaults,
    cwd: options.cwd,
    onRetry: options.onRetry,
  });
}
