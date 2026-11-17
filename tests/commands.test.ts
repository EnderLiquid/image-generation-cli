import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { doctorCommand } from "../src/commands/doctor.js";
import { editCommand } from "../src/commands/edit.js";
import { generateCommand } from "../src/commands/generate.js";
import { initCommand } from "../src/commands/init.js";
import { skillPathCommand } from "../src/commands/skill-path.js";
import { AppError } from "../src/errors.js";
import {
  makeApiResponse,
  makeJpegBuffer,
  makePngBuffer,
  makeTempDir,
  startMockServer,
  writeTestConfig,
} from "./helpers.js";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("generate 命令", () => {
  it("调用 API 并写出图片", async () => {
    const dir = await makeTempDir();
    const image = makePngBuffer();
    const server = await startMockServer(() => ({
      body: makeApiResponse([image]),
      headers: { "x-request-id": "req_generate" },
    }));

    try {
      const configPath = await writeTestConfig(dir, {
        apiUrl: `${server.baseUrl}/v1`,
      });
      const outDir = path.join(dir, "out");
      const result = await generateCommand({
        prompt: "一只猴子",
        configPath,
        outDir,
        cwd: dir,
        cliDefaults: {},
      });

      expect("dryRun" in result).toBe(false);
      if ("dryRun" in result) throw new Error("unexpected dry run");

      expect(result.ok).toBe(true);
      expect(result.operation).toBe("generate");
      expect(result.provider).toBe("test");
      expect(result.model).toBe("test-model");
      expect(result.requestId).toBe("req_generate");
      expect(result.files).toHaveLength(1);
      expect(path.extname(result.files[0]!.path)).toBe(".png");
      expect(path.basename(result.files[0]!.path)).toMatch(
        /^image-\d{8}-\d{6}-[0-9a-f]{4}\.png$/,
      );
      expect(await readFile(result.files[0]!.path)).toEqual(image);

      expect(server.requests[0]?.url).toBe(
        "/v1/images/generations",
      );
      expect(server.requests[0]?.body).toMatchObject({
        model: "test-model",
        prompt: "一只猴子",
        output_format: "png",
      });
    } finally {
      await server.close();
    }
  });

  it("按 n 写出多个带序号的文件", async () => {
    const dir = await makeTempDir();
    const images = [
      makePngBuffer(),
      makePngBuffer(),
      makePngBuffer(),
    ];
    const server = await startMockServer(() => ({
      body: makeApiResponse(images),
    }));

    try {
      const configPath = await writeTestConfig(dir, {
        apiUrl: `${server.baseUrl}/v1`,
      });
      const outDir = path.join(dir, "out");
      const result = await generateCommand({
        prompt: "三张图",
        configPath,
        outDir,
        cwd: dir,
        cliDefaults: { n: 3 },
      });

      if ("dryRun" in result) throw new Error("unexpected dry run");

      expect(result.files).toHaveLength(3);
      expect(result.files.map((file) => path.basename(file.path))).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/-1\.png$/),
          expect.stringMatching(/-2\.png$/),
          expect.stringMatching(/-3\.png$/),
        ]),
      );
      expect(server.requests[0]?.body).toMatchObject({ n: 3 });
    } finally {
      await server.close();
    }
  });

  it("目标文件存在时默认报错，force 可覆盖", async () => {
    const dir = await makeTempDir();
    const outDir = path.join(dir, "out");
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "cat.png"), "old");
    const server = await startMockServer(() => ({
      body: makeApiResponse([makePngBuffer()]),
    }));

    try {
      const configPath = await writeTestConfig(dir, {
        apiUrl: `${server.baseUrl}/v1`,
      });

      await expect(
        generateCommand({
          prompt: "cat",
          configPath,
          outDir,
          cwd: dir,
          name: "cat",
          cliDefaults: {},
        }),
      ).rejects.toMatchObject({
        kind: "io",
        exitCode: 6,
      });

      expect(server.requests).toHaveLength(0);

      const result = await generateCommand({
        prompt: "cat",
        configPath,
        outDir,
        cwd: dir,
        name: "cat",
        force: true,
        cliDefaults: {},
      });

      if ("dryRun" in result) throw new Error("unexpected dry run");
      expect(result.files[0]?.path).toBe(
        path.join(outDir, "cat.png"),
      );
      expect(await readFile(result.files[0]!.path)).toEqual(
        makePngBuffer(),
      );
    } finally {
      await server.close();
    }
  });

  it("dry-run 不读取密钥，也不调用 API", async () => {
    const dir = await makeTempDir();
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
      apiKey: "${MISSING_DRY_RUN_KEY}",
    });
    delete process.env.MISSING_DRY_RUN_KEY;

    const result = await generateCommand({
      prompt: "dry run",
      configPath,
      outDir: path.join(dir, "out"),
      cwd: dir,
      dryRun: true,
      cliDefaults: {},
    });

    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      operation: "generate",
    });

    if (!("dryRun" in result)) throw new Error("expected dry run");
    expect(result.output.files[0]).toMatch(/\.png$/);
  });
});

describe("edit 命令", () => {
  it("使用 JSON images 数组并写出结果", async () => {
    const dir = await makeTempDir();
    const inputPath = path.join(dir, "input.png");
    const maskPath = path.join(dir, "mask.png");
    await writeFile(inputPath, makePngBuffer());
    await writeFile(maskPath, makePngBuffer());

    const server = await startMockServer(() => ({
      body: makeApiResponse([makePngBuffer()]),
    }));

    try {
      const configPath = await writeTestConfig(dir, {
        apiUrl: `${server.baseUrl}/v1`,
      });
      const result = await editCommand({
        prompt: "改成雪山",
        images: [inputPath],
        mask: maskPath,
        configPath,
        outDir: path.join(dir, "out"),
        cwd: dir,
        cliDefaults: {},
      });

      if ("dryRun" in result) throw new Error("unexpected dry run");

      expect(result.files).toHaveLength(1);
      const body = server.requests[0]?.body as {
        images?: Array<{ image_url?: string }>;
        mask?: { image_url?: string };
        markup?: unknown;
      };
      expect(body.images).toHaveLength(1);
      expect(body.images?.[0]?.image_url).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(body.mask?.image_url).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(body.markup).toBeUndefined();
      expect(
        server.requests[0]?.headers["content-type"],
      ).toBe("application/json");
    } finally {
      await server.close();
    }
  });

  it("拒绝同时使用 mask 和 markup", async () => {
    const dir = await makeTempDir();
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
    });

    await expect(
      editCommand({
        prompt: "edit",
        images: [path.join(dir, "input.png")],
        mask: "mask.png",
        markup: "markup.png",
        configPath,
        cwd: dir,
        cliDefaults: {},
      }),
    ).rejects.toMatchObject({
      kind: "usage",
      exitCode: 2,
    });
  });

  it("按实际图片格式选择扩展名", async () => {
    const dir = await makeTempDir();
    const inputPath = path.join(dir, "input.png");
    await writeFile(inputPath, makePngBuffer());

    const server = await startMockServer(() => ({
      body: makeApiResponse([
        makeJpegBuffer(),
        makePngBuffer(),
      ]),
    }));

    try {
      const configPath = await writeTestConfig(dir, {
        apiUrl: `${server.baseUrl}/v1`,
      });
      const result = await editCommand({
        prompt: "edit",
        images: [inputPath],
        configPath,
        outDir: path.join(dir, "out"),
        cwd: dir,
        cliDefaults: { n: 2, output_format: "jpeg" },
      });

      if ("dryRun" in result) throw new Error("unexpected dry run");

      expect(
        result.files.map((file) => path.extname(file.path)),
      ).toEqual([".jpg", ".png"]);
    } finally {
      await server.close();
    }
  });
});

describe("init、doctor 与 skill", () => {
  it("初始化配置且重复执行不覆盖", async () => {
    const dir = await makeTempDir();

    const first = await initCommand({ home: dir });
    expect(first.created).toHaveLength(2);
    expect(await fileExists(first.configPath)).toBe(true);
    expect(await fileExists(first.envExamplePath)).toBe(true);

    const second = await initCommand({ home: dir });
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(2);
  });

  it("doctor 对有效配置返回 ok", async () => {
    const dir = await makeTempDir();
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
    });

    const result = await doctorCommand({ configPath });

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("doctor 对缺失配置返回失败", async () => {
    const dir = await makeTempDir();
    const result = await doctorCommand({
      configPath: path.join(dir, "missing.json"),
    });

    expect(result.ok).toBe(false);
    expect(
      result.checks.some(
        (check) => check.name === "config" && !check.ok,
      ),
    ).toBe(true);
  });

  it("输出 skill 路径", () => {
    expect(skillPathCommand()).toContain(
      path.join("skills", "image-generation"),
    );
  });
});
