import { z } from "zod";
import {
  IMAGE_BACKGROUNDS,
  IMAGE_COMPLEXITIES,
  IMAGE_FORMATS,
  IMAGE_MODERATIONS,
  IMAGE_QUALITIES,
  IMAGE_RESPONSE_FORMATS,
} from "../types.js";
import type {
  ImageBackground,
  ImageComplexity,
  ImageFormat,
  ImageModeration,
  ImageQuality,
  ImageResponseFormat,
} from "../types.js";
import { configError, usageError } from "../errors.js";

const SizeSchema = z
  .string()
  .regex(/^(?:auto|\d+x\d+)$/, "size 必须为 auto 或 WIDTHxHEIGHT");

const ApiKeySchema = z
  .string()
  .min(1, "apiKey 不能为空")
  .refine(
    (value) =>
      !value.includes("${") ||
      /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value),
    "apiKey 只支持整个值使用 ${ENV_VAR} 占位符",
  );

const ApiUrlSchema = z
  .string()
  .min(1, "apiUrl 不能为空")
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "apiUrl 必须是 http 或 https URL，且不能包含 query 或 hash");

export const OutputDefaultsSchema = z.strictObject({
  n: z.number().int().min(1).max(10).nullable().optional(),
  size: SizeSchema.nullable().optional(),
  quality: z.enum(IMAGE_QUALITIES).nullable().optional(),
  background: z.enum(IMAGE_BACKGROUNDS).nullable().optional(),
  output_format: z.enum(IMAGE_FORMATS).nullable().optional(),
  output_compression: z.number().int().min(0).max(100).nullable().optional(),
  response_format: z.enum(IMAGE_RESPONSE_FORMATS).nullable().optional(),
  moderation: z.enum(IMAGE_MODERATIONS).nullable().optional(),
  complexity: z.enum(IMAGE_COMPLEXITIES).nullable().optional(),
});

export type OutputDefaults = z.infer<typeof OutputDefaultsSchema>;
export type OutputFormat = ImageFormat;
export type OutputQuality = ImageQuality;
export type OutputBackground = ImageBackground;
export type OutputModeration = ImageModeration;
export type OutputComplexity = ImageComplexity;
export type OutputResponseFormat = ImageResponseFormat;

const ModelSchema = z.strictObject({
  defaults: OutputDefaultsSchema.optional(),
});

const ProviderSchema = z.strictObject({
  apiUrl: ApiUrlSchema,
  apiKey: ApiKeySchema,
  defaultModel: z.string().min(1, "defaultModel 不能为空"),
  defaults: OutputDefaultsSchema.optional(),
  models: z
    .record(z.string().min(1), ModelSchema)
    .refine(
      (models) => Object.keys(models).length > 0,
      "models 至少需要配置一个模型",
    ),
});

export const ConfigSchema = z
  .strictObject({
    defaultProvider: z.string().min(1, "defaultProvider 不能为空"),
    defaults: OutputDefaultsSchema.optional(),
    providers: z
      .record(z.string().min(1), ProviderSchema)
      .refine(
        (providers) => Object.keys(providers).length > 0,
        "providers 至少需要配置一个 provider",
      ),
  })
  .superRefine((config, ctx) => {
    if (!Object.hasOwn(config.providers, config.defaultProvider)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultProvider"],
        message: `defaultProvider 不存在: ${config.defaultProvider}`,
      });
    }

    for (const [providerName, provider] of Object.entries(config.providers)) {
      if (!Object.hasOwn(provider.models, provider.defaultModel)) {
        ctx.addIssue({
          code: "custom",
          path: ["providers", providerName, "defaultModel"],
          message: `defaultModel 不存在: ${provider.defaultModel}`,
        });
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = Config["providers"][string];
export type ModelConfig = ProviderConfig["models"][string];

export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });

  if (error.issues.length > issues.length) {
    issues.push(`另有 ${error.issues.length - issues.length} 个错误`);
  }

  return issues.join("; ");
}

export function parseConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw configError(`配置校验失败: ${formatZodError(result.error)}`);
  }
  return result.data;
}

function checkSize(
  size: string,
  fail: (message: string) => never,
): void {
  if (size === "auto") return;

  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    fail(`size 必须为 auto 或 WIDTHxHEIGHT: ${size}`);
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (width <= 0 || height <= 0) {
    fail("size 的宽高必须为正整数");
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    fail("size 的宽高必须为 16 的倍数");
  }
  if (width > 3840 || height > 3840) {
    fail("size 的边长不能超过 3840");
  }

  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio > 3) {
    fail("size 的宽高比不能超过 3:1");
  }

  const pixels = width * height;
  if (pixels < 655_360 || pixels > 8_294_400) {
    fail("size 的总像素数必须在 655360 到 8294400 之间");
  }
}

export function assertValidSize(size: string): void {
  checkSize(size, (message) => {
    throw usageError(message);
  });
}

export function validateDefaults(
  defaults: OutputDefaults,
  source: "config" | "cli" = "config",
): void {
  const fail = (message: string): never => {
    throw source === "config" ? configError(message) : usageError(message);
  };

  if (defaults.n !== undefined && defaults.n !== null) {
    if (!Number.isInteger(defaults.n) || defaults.n < 1 || defaults.n > 10) {
      fail("n 必须是 1 到 10 的整数");
    }
  }

  if (defaults.size !== undefined && defaults.size !== null) {
    checkSize(defaults.size, fail);
  }

  if (
    defaults.output_compression !== undefined &&
    defaults.output_compression !== null
  ) {
    if (
      !Number.isInteger(defaults.output_compression) ||
      defaults.output_compression < 0 ||
      defaults.output_compression > 100
    ) {
      fail("output_compression 必须是 0 到 100 的整数");
    }
  }

  const format = defaults.output_format ?? "png";

  if (
    defaults.output_compression !== undefined &&
    defaults.output_compression !== null &&
    format !== "jpeg" &&
    format !== "webp"
  ) {
    fail("output_compression 仅支持 jpeg 或 webp");
  }

  if (
    defaults.background === "transparent" &&
    format !== "png" &&
    format !== "webp"
  ) {
    fail("background=transparent 仅支持 png 或 webp");
  }
}
