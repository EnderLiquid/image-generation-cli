import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configCommand } from "../src/commands/config.js";
import { loadConfig } from "../src/config/load.js";
import { mergeDefaultsWithSources } from "../src/config/merge.js";
import { redactConfig } from "../src/config/redact.js";
import {
  assertValidSize,
  parseConfig,
  validateDefaults,
  type OutputDefaults,
} from "../src/config/schema.js";
import { resolveApiKey } from "../src/config/secrets.js";
import {
  makeTempDir,
  writeTestConfig,
} from "./helpers.js";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
});

function validConfig(): unknown {
  return {
    defaultProvider: "openai",
    defaults: {
      output_format: "png",
    },
    providers: {
      openai: {
        apiUrl: "https://api.openai.com/v1",
        apiKey: "${OPENAI_API_KEY}",
        defaultModel: "gpt-image-2.6-flare",
        models: {
          "gpt-image-2.6-flare": {
            defaults: {
              size: "1536x1024",
              quality: "high",
            },
          },
        },
      },
    },
  };
}

describe("配置解析", () => {
  it("解析有效配置", () => {
    const config = parseConfig(validConfig());

    expect(config.defaultProvider).toBe("openai");
    expect(
      config.providers.openai?.models["gpt-image-2.6-flare"]?.defaults
        ?.quality,
    ).toBe("high");
  });

  it("解析 response_format 默认值", () => {
    const raw = validConfig() as {
      defaults: Record<string, unknown>;
    };
    raw.defaults.response_format = "url";

    expect(
      parseConfig(raw).defaults?.response_format,
    ).toBe("url");
  });

  it("拒绝未知字段", () => {
    const raw = validConfig() as Record<string, unknown>;
    raw.extra = true;

    expect(() => parseConfig(raw)).toThrow(/配置校验失败/);
  });

  it("拒绝不存在的默认 provider", () => {
    const raw = validConfig() as {
      defaultProvider: string;
    };
    raw.defaultProvider = "missing";

    expect(() => parseConfig(raw)).toThrow(/defaultProvider 不存在/);
  });

  it("拒绝不存在的默认模型", () => {
    const raw = validConfig() as {
      providers: Record<
        string,
        { defaultModel: string }
      >;
    };
    raw.providers.openai!.defaultModel = "missing";

    expect(() => parseConfig(raw)).toThrow(/defaultModel 不存在/);
  });
});

describe("默认值合并", () => {
  it("按层级覆盖并记录来源", () => {
    const merged = mergeDefaultsWithSources([
      {
        source: "global",
        values: {
          n: 1,
          size: "1024x1024",
          quality: "low",
          output_format: "png",
        },
      },
      {
        source: "provider",
        values: {
          quality: "high",
          output_format: null,
        },
      },
      {
        source: "model",
        values: {
          size: "1536x1024",
        },
      },
      {
        source: "cli",
        values: {
          n: 2,
        },
      },
    ]);

    expect(merged.values).toEqual({
      n: 2,
      size: "1536x1024",
      quality: "high",
    });
    expect(merged.sources).toEqual({
      n: "cli",
      size: "model",
      quality: "provider",
    });
  });
});

describe("尺寸与默认值校验", () => {
  it("接受有效的 16 倍数尺寸", () => {
    expect(() => assertValidSize("1024x1024")).not.toThrow();
    expect(() => assertValidSize("1536x1024")).not.toThrow();
    expect(() => assertValidSize("auto")).not.toThrow();
  });

  it("拒绝非 16 倍数", () => {
    expect(() => assertValidSize("1000x1000")).toThrow(/16 的倍数/);
  });

  it("拒绝过小或过大尺寸", () => {
    expect(() => assertValidSize("512x512")).toThrow(/总像素数/);
    expect(() => assertValidSize("4096x1024")).toThrow(/边长/);
  });

  it("拒绝超过 3:1 的宽高比", () => {
    expect(() => assertValidSize("3840x1024")).toThrow(/宽高比/);
  });

  it("拒绝 png 的 output_compression", () => {
    const defaults: OutputDefaults = {
      output_format: "png",
      output_compression: 80,
    };

    expect(() => validateDefaults(defaults)).toThrow(
      /output_compression/,
    );
  });

  it("接受 webp 的 output_compression", () => {
    const defaults: OutputDefaults = {
      output_format: "webp",
      output_compression: 80,
    };

    expect(() => validateDefaults(defaults)).not.toThrow();
  });

  it("拒绝 jpeg 的透明背景", () => {
    const defaults: OutputDefaults = {
      output_format: "jpeg",
      background: "transparent",
    };

    expect(() => validateDefaults(defaults)).toThrow(/transparent/);
  });
});

describe("密钥与脱敏", () => {
  it("解析环境变量占位符", () => {
    process.env.TEST_IMAGE_KEY = "secret-value";

    expect(resolveApiKey("${TEST_IMAGE_KEY}")).toBe("secret-value");
  });

  it("保留字面量密钥", () => {
    expect(resolveApiKey("literal-key")).toBe("literal-key");
  });

  it("缺少环境变量时报错", () => {
    delete process.env.MISSING_IMAGE_KEY;

    expect(() => resolveApiKey("${MISSING_IMAGE_KEY}")).toThrow(
      /MISSING_IMAGE_KEY/,
    );
  });

  it("脱敏配置中的 apiKey", () => {
    const config = parseConfig(validConfig());
    const redacted = redactConfig(config);
    const text = JSON.stringify(redacted);

    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("OPENAI_API_KEY");
  });

  it("从同级 .env 加载环境变量，进程环境变量优先", async () => {
    const dir = await makeTempDir();
    const envPath = path.join(dir, ".env");
    const envName = "IMAGE_GENERATION_TEST_ENV";
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
      apiKey: `\${${envName}}`,
    });

    await writeFile(
      envPath,
      `${envName}=from-file\n`,
      "utf8",
    );

    process.env[envName] = "from-process";

    const first = loadConfig({
      configPath,
      loadEnv: true,
    });
    expect(
      resolveApiKey(first.config.providers.test!.apiKey),
    ).toBe("from-process");

    delete process.env[envName];

    const second = loadConfig({
      configPath,
      loadEnv: true,
    });
    expect(
      resolveApiKey(second.config.providers.test!.apiKey),
    ).toBe("from-file");
  });
});

describe("配置命令", () => {
  it("输出脱敏配置", async () => {
    const dir = await makeTempDir();
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
      apiKey: "real-secret",
    });

    const result = configCommand({ configPath });
    const text = JSON.stringify(result);

    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("real-secret");
  });

  it("输出合并后的默认值和来源", async () => {
    const dir = await makeTempDir();
    const configPath = await writeTestConfig(dir, {
      apiUrl: "https://example.com/v1",
      globalDefaults: {
        quality: "low",
        output_format: "png",
      },
      providerDefaults: {
        quality: "high",
      },
      modelDefaults: {
        size: "1536x1024",
      },
    });

    const result = configCommand({
      configPath,
      effective: true,
    }) as {
      defaults: Record<string, unknown>;
      sources: Record<string, string>;
    };

    expect(result.defaults.quality).toBe("high");
    expect(result.defaults.size).toBe("1536x1024");
    expect(result.sources.quality).toBe("provider");
    expect(result.sources.size).toBe("model");
  });
});
