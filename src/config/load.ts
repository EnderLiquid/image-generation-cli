import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { configError } from "../errors.js";
import {
  getApiKeyEnvName,
  resolveApiKey,
} from "./secrets.js";
import {
  parseConfig,
  type Config,
  type ModelConfig,
  type OutputDefaults,
  type ProviderConfig,
} from "./schema.js";
import {
  mergeDefaultsWithSources,
  type DefaultsLayer,
  type MergedDefaults,
} from "./merge.js";

export interface ConfigPathInfo {
  configPath: string;
  configDir: string;
  envPath: string;
}

export interface LoadedConfig {
  info: ConfigPathInfo;
  config: Config;
}

export interface ResolveConfigOptions {
  configPath?: string;
  home?: string;
}

export function resolveConfigPathInfo(
  options: ResolveConfigOptions = {},
): ConfigPathInfo {
  const homeValue = options.home ?? process.env.IMAGE_GENERATION_HOME;
  const configDir = homeValue
    ? path.resolve(homeValue)
    : path.join(os.homedir(), ".image-generation-cli");

  const configPath = options.configPath
    ? path.resolve(options.configPath)
    : path.join(configDir, "config.json");

  const resolvedConfigDir = path.dirname(configPath);

  return {
    configPath,
    configDir: resolvedConfigDir,
    envPath: path.join(resolvedConfigDir, ".env"),
  };
}

export function loadEnvFile(info: ConfigPathInfo): void {
  if (!existsSync(info.envPath)) return;

  try {
    process.loadEnvFile(info.envPath);
  } catch (error) {
    throw configError(
      `加载 .env 失败: ${info.envPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
  }
}

export interface LoadConfigOptions extends ResolveConfigOptions {
  loadEnv?: boolean;
}

export function loadConfig(options: LoadConfigOptions = {}): LoadedConfig {
  const info = resolveConfigPathInfo(options);

  if (!existsSync(info.configPath)) {
    throw configError(
      `配置文件不存在: ${info.configPath}\n先运行 image-generation init 创建配置。`,
    );
  }

  if (options.loadEnv) {
    loadEnvFile(info);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(
      readFileSync(info.configPath, "utf8").replace(/^\uFEFF/, ""),
    );
  } catch (error) {
    throw configError(
      `读取配置文件失败: ${info.configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
  }

  return {
    info,
    config: parseConfig(raw),
  };
}

export interface ProviderSelection {
  providerName: string;
  provider: ProviderConfig;
  modelName: string;
  model: ModelConfig;
}

export function getProviderAndModel(
  config: Config,
  providerName?: string,
  modelName?: string,
): ProviderSelection {
  const selectedProviderName = providerName ?? config.defaultProvider;
  const provider = config.providers[selectedProviderName];

  if (!provider) {
    throw configError(`provider 不存在: ${selectedProviderName}`);
  }

  const selectedModelName = modelName ?? provider.defaultModel;
  const model = provider.models[selectedModelName];

  if (!model) {
    throw configError(
      `provider ${selectedProviderName} 中不存在模型: ${selectedModelName}`,
    );
  }

  return {
    providerName: selectedProviderName,
    provider,
    modelName: selectedModelName,
    model,
  };
}

export interface EffectiveSelection extends ProviderSelection, MergedDefaults {}

export function resolveEffectiveDefaults(
  config: Config,
  providerName?: string,
  modelName?: string,
  cliDefaults?: OutputDefaults,
): EffectiveSelection {
  const selection = getProviderAndModel(config, providerName, modelName);

  const layers: DefaultsLayer[] = [
    { source: "global", values: config.defaults },
    { source: "provider", values: selection.provider.defaults },
    { source: "model", values: selection.model.defaults },
  ];

  if (cliDefaults) {
    layers.push({ source: "cli", values: cliDefaults });
  }

  const merged = mergeDefaultsWithSources(layers);

  return {
    ...selection,
    ...merged,
  };
}

export {
  getApiKeyEnvName,
  resolveApiKey,
};
