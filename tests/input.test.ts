import { truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadImageReference,
  sanitizeRequestForDryRun,
} from "../src/input/data-url.js";
import { readImageInfo } from "../src/input/image-info.js";
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

  it("读取图片尺寸、方向和透明通道", async () => {
    expect(
      await readImageInfo(
        await makePngBuffer({ width: 4, height: 6 }),
        "png",
      ),
    ).toEqual({ width: 4, height: 6, hasAlpha: true });

    expect(
      await readImageInfo(
        await makePngBuffer({
          width: 4,
          height: 6,
          alpha: false,
        }),
        "png",
      ),
    ).toEqual({ width: 4, height: 6, hasAlpha: false });

    expect(
      await readImageInfo(
        await makePngBuffer({
          width: 4,
          height: 6,
          palette: true,
        }),
        "png",
      ),
    ).toEqual({ width: 4, height: 6, hasAlpha: true });

    expect(
      await readImageInfo(
        await makeJpegBuffer({ width: 320, height: 240 }),
        "jpeg",
      ),
    ).toEqual({ width: 320, height: 240, hasAlpha: false });

    expect(
      await readImageInfo(
        await makeJpegBuffer({
          width: 4,
          height: 6,
          orientation: 6,
        }),
        "jpeg",
      ),
    ).toEqual({ width: 6, height: 4, hasAlpha: false });

    expect(
      await readImageInfo(
        await makeWebpBuffer({ width: 320, height: 240 }),
        "webp",
      ),
    ).toEqual({ width: 320, height: 240, hasAlpha: true });

    expect(
      await readImageInfo(
        await makeWebpBuffer({
          width: 4,
          height: 6,
          orientation: 6,
        }),
        "webp",
      ),
    ).toEqual({ width: 6, height: 4, hasAlpha: true });

    expect(
      await readImageInfo(
        await makeWebpBuffer({
          width: 320,
          height: 240,
          lossless: true,
        }),
        "webp",
      ),
    ).toEqual({ width: 320, height: 240, hasAlpha: true });
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

  it("保留 HTTPS URL 作为 image_url", async () => {
    const url = "https://example.com/image.png";

    const reference = await loadImageReference(url);

    expect(reference.input).toEqual({ image_url: url });
    expect(reference.rawBytes).toBe(0);
  });

  it("单张本地图片超过上限时报错", async () => {
    const dir = await makeTempDir();
    const inputPath = path.join(dir, "oversized.png");
    await writeFile(inputPath, makePngBuffer());
    await truncate(inputPath, 16 * 1024 * 1024);

    await expect(loadImageReference(inputPath)).rejects.toMatchObject({
      kind: "usage",
      exitCode: 2,
    });
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

  it("mask 要求透明像素", async () => {
    const dir = await makeTempDir();
    const inputPath = path.join(dir, "mask.png");
    const mask = await makePngBuffer({ alpha: false });
    await writeFile(inputPath, mask);

    await expect(
      loadImageReference(inputPath, {
        requirePng: true,
        requireAlpha: true,
        label: "mask",
      }),
    ).rejects.toMatchObject({
      kind: "usage",
      exitCode: 2,
    });
  });

  it("mask 接受调色板 tRNS PNG", async () => {
    const dir = await makeTempDir();
    const inputPath = path.join(dir, "mask.png");
    const mask = await makePngBuffer({
      width: 2,
      height: 3,
      palette: true,
    });
    await writeFile(inputPath, mask);

    const reference = await loadImageReference(inputPath, {
      requirePng: true,
      requireAlpha: true,
      label: "mask",
    });

    expect(reference.info).toEqual({
      width: 2,
      height: 3,
      hasAlpha: true,
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
