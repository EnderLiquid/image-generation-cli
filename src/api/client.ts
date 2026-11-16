import { AppError } from "../errors.js";
import type { ImageApiResponse, ImageApiResponseData } from "./types.js";

export interface RetryInfo {
  attempt: number;
  status?: number;
  waitMs: number;
  message: string;
}

export interface CallImageApiOptions {
  url: string;
  apiKey: string;
  body: unknown;
  timeoutSeconds: number;
  retries: number;
  onRetry?: (info: RetryInfo) => void;
}

export interface CallImageApiResult {
  response: ImageApiResponse;
  requestId?: string;
  elapsedMs: number;
  attempts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function apiFailure(
  message: string,
  options: {
    status?: number;
    type?: string;
    code?: string;
    requestId?: string;
    moderation?: { stage?: string; categories?: string[] };
  } = {},
): AppError {
  return new AppError({
    kind: "api",
    exitCode: 4,
    message,
    ...options,
  });
}

function parseModeration(
  value: unknown,
): { stage?: string; categories?: string[] } | undefined {
  if (!isRecord(value)) return undefined;

  const stage =
    typeof value.moderation_stage === "string"
      ? value.moderation_stage
      : undefined;

  const categories = Array.isArray(value.categories)
    ? value.categories.filter(
        (item): item is string => typeof item === "string",
      )
    : undefined;

  if (!stage && (!categories || categories.length === 0)) {
    return undefined;
  }

  return { stage, categories };
}

function parseErrorResponse(
  status: number,
  text: string,
  requestId?: string,
): AppError {
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  const errorObject =
    isRecord(json) && isRecord(json.error) ? json.error : {};

  const message =
    typeof errorObject.message === "string"
      ? errorObject.message
      : text.trim().slice(0, 500) || `HTTP ${status}`;

  const type =
    typeof errorObject.type === "string" ? errorObject.type : undefined;
  const code =
    typeof errorObject.code === "string" ? errorObject.code : undefined;

  const moderation = parseModeration(errorObject.moderation_details);
  const isAuth = status === 401 || status === 403;

  return new AppError({
    kind: isAuth ? "auth" : "api",
    exitCode: isAuth ? 3 : 4,
    message,
    status,
    type,
    code,
    requestId,
    moderation,
  });
}

function parseSuccessResponse(
  text: string,
  requestId?: string,
): ImageApiResponse {
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw apiFailure("API 返回了非 JSON 响应", { requestId });
  }

  if (!isRecord(json)) {
    throw apiFailure("API 返回了非对象响应", { requestId });
  }

  const data = json.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw apiFailure("API 响应中没有 data", { requestId });
  }

  for (const [index, item] of data.entries()) {
    if (
      !isRecord(item) ||
      typeof item.b64_json !== "string" ||
      item.b64_json.length === 0
    ) {
      throw apiFailure(
        `API 响应中第 ${index + 1} 张图片缺少 b64_json`,
        { requestId },
      );
    }
  }

  return json as ImageApiResponse;
}

function getRequestId(headers: Headers): string | undefined {
  return (
    headers.get("x-request-id") ??
    headers.get("request-id") ??
    undefined
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelay(
  retryAfter: string | null,
  attempt: number,
): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.max(0, date - Date.now());
    }
  }

  return Math.min(1000 * 2 ** (attempt - 1), 30_000);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function retryExhausted(error: AppError, attempts: number): AppError {
  return new AppError({
    kind: "retry",
    exitCode: 7,
    message: `重试 ${attempts - 1} 次后仍失败: ${error.message}`,
    status: error.status,
    type: error.type,
    code: error.code,
    requestId: error.requestId,
    moderation: error.moderation,
    cause: error,
  });
}

export function buildEndpointUrl(
  apiUrl: string,
  operation: "generate" | "edit",
): string {
  const base = apiUrl.replace(/\/+$/, "");
  const endpoint =
    operation === "generate"
      ? "/images/generations"
      : "/images/edits";

  return `${base}${endpoint}`;
}

export async function callImageApi(
  options: CallImageApiOptions,
): Promise<CallImageApiResult> {
  const started = Date.now();
  const retries = Math.max(0, Math.floor(options.retries));
  const timeoutMs = Math.max(1, options.timeoutSeconds) * 1000;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(options.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(options.body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const text = await response.text();
      const requestId = getRequestId(response.headers);

      if (!response.ok) {
        const error = parseErrorResponse(
          response.status,
          text,
          requestId,
        );

        if (isRetryableStatus(response.status)) {
          if (attempt <= retries) {
            const waitMs = retryDelay(
              response.headers.get("retry-after"),
              attempt,
            );
            options.onRetry?.({
              attempt,
              status: response.status,
              waitMs,
              message: error.message,
            });
            await sleep(waitMs);
            continue;
          }

          if (retries > 0) {
            throw retryExhausted(error, attempt);
          }
        }

        throw error;
      }

      const parsed = parseSuccessResponse(text, requestId);

      return {
        response: parsed,
        requestId,
        elapsedMs: Date.now() - started,
        attempts: attempt,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const networkError = new AppError({
        kind: "network",
        exitCode: 5,
        message: `请求失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error,
      });

      if (attempt <= retries) {
        const waitMs = retryDelay(null, attempt);
        options.onRetry?.({
          attempt,
          waitMs,
          message: networkError.message,
        });
        await sleep(waitMs);
        continue;
      }

      if (retries > 0) {
        throw retryExhausted(networkError, attempt);
      }

      throw networkError;
    }
  }
}

export function decodeImageData(response: ImageApiResponse): Buffer[] {
  const data = response.data;

  if (!Array.isArray(data) || data.length === 0) {
    throw apiFailure("API 响应中没有 data");
  }

  return data.map((item: ImageApiResponseData, index) => {
    if (typeof item.b64_json !== "string" || item.b64_json.length === 0) {
      throw apiFailure(
        `API 响应中第 ${index + 1} 张图片缺少 b64_json`,
      );
    }

    const buffer = Buffer.from(item.b64_json, "base64");
    if (buffer.length === 0) {
      throw apiFailure(
        `API 响应中第 ${index + 1} 张图片的 b64_json 无法解码`,
      );
    }

    return buffer;
  });
}
