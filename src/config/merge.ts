import type { OutputDefaults } from "./schema.js";

export type DefaultsSource = "global" | "provider" | "model" | "cli";

export interface DefaultsLayer {
  source: DefaultsSource;
  values: OutputDefaults | undefined;
}

export interface MergedDefaults {
  values: OutputDefaults;
  sources: Partial<Record<keyof OutputDefaults, DefaultsSource>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function mergeInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;

    if (value === null) {
      delete target[key];
      continue;
    }

    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(
        target[key] as Record<string, unknown>,
        value,
      );
      continue;
    }

    target[key] = value;
  }
}

export function mergeDefaults(layers: DefaultsLayer[]): OutputDefaults {
  const values: Record<string, unknown> = {};

  for (const layer of layers) {
    if (!layer.values) continue;
    mergeInto(values, layer.values as Record<string, unknown>);
  }

  return values as OutputDefaults;
}

export function mergeDefaultsWithSources(
  layers: DefaultsLayer[],
): MergedDefaults {
  const values: Record<string, unknown> = {};
  const sources: Partial<Record<keyof OutputDefaults, DefaultsSource>> = {};

  for (const layer of layers) {
    if (!layer.values) continue;

    for (const [key, value] of Object.entries(layer.values)) {
      if (value === undefined) continue;

      if (value === null) {
        delete values[key];
        delete sources[key as keyof OutputDefaults];
        continue;
      }

      values[key] = value;
      sources[key as keyof OutputDefaults] = layer.source;
    }
  }

  return {
    values: values as OutputDefaults,
    sources,
  };
}
