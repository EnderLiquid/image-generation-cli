import type { AppError } from "../errors.js";
import type { OutputFile } from "./files.js";

export interface SuccessResult {
  ok: true;
  operation: "generate" | "edit";
  provider: string;
  model: string;
  files: OutputFile[];
  request: Record<string, unknown>;
  created?: number;
  requestId?: string;
  usage?: Record<string, unknown>;
  svg_usage?: Record<string, unknown>;
  elapsedMs: number;
}

export interface DryRunResult {
  ok: true;
  dryRun: true;
  operation: "generate" | "edit";
  provider: string;
  model: string;
  url: string;
  request: unknown;
  output: {
    dir: string;
    files: string[];
  };
}

export type CommandResult = SuccessResult | DryRunResult;

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeError(error: AppError): void {
  process.stderr.write(`${JSON.stringify(error.toJSON(), null, 2)}\n`);
}
