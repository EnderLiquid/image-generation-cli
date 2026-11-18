import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  callImageApi,
  buildEndpointUrl,
  decodeImageOutputs,
  type RetryInfo,
} from "../api/client.js";
import type {
  ImageEditRequest,
  ImageGenerationRequest,
} from "../api/types.js";
import {
  loadConfig,
  resolveApiKey,
  resolveEffectiveDefaults,
} from "../config/load.js";
import {
  validateDefaults,
  type OutputDefaults,
} from "../config/schema.js";
import {
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_SECONDS,
} from "../defaults.js";
import { usageError } from "../errors.js";
import { sanitizeRequestForDryRun } from "../input/data-url.js";
import { detectImageFormat } from "../input/mime.js";
import {
  assertPathsAvailable,
  createNamingSeed,
  createOutputPaths,
  writeOutputFiles,
  type OutputExtension,
} from "../output/files.js";
import type {
  CommandResult,
  SuccessResult,
} from "../output/result.js";
import {
  isImageFormat,
  OUTPUT_DEFAULT_KEYS,
} from "../types.js";

export interface OperationOptions {
  operation: "generate" | "edit";
  prompt: string;
  request: ImageGenerationRequest | ImageEditRequest;
  requestSummary: Record<string, unknown>;
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

export async function runImageOperation(
  options: OperationOptions,
): Promise<CommandResult> {
  if (!options.prompt) {
    throw usageError("提示词不能为空");
  }

  if (options.prompt.length > 32_000) {
    throw usageError("提示词不能超过 32000 字符");
  }

  const loaded = loadConfig({
    configPath: options.configPath,
    loadEnv: !options.dryRun,
  });

  const selection = resolveEffectiveDefaults(
    loaded.config,
    options.provider,
    options.model,
    options.cliDefaults,
  );

  validateDefaults(selection.values);

  const { providerName, modelName, provider, values } = selection;
  const request: Record<string, unknown> = {
    ...options.request,
    model: modelName,
    prompt: options.prompt,
  };

  for (const key of OUTPUT_DEFAULT_KEYS) {
    const value = values[key];
    if (value !== undefined) {
      request[key] = value;
    }
  }

  const plannedCount = values.n ?? 1;
  const plannedFormat = values.output_format ?? "png";
  const outDir = path.resolve(
    options.cwd ?? process.cwd(),
    options.outDir ?? "generated",
  );
  const seed = createNamingSeed();
  const plannedExtensions: OutputExtension[] = Array.from(
    { length: plannedCount },
    () => plannedFormat,
  );

  const plannedPaths = createOutputPaths({
    outDir,
    name: options.name,
    extensions: plannedExtensions,
    seed,
  });

  const requestSummary: Record<string, unknown> = {
    ...options.requestSummary,
  };

  for (const key of OUTPUT_DEFAULT_KEYS) {
    const value = values[key];
    if (value !== undefined) {
      requestSummary[key] = value;
    }
  }

  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      operation: options.operation,
      provider: providerName,
      model: modelName,
      url: buildEndpointUrl(provider.apiUrl, options.operation),
      request: sanitizeRequestForDryRun(request),
      output: {
        dir: outDir,
        files: plannedPaths,
      },
    };
  }

  const apiKey = resolveApiKey(provider.apiKey);
  const force = options.force ?? false;

  await mkdir(outDir, { recursive: true });
  await assertPathsAvailable(plannedPaths, force);

  const call = await callImageApi({
    url: buildEndpointUrl(provider.apiUrl, options.operation),
    apiKey,
    body: request,
    timeoutSeconds: options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    retries: options.retries ?? DEFAULT_RETRIES,
    onRetry: options.onRetry,
  });

  const fallbackFormat = isImageFormat(call.response.output_format)
    ? call.response.output_format
    : plannedFormat;
  const decoded = decodeImageOutputs(call.response).map((output) => {
    if (output.kind === "image") {
      const format = detectImageFormat(output.data) ?? fallbackFormat;
      return {
        kind: "image" as const,
        data: output.data,
        format,
        extension: format,
      };
    }

    return {
      kind: "url" as const,
      data: Buffer.from(`${output.url}\n`, "utf8"),
      extension: "txt" as const,
    };
  });

  const actualPaths = createOutputPaths({
    outDir,
    name: options.name,
    extensions: decoded.map((output) => output.extension),
    seed,
  });

  await assertPathsAvailable(actualPaths, force);

  const files = await writeOutputFiles(
    decoded.map((output, index) => {
      if (output.kind === "image") {
        return {
          kind: "image" as const,
          path: actualPaths[index]!,
          data: output.data,
          format: output.format,
        };
      }

      return {
        kind: "url" as const,
        path: actualPaths[index]!,
        data: output.data,
      };
    }),
    { force },
  );

  const result: SuccessResult = {
    ok: true,
    operation: options.operation,
    provider: providerName,
    model: modelName,
    files,
    request: requestSummary,
    created: call.response.created,
    requestId: call.requestId,
    usage: call.response.usage,
    svg_usage: call.response.svg_usage,
    elapsedMs: call.elapsedMs,
  };

  return result;
}
