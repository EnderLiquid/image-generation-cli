import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import { resolveConfigPathInfo } from "../config/load.js";
import { ioError } from "../errors.js";
import { getExamplesPath } from "../paths.js";

export interface InitOptions {
  configPath?: string;
  home?: string;
}

export interface InitResult {
  ok: true;
  configPath: string;
  envExamplePath: string;
  created: string[];
  skipped: string[];
}

function isEexist(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

async function copyIfMissing(
  source: string,
  target: string,
  mode: number,
): Promise<"created" | "skipped"> {
  try {
    await copyFile(source, target, constants.COPYFILE_EXCL);

    if (process.platform !== "win32") {
      await chmod(target, mode).catch(() => undefined);
    }

    return "created";
  } catch (error) {
    if (isEexist(error)) {
      return "skipped";
    }

    throw ioError(
      `创建文件失败: ${target}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      6,
      error,
    );
  }
}

export async function initCommand(
  options: InitOptions = {},
): Promise<InitResult> {
  const info = resolveConfigPathInfo(options);
  const examplesDir = getExamplesPath();

  try {
    await mkdir(info.configDir, {
      recursive: true,
      mode: 0o700,
    });
  } catch (error) {
    throw ioError(
      `创建配置目录失败: ${info.configDir}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      6,
      error,
    );
  }

  if (process.platform !== "win32") {
    await chmod(info.configDir, 0o700).catch(() => undefined);
  }

  const configTemplate = path.join(
    examplesDir,
    "config.example.json",
  );
  const envTemplate = path.join(examplesDir, "env.example");
  const envExamplePath = path.join(
    info.configDir,
    ".env.example",
  );

  const created: string[] = [];
  const skipped: string[] = [];

  const configStatus = await copyIfMissing(
    configTemplate,
    info.configPath,
    0o600,
  );

  if (configStatus === "created") {
    created.push(info.configPath);
  } else {
    skipped.push(info.configPath);
  }

  const envStatus = await copyIfMissing(
    envTemplate,
    envExamplePath,
    0o600,
  );

  if (envStatus === "created") {
    created.push(envExamplePath);
  } else {
    skipped.push(envExamplePath);
  }

  return {
    ok: true,
    configPath: info.configPath,
    envExamplePath,
    created,
    skipped,
  };
}
