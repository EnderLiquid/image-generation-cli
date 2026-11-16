import type { Config } from "./schema.js";

export function redactConfig(config: Config): unknown {
  const providers = Object.fromEntries(
    Object.entries(config.providers).map(([name, provider]) => [
      name,
      {
        ...provider,
        apiKey: "[REDACTED]",
      },
    ]),
  );

  return {
    ...config,
    providers,
  };
}
