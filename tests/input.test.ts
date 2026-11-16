import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadImageReference,
  sanitizeRequestForDryRun,
} from "../src/input/data-url.js";
import { detectImageFormat } from "../src/input/mime.js";
import {
  makeJpegBuffer,
  makePngBuffer,
  makeTempDir,
  makeWebpBuffer,
} from "./helpers.js";

describe("输入图片", () => {
  it("识别 png、jpeg、webp", () => {
    expect(detectImageFormat(makePngBuffer())).toBe("png");
    expect(detectImageFormat(makeJpegBuffer())).toBe("jpeg");
    expect(detectImageFormat(makeWebpBuffer())).toBe("webp");
  });

  it("把本地图片编码为 data URL", async () => {
    const dir = await makeTempDir();
    const inputPath = path.join(dir, "input.png");
    await writeFile(inputPath, makePngBuffer());

    const reference = await loadImageReference(inputPath);

    expect(reference.input.image_url).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(reference.rawBytes).toBe(makePngBuffer().length);
  });

  it("mask 要求 PNG", async () => {
    const dir = await makeTempDir();
    const inputPath = path.join(dir, "input.jpg");
    await writeFile(inputPath, makeJpegBuffer());

    await expect(
      loadImageReference(inputPath, { requirePng: true }),
    ).rejects.toMatchObject({
      kind: "usage",
      exitCode: 2,
    });
  });

  it("dry-run 只脱敏图片字段", () => {
    const request = {
      model: "test-model",
      prompt: "data: 这不是图片",
      images: [
        {
          image_url: "data:image/png;base64,AAAA",
        },
      ],
      mask: {
        image_url: "data:image/png;base64,BBBB",
      },
    };

    const sanitized = sanitizeRequestForDryRun(request) as {
      prompt: string;
      images: Array<{ image_url: string }>;
      mask: { image_url: string };
    };

    expect(sanitized.prompt).toBe("data: 这不是图片");
    expect(sanitized.images[0]?.image_url).toContain("[data-url");
    expect(sanitized.mask.image_url).toContain("[data-url");
  });
});
