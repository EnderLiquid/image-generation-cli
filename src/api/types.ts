import type {
  ImageBackground,
  ImageComplexity,
  ImageFormat,
  ImageModeration,
  ImageQuality,
} from "../types.js";

export interface ImageInput {
  image_url: string;
}

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: ImageQuality;
  background?: ImageBackground;
  output_format?: ImageFormat;
  output_compression?: number;
  moderation?: ImageModeration;
  complexity?: ImageComplexity;
}

export interface ImageEditRequest extends ImageGenerationRequest {
  images: ImageInput[];
  mask?: ImageInput;
  markup?: ImageInput;
}

export type ImageRequest = ImageGenerationRequest | ImageEditRequest;

export interface ImageApiResponseData {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

export interface ImageApiResponse {
  created?: number;
  data?: ImageApiResponseData[];
  usage?: Record<string, unknown>;
  svg_usage?: Record<string, unknown>;
  background?: string;
  output_format?: string;
  quality?: string;
  size?: string;
}
