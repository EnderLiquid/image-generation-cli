import type { ImageGenerationRequest } from "../api/types.js";
import type { RetryInfo } from "../api/client.js";
import type { OutputDefaults } from "../config/schema.js";
import type { CommandResult } from "../output/result.js";
import { runImageOperation } from "./common.js";

export interface GenerateCommandOptions {
  prompt: string;
  configPath?: string;
  provider?: string;
  model?: string;
  outDir?: string;
  name?: string;
  force?: boolean;
  dryRun?: boolean;
  timeoutSeconds?: number;
  retries?: number;
  cliDefaults?: OutputDefaults;
  cwd?: string;
  onRetry?: (info: RetryInfo) => void;
}

export async function generateCommand(
  options: GenerateCommandOptions,
): Promise<CommandResult> {
  const request: ImageGenerationRequest = {
    model: "",
    prompt: "",
  };

  return runImageOperation({
    operation: "generate",
    prompt: options.prompt,
    request,
    requestSummary: {},
    configPath: options.configPath,
    provider: options.provider,
    model: options.model,
    outDir: options.outDir,
    name: options.name,
    force: options.force,
    dryRun: options.dryRun,
    timeoutSeconds: options.timeoutSeconds,
    retries: options.retries,
    cliDefaults: options.cliDefaults,
    cwd: options.cwd,
    onRetry: options.onRetry,
  });
}
