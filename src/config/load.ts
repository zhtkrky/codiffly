import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";
import YAML from "yaml";
import { configSchema } from "@/core/schemas.js";
import type { ReviewConfig } from "@/core/types.js";
import { defaultConfig } from "@/config/default-config.js";
import { applyFocusRules, isReviewFocus } from "@/core/focus.js";
import { isPresetName, rulesForPreset } from "@/rules/builtin.js";

export const CONFIG_FILE = ".codiffly.yml";

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
  const preset = definedOverrides.preset ?? fileConfig.preset ?? defaultConfig.preset;
  const focus = definedOverrides.focus ?? fileConfig.focus ?? defaultConfig.focus;
  const configuredRules = definedOverrides.rules ?? fileConfig.rules ?? (isPresetName(preset) ? rulesForPreset(preset) : defaultConfig.rules);
  const merged = {
    ...defaultConfig,
    ...fileConfig,
    ...definedOverrides,
    preset,
    focus,
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
    rules: isReviewFocus(focus) ? applyFocusRules(configuredRules, focus) : configuredRules,
    plugins: definedOverrides.plugins ?? fileConfig.plugins ?? defaultConfig.plugins
  };

  return configSchema.parse(merged) as ReviewConfig;
}

export function writeDefaultConfig(cwd = process.cwd()): string {
  const path = join(cwd, CONFIG_FILE);
  if (existsSync(path)) {
    throw new Error(`${CONFIG_FILE} already exists.`);
  }

  writeFileSync(path, YAML.stringify(defaultConfigFile()), "utf8");
  return path;
}

function removeUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function defaultConfigFile(): Omit<ReviewConfig, "rules"> {
  const { rules: _rules, ...config } = defaultConfig;
  return config;
}
