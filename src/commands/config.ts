import {
  loadConfig,
  resolveEffectiveDefaults,
} from "../config/load.js";
import { redactConfig } from "../config/redact.js";
import { validateDefaults } from "../config/schema.js";
import { usageError } from "../errors.js";

export interface ConfigCommandOptions {
  configPath?: string;
  effective?: boolean;
  provider?: string;
  model?: string;
}

export function configCommand(
  options: ConfigCommandOptions,
): unknown {
  if (!options.effective && (options.provider || options.model)) {
    throw usageError("--provider 和 --model 仅与 --effective 一起使用");
  }

  const { info, config } = loadConfig({
    configPath: options.configPath,
    loadEnv: false,
  });

  if (!options.effective) {
    return {
      configPath: info.configPath,
      config: redactConfig(config),
    };
  }

  const selection = resolveEffectiveDefaults(
    config,
    options.provider,
    options.model,
  );

  validateDefaults(selection.values);

  return {
    configPath: info.configPath,
    provider: selection.providerName,
    model: selection.modelName,
    defaults: selection.values,
    sources: selection.sources,
  };
}
