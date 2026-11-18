#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Command,
  CommanderError,
  InvalidArgumentError,
} from "commander";
import { configCommand } from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";
import { editCommand } from "./commands/edit.js";
import { generateCommand } from "./commands/generate.js";
import { initCommand } from "./commands/init.js";
import { skillPathCommand } from "./commands/skill-path.js";
import {
  formatZodError,
  OutputDefaultsSchema,
  type OutputDefaults,
} from "./config/schema.js";
import {
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_SECONDS,
} from "./defaults.js";
import {
  AppError,
  ioError,
  isAppError,
  usageError,
} from "./errors.js";
import type { RetryInfo } from "./api/client.js";
import { writeError, writeJson, type CommandResult } from "./output/result.js";
import { VERSION } from "./version.js";

function parseInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new InvalidArgumentError("必须是整数");
  }

  return parsed;
}

function parsePositiveInteger(value: string): number {
  const parsed = parseInteger(value);

  if (parsed < 1) {
    throw new InvalidArgumentError("必须是正整数");
  }

  return parsed;
}

function parseNonNegativeInteger(value: string): number {
  const parsed = parseInteger(value);

  if (parsed < 0) {
    throw new InvalidArgumentError("不能为负数");
  }

  return parsed;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(
      typeof chunk === "string"
        ? Buffer.from(chunk)
        : Buffer.from(chunk),
    );
  }

  return Buffer.concat(chunks).toString("utf8");
}

function buildCliDefaults(
  options: Record<string, unknown>,
): OutputDefaults {
  const raw: Record<string, unknown> = {};

  const mapping: Array<[keyof OutputDefaults, unknown]> = [
    ["n", options.n],
    ["size", options.size],
    ["quality", options.quality],
    ["background", options.background],
    ["output_format", options.outputFormat],
    ["output_compression", options.outputCompression],
    ["moderation", options.moderation],
    ["complexity", options.complexity],
  ];

  for (const [key, value] of mapping) {
    if (value !== undefined) {
      raw[key] = value;
    }
  }

  const parsed = OutputDefaultsSchema.safeParse(raw);
  if (!parsed.success) {
    throw usageError(formatZodError(parsed.error));
  }

  return parsed.data;
}

async function resolvePrompt(options: {
  prompt?: string;
  promptFile?: string;
}): Promise<string> {
  const hasPrompt = options.prompt !== undefined;
  const hasPromptFile = options.promptFile !== undefined;

  if (hasPrompt === hasPromptFile) {
    throw usageError(
      "必须且只能提供一种提示词来源：--prompt 或 --prompt-file",
    );
  }

  let text: string;

  try {
    if (hasPrompt) {
      text =
        options.prompt === "-"
          ? await readStdin()
          : options.prompt!;
    } else {
      const promptPath = path.resolve(options.promptFile!);
      text = await readFile(promptPath, "utf8");
    }
  } catch (error) {
    throw ioError(
      `读取提示词失败: ${
        error instanceof Error ? error.message : String(error)
      }`,
      6,
      error,
    );
  }

  text = text.replace(/^\uFEFF/, "").trim();

  if (!text) {
    throw usageError("提示词不能为空");
  }

  if (text.length > 32_000) {
    throw usageError("提示词不能超过 32000 字符");
  }

  return text;
}

function printRetry(info: RetryInfo): void {
  const status =
    info.status === undefined ? "" : ` (HTTP ${info.status})`;
  process.stderr.write(
    `retry: attempt ${info.attempt} failed${status}; waiting ${info.waitMs}ms\n`,
  );
}

function printResult(result: CommandResult): void {
  writeJson(result);
}

const program = new Command();

program
  .name("image-generation")
  .description(
    "通过 OpenAI Image API 兼容端点生成和编辑图片",
  )
  .version(VERSION, "-V, --version", "输出版本")
  .exitOverride()
  .configureOutput({
    writeErr: () => undefined,
  })
  .helpOption("-h, --help", "显示帮助");

program.addHelpText(
  "after",
  `
示例:
  image-generation generate --prompt "一只在雪地里的猴子"
  image-generation generate --prompt-file prompt.txt --n 2
  image-generation edit --prompt "把背景换成雪山" --image ./input.png
  image-generation config --effective
  image-generation doctor
`,
);

program
  .command("generate")
  .description("根据提示词生成图片")
  .option("--prompt <text>", "提示词；使用 - 从 stdin 读取")
  .option("--prompt-file <path>", "从文件读取提示词")
  .option("--provider <name>", "provider 名称")
  .option("--model <name>", "模型 ID")
  .option("--out-dir <dir>", "输出目录，默认 ./generated")
  .option("--name <base>", "文件名前缀")
  .option("--force", "覆盖已存在的输出文件")
  .option("--n <number>", "生成张数，1 到 10", parseInteger)
  .option("--size <size>", "图片尺寸，如 1024x1024 或 auto")
  .option("--quality <quality>", "low/medium/high/xhigh/max/auto")
  .option("--background <background>", "transparent/opaque/auto")
  .option("--output-format <format>", "png/webp/jpeg")
  .option(
    "--output-compression <number>",
    "压缩质量，0 到 100",
    parseInteger,
  )
  .option("--moderation <level>", "auto/low")
  .option("--complexity <level>", "low/medium/high")
  .option(
    "--timeout <seconds>",
    "请求超时秒数",
    parsePositiveInteger,
    DEFAULT_TIMEOUT_SECONDS,
  )
  .option(
    "--retries <count>",
    "可重试错误次数，默认 0",
    parseNonNegativeInteger,
    DEFAULT_RETRIES,
  )
  .option("--dry-run", "只输出请求，不调用 API")
  .option("--config <path>", "配置文件路径")
  .action(async (options) => {
    const prompt = await resolvePrompt(options);
    const result = await generateCommand({
      prompt,
      configPath: options.config,
      provider: options.provider,
      model: options.model,
      outDir: options.outDir,
      name: options.name,
      force: options.force,
      dryRun: options.dryRun,
      timeoutSeconds: options.timeout,
      retries: options.retries,
      cliDefaults: buildCliDefaults(options),
      onRetry: printRetry,
    });

    printResult(result);
  });

program
  .command("edit")
  .description("根据提示词和输入图片编辑图片")
  .option("--prompt <text>", "提示词；使用 - 从 stdin 读取")
  .option("--prompt-file <path>", "从文件读取提示词")
  .option(
    "--image <value>",
    "输入图片，可重复 1 到 16 次；支持本地路径和 HTTPS URL",
    collect,
    [],
  )
  .option(
    "--mask <value>",
    "PNG mask，透明区域表示要编辑的地方；仅作用于第一张图，与 --markup 互斥",
  )
  .option(
    "--markup <value>",
    "PNG 标注层，必须保留透明像素；仅作用于第一张图，与 --mask 互斥",
  )
  .option("--provider <name>", "provider 名称")
  .option("--model <name>", "模型 ID")
  .option("--out-dir <dir>", "输出目录，默认 ./generated")
  .option("--name <base>", "文件名前缀")
  .option("--force", "覆盖已存在的输出文件")
  .option("--n <number>", "生成张数，1 到 10", parseInteger)
  .option("--size <size>", "图片尺寸，如 1024x1024 或 auto")
  .option("--quality <quality>", "low/medium/high/xhigh/max/auto")
  .option("--background <background>", "transparent/opaque/auto")
  .option("--output-format <format>", "png/webp/jpeg")
  .option(
    "--output-compression <number>",
    "压缩质量，0 到 100",
    parseInteger,
  )
  .option("--moderation <level>", "auto/low")
  .option("--complexity <level>", "low/medium/high")
  .option(
    "--timeout <seconds>",
    "请求超时秒数",
    parsePositiveInteger,
    DEFAULT_TIMEOUT_SECONDS,
  )
  .option(
    "--retries <count>",
    "可重试错误次数，默认 0",
    parseNonNegativeInteger,
    DEFAULT_RETRIES,
  )
  .option("--dry-run", "只输出请求，不调用 API")
  .option("--config <path>", "配置文件路径")
  .action(async (options) => {
    const prompt = await resolvePrompt(options);
    const result = await editCommand({
      prompt,
      images: options.image,
      mask: options.mask,
      markup: options.markup,
      configPath: options.config,
      provider: options.provider,
      model: options.model,
      outDir: options.outDir,
      name: options.name,
      force: options.force,
      dryRun: options.dryRun,
      timeoutSeconds: options.timeout,
      retries: options.retries,
      cliDefaults: buildCliDefaults(options),
      onRetry: printRetry,
    });

    printResult(result);
  });

program
  .command("config")
  .description("输出脱敏后的配置")
  .option("--effective", "输出合并后的默认值及来源")
  .option("--provider <name>", "provider 名称")
  .option("--model <name>", "模型 ID")
  .option("--config <path>", "配置文件路径")
  .action((options) => {
    writeJson(
      configCommand({
        configPath: options.config,
        effective: options.effective,
        provider: options.provider,
        model: options.model,
      }),
    );
  });

program
  .command("init")
  .description("初始化配置目录和示例文件")
  .option("--config <path>", "配置文件路径")
  .action(async (options) => {
    const result = await initCommand({
      configPath: options.config,
    });
    writeJson(result);
  });

program
  .command("doctor")
  .description("检查配置、密钥和路径")
  .option("--config <path>", "配置文件路径")
  .action(async (options) => {
    const result = await doctorCommand({
      configPath: options.config,
    });
    writeJson(result);

    if (!result.ok) {
      process.exitCode = 2;
    }
  });

const skillCommand = program
  .command("skill")
  .description("skill 辅助命令");

skillCommand
  .command("path")
  .description("输出打包内 skill 目录的绝对路径")
  .action(() => {
    process.stdout.write(`${skillPathCommand()}\n`);
  });

program.helpCommand("help [command]", "显示命令帮助");

function configureCommand(command: Command): void {
  command.exitOverride();
  command.configureOutput({
    writeErr: () => undefined,
  });

  for (const child of command.commands) {
    configureCommand(child);
  }
}

configureCommand(program);

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return;

      const appError = new AppError({
        kind: "usage",
        message: error.message,
        exitCode: 2,
      });
      writeError(appError);
      process.exitCode = 2;
      return;
    }

    if (isAppError(error)) {
      writeError(error);
      process.exitCode = error.exitCode;
      return;
    }

    const appError = new AppError({
      kind: "internal",
      message:
        error instanceof Error ? error.message : String(error),
      exitCode: 1,
      cause: error,
    });
    writeError(appError);
    process.exitCode = 1;
  }
}

void main();
