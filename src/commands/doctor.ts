import { existsSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import {
  getApiKeyEnvName,
  getProviderAndModel,
  loadConfig,
  resolveConfigPathInfo,
  resolveEffectiveDefaults,
} from "../config/load.js";
import { validateDefaults } from "../config/schema.js";
import { getSkillPath } from "../paths.js";
import { VERSION } from "../version.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorResult {
  ok: boolean;
  configPath: string;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  configPath?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function doctorCommand(
  options: DoctorOptions = {},
): Promise<DoctorResult> {
  const info = resolveConfigPathInfo({
    configPath: options.configPath,
  });
  const checks: DoctorCheck[] = [];

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "node",
    ok: nodeMajor >= 22,
    detail: `v${process.versions.node}`,
  });

  checks.push({
    name: "cli",
    ok: true,
    detail: VERSION,
  });

  const configExists = existsSync(info.configPath);
  const configCheck: DoctorCheck = {
    name: "config",
    ok: configExists,
    detail: configExists
      ? info.configPath
      : `配置文件不存在: ${info.configPath}`,
  };
  checks.push(configCheck);

  if (configExists) {
    try {
      const { config } = loadConfig({
        configPath: options.configPath,
        loadEnv: true,
      });

      const selectedProvider = getProviderAndModel(config);

      checks.push({
        name: "provider",
        ok: true,
        detail: `${selectedProvider.providerName}/${selectedProvider.modelName}`,
      });

      try {
        const effective = resolveEffectiveDefaults(config);
        validateDefaults(effective.values);
        checks.push({
          name: "defaults",
          ok: true,
          detail: `${Object.keys(effective.values).length} 个默认值`,
        });
      } catch (error) {
        checks.push({
          name: "defaults",
          ok: false,
          detail: messageOf(error),
        });
      }

      const envName = getApiKeyEnvName(
        selectedProvider.provider.apiKey,
      );

      if (envName) {
        const present = Boolean(process.env[envName]);
        checks.push({
          name: "apiKey",
          ok: present,
          detail: `${envName}: ${present ? "set" : "missing"}`,
        });
      } else {
        checks.push({
          name: "apiKey",
          ok: true,
          detail: "literal: set",
        });
      }
    } catch (error) {
      configCheck.ok = false;
      configCheck.detail = messageOf(error);
    }
  }

  try {
    await access(process.cwd(), constants.W_OK);
    checks.push({
      name: "outputDir",
      ok: true,
      detail: process.cwd(),
    });
  } catch (error) {
    checks.push({
      name: "outputDir",
      ok: false,
      detail: messageOf(error),
    });
  }

  const skillPath = getSkillPath();
  checks.push({
    name: "skill",
    ok: existsSync(skillPath),
    detail: skillPath,
  });

  return {
    ok: checks.every((check) => check.ok),
    configPath: info.configPath,
    checks,
  };
}
