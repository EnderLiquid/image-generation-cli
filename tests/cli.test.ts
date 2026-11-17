import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  makeApiResponse,
  makePngBuffer,
  makeTempDir,
  startMockServer,
  writeTestConfig,
} from "./helpers.js";

const cliPath = fileURLToPath(
  new URL("../src/cli.ts", import.meta.url),
);

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", cliPath, ...args],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function parseError(stderr: string): {
  ok: boolean;
  error: { kind: string; message: string };
} {
  return JSON.parse(stderr) as {
    ok: boolean;
    error: { kind: string; message: string };
  };
}

describe("CLI 入口", () => {
  it("--version 输出版本", async () => {
    const result = await runCli(["--version"]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
  });

  it("--help 输出命令列表", async () => {
    const result = await runCli(["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("generate");
    expect(result.stdout).toContain("edit");
    expect(result.stdout).toContain("config");
  });

  it("edit --help 说明 mask 和 markup 约束", async () => {
    const result = await runCli(["edit", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--mask");
    expect(result.stdout).toContain("--markup");
    expect(result.stdout).toContain("PNG");
    expect(result.stdout).toContain("第一张图");
    expect(result.stdout).toContain("互斥");
  });

  it("未知命令输出 JSON 错误", async () => {
    const result = await runCli(["unknown-command"]);

    expect(result.code).toBe(2);
    const error = parseError(result.stderr);
    expect(error.ok).toBe(false);
    expect(error.error.kind).toBe("usage");
  });

  it("缺少提示词输出 JSON 错误", async () => {
    const dir = await makeTempDir();
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
    });
    const result = await runCli([
      "generate",
      "--config",
      configPath,
    ]);

    expect(result.code).toBe(2);
    const error = parseError(result.stderr);
    expect(error.error.message).toMatch(/提示词/);
  });

  it("edit 拒绝 Files API file_id", async () => {
    const result = await runCli([
      "edit",
      "--image",
      "file-abc123",
      "--prompt",
      "edit",
    ]);

    expect(result.code).toBe(2);
    const error = parseError(result.stderr);
    expect(error.error.kind).toBe("usage");
    expect(error.error.message).toContain(
      "不支持 Files API file_id",
    );
  });

  it("config 输出脱敏配置", async () => {
    const dir = await makeTempDir();
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
      apiKey: "cli-secret",
    });
    const result = await runCli([
      "config",
      "--config",
      configPath,
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("[REDACTED]");
    expect(result.stdout).not.toContain("cli-secret");
  });

  it("generate --dry-run 不调用 API", async () => {
    const dir = await makeTempDir();
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
      apiKey: "${MISSING_CLI_DRY_RUN_KEY}",
    });

    const result = await runCli([
      "generate",
      "--config",
      configPath,
      "--prompt",
      "dry run",
      "--out-dir",
      path.join(dir, "out"),
      "--dry-run",
    ]);

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout) as {
      ok: boolean;
      dryRun: boolean;
    };
    expect(output.ok).toBe(true);
    expect(output.dryRun).toBe(true);
  });

  it("doctor 对缺失配置返回退出码 2", async () => {
    const dir = await makeTempDir();
    const result = await runCli([
      "doctor",
      "--config",
      path.join(dir, "missing.json"),
    ]);

    expect(result.code).toBe(2);
    const output = JSON.parse(result.stdout) as {
      ok: boolean;
    };
    expect(output.ok).toBe(false);
  });

  it("generate 完整流程输出 saved 路径", async () => {
    const dir = await makeTempDir();
    const image = makePngBuffer();
    const server = await startMockServer(() => ({
      body: makeApiResponse([image]),
    }));

    try {
      const configPath = await writeTestConfig(dir, {
        apiUrl: `${server.baseUrl}/v1`,
      });
      const outDir = path.join(dir, "out");
      const result = await runCli([
        "generate",
        "--config",
        configPath,
        "--prompt",
        "hello",
        "--out-dir",
        outDir,
      ]);

      expect(result.code).toBe(0);
      const output = JSON.parse(result.stdout) as {
        files: Array<{ path: string }>;
      };
      expect(output.files[0]?.path).toContain(outDir);
      expect(result.stderr).toContain("saved: ");
      expect(await readFile(output.files[0]!.path)).toEqual(image);
    } finally {
      await server.close();
    }
  });
});
