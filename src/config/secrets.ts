import { configError } from "../errors.js";

const ENV_PLACEHOLDER = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

export function getApiKeyEnvName(raw: string): string | undefined {
  return ENV_PLACEHOLDER.exec(raw)?.[1];
}

export function resolveApiKey(raw: string): string {
  const envName = getApiKeyEnvName(raw);

  if (!envName) {
    return raw;
  }

  const value = process.env[envName];
  if (!value) {
    throw configError(`环境变量 ${envName} 未设置`);
  }

  return value;
}
