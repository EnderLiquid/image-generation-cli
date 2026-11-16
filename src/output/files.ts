import { randomBytes } from "node:crypto";
import {
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { ImageFormat } from "../types.js";
import { ioError, isAppError, usageError } from "../errors.js";
import { extensionForFormat } from "../input/mime.js";

export interface NamingSeed {
  now: Date;
  random: string;
}

export interface OutputFile {
  path: string;
  bytes: number;
  format: ImageFormat;
}

export interface CreateOutputPathsOptions {
  outDir: string;
  name?: string;
  formats: ImageFormat[];
  seed: NamingSeed;
}

const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp)$/i;
const RESERVED_WINDOWS_NAMES =
  /^(?:CON|PRN|AUX|NUL|CLOCK\$|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export function createNamingSeed(): NamingSeed {
  return {
    now: new Date(),
    random: randomBytes(2).toString("hex"),
  };
}

export function formatLocalTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("") +
    "-" +
    [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("");
}

export function sanitizeBaseName(name: string): string {
  let base = name.trim().replace(IMAGE_EXTENSION, "");

  if (!base) {
    throw usageError("--name 不能为空");
  }

  if (/[<>:"/\\|?*\u0000-\u001F]/.test(base)) {
    throw usageError("--name 不能包含路径分隔符或 Windows 保留字符");
  }

  if (base === "." || base === "..") {
    throw usageError("--name 不能为 . 或 ..");
  }

  if (base.endsWith(".") || base.endsWith(" ")) {
    throw usageError("--name 不能以点或空格结尾");
  }

  if (RESERVED_WINDOWS_NAMES.test(base)) {
    throw usageError(`--name 是 Windows 保留文件名: ${base}`);
  }

  return base;
}

export function createOutputPaths(
  options: CreateOutputPathsOptions,
): string[] {
  if (options.formats.length === 0) {
    throw usageError("输出格式不能为空");
  }

  const outDir = path.resolve(options.outDir);
  const base = options.name
    ? sanitizeBaseName(options.name)
    : `image-${formatLocalTimestamp(options.seed.now)}-${options.seed.random}`;

  return options.formats.map((format, index) => {
    const suffix = options.formats.length > 1 ? `-${index + 1}` : "";
    return path.join(
      outDir,
      `${base}${suffix}.${extensionForFormat(format)}`,
    );
  });
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function assertPathsAvailable(
  paths: string[],
  force: boolean,
): Promise<void> {
  for (const target of paths) {
    try {
      const targetStat = await stat(target);

      if (targetStat.isDirectory()) {
        throw ioError(`输出路径是目录: ${target}`);
      }

      if (!force) {
        throw ioError(
          `输出文件已存在: ${target}。使用 --force 覆盖。`,
        );
      }
    } catch (error) {
      if (isAppError(error)) throw error;
      if (isEnoent(error)) continue;

      throw ioError(
        `检查输出路径失败: ${target}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        6,
        error,
      );
    }
  }
}

export interface WriteImageOptions {
  force: boolean;
  onSaved?: (file: OutputFile) => void;
}

export interface ImageWriteItem {
  path: string;
  data: Buffer;
  format: ImageFormat;
}

export async function writeImageFiles(
  items: ImageWriteItem[],
  options: WriteImageOptions,
): Promise<OutputFile[]> {
  const written: OutputFile[] = [];

  for (const item of items) {
    const target = item.path;
    const targetDir = path.dirname(target);
    const temp = `${target}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;

    try {
      await mkdir(targetDir, { recursive: true });
      await writeFile(temp, item.data, { flag: "wx" });

      if (!options.force) {
        try {
          await stat(target);
          throw ioError(
            `输出文件已存在: ${target}。使用 --force 覆盖。`,
          );
        } catch (error) {
          if (isAppError(error)) throw error;
          if (!isEnoent(error)) {
            throw ioError(
              `检查输出路径失败: ${target}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              6,
              error,
            );
          }
        }
      }

      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);

      if (isAppError(error)) throw error;

      throw ioError(
        `写入文件失败: ${target}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        6,
        error,
      );
    }

    const file: OutputFile = {
      path: target,
      bytes: item.data.length,
      format: item.format,
    };

    written.push(file);
    options.onSaved?.(file);
  }

  return written;
}
