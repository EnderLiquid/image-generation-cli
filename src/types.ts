export const IMAGE_FORMATS = ["png", "webp", "jpeg"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export function isImageFormat(value: unknown): value is ImageFormat {
  return (
    typeof value === "string" &&
    (IMAGE_FORMATS as readonly string[]).includes(value)
  );
}

export const IMAGE_QUALITIES = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "auto",
] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export const IMAGE_BACKGROUNDS = ["transparent", "opaque", "auto"] as const;
export type ImageBackground = (typeof IMAGE_BACKGROUNDS)[number];

export const IMAGE_MODERATIONS = ["auto", "low"] as const;
export type ImageModeration = (typeof IMAGE_MODERATIONS)[number];

export const IMAGE_COMPLEXITIES = ["low", "medium", "high"] as const;
export type ImageComplexity = (typeof IMAGE_COMPLEXITIES)[number];

export const IMAGE_RESPONSE_FORMATS = ["url", "b64_json"] as const;
export type ImageResponseFormat =
  (typeof IMAGE_RESPONSE_FORMATS)[number];

export const OUTPUT_DEFAULT_KEYS = [
  "n",
  "size",
  "quality",
  "background",
  "output_format",
  "output_compression",
  "response_format",
  "moderation",
  "complexity",
] as const;

export type OutputDefaultKey = (typeof OUTPUT_DEFAULT_KEYS)[number];
