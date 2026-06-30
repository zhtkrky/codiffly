import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";
import YAML from "yaml";
import { configSchema } from "@/core/schemas.js";
import type { ReviewConfig } from "@/core/types.js";
import { defaultConfig } from "@/config/default-config.js";

export const CONFIG_FILE = ".localrabbit.yml";

export function findConfigPath(startDir = process.cwd()): string | undefined {
  let current = startDir;
  while (true) {
    const candidate = join(current, CONFIG_FILE);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current || current === parsePath(current).root) {
      return undefined;
    }
    current = parent;
  }
}

export function loadConfig(startDir = process.cwd(), overrides: Partial<ReviewConfig> = {}): ReviewConfig {
  const configPath = findConfigPath(startDir);
  const fileConfig = configPath ? YAML.parse(readFileSync(configPath, "utf8")) ?? {} : {};
  const definedOverrides = removeUndefined(overrides);
  const merged = {
    ...defaultConfig,
    ...fileConfig,
    ...definedOverrides,
    review: {
      ...defaultConfig.review,
      ...fileConfig.review,
      ...definedOverrides.review
    },
    github: {
      ...defaultConfig.github,
      ...fileConfig.github,
      ...definedOverrides.github
    },
    exclude: definedOverrides.exclude ?? fileConfig.exclude ?? defaultConfig.exclude,
    rules: definedOverrides.rules ?? fileConfig.rules ?? defaultConfig.rules,
    plugins: definedOverrides.plugins ?? fileConfig.plugins ?? defaultConfig.plugins
  };

  return configSchema.parse(merged) as ReviewConfig;
}

export function writeDefaultConfig(cwd = process.cwd()): string {
  const path = join(cwd, CONFIG_FILE);
  if (existsSync(path)) {
    throw new Error(`${CONFIG_FILE} already exists.`);
  }

  writeFileSync(path, YAML.stringify(defaultConfig), "utf8");
  return path;
}

function removeUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
