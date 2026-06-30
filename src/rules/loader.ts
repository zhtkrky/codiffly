import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { findConfigPath } from "@/config/load.js";
import type { ChangedFile, ReviewConfig, ReviewRule } from "@/core/types.js";
import { splitDiffByFile } from "@/core/diff.js";
import { enabledBuiltInRules } from "@/rules/builtin.js";

export async function loadReviewRules(config: ReviewConfig, startDir = process.cwd()): Promise<ReviewRule[]> {
  const builtIns = enabledBuiltInRules(config.rules);
  const plugins = await Promise.all(config.plugins.map((pluginPath) => loadPluginRules(pluginPath, configRoot(startDir))));
  return [...builtIns, ...plugins.flat()];
}

export async function buildRulePromptContext(diff: string, rules: ReviewRule[]): Promise<string> {
  if (rules.length === 0) {
    return "";
  }

  const sections: string[] = [];
  for (const file of splitDiffByFile(diff)) {
    const contexts = await contextsForFile(file, rules);
    if (contexts.length === 0) {
      continue;
    }

    sections.push([`File: ${file.path}`, ...contexts].join("\n\n"));
  }

  return sections.join("\n\n---\n\n");
}

async function contextsForFile(file: ChangedFile, rules: ReviewRule[]): Promise<string[]> {
  const contexts: string[] = [];
  for (const rule of rules) {
    if (!rule.appliesTo(file)) {
      continue;
    }

    const context = (await rule.buildPromptContext(file)).trim();
    if (!context) {
      continue;
    }
    contexts.push([`Rule: ${rule.name}${rule.description ? ` - ${rule.description}` : ""}`, context].join("\n"));
  }
  return contexts;
}

async function loadPluginRules(pluginPath: string, root: string): Promise<ReviewRule[]> {
  const resolved = resolvePluginPath(pluginPath, root);
  if (!existsSync(resolved)) {
    throw new Error(`Review rule plugin not found: ${pluginPath} (${resolved})`);
  }

  let moduleExports: unknown;
  try {
    moduleExports = await importPlugin(resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load review rule plugin ${pluginPath}: ${message}`);
  }

  const rules = extractRules(moduleExports);
  if (rules.length === 0) {
    throw new Error(`Review rule plugin ${pluginPath} did not export a ReviewRule or ReviewRule array.`);
  }
  return rules.map((rule, index) => validateRule(rule, `${pluginPath}${rules.length > 1 ? `[${index}]` : ""}`));
}

function resolvePluginPath(pluginPath: string, root: string): string {
  if (!pluginPath.startsWith(".") && !isAbsolute(pluginPath)) {
    throw new Error(`Review rule plugin must be a local file path, not a package specifier: ${pluginPath}`);
  }

  const resolved = resolve(root, pluginPath);
  const normalizedRoot = `${resolve(root)}/`;
  if (resolved !== resolve(root) && !resolved.startsWith(normalizedRoot)) {
    throw new Error(`Review rule plugin must stay inside the config directory: ${pluginPath}`);
  }

  return resolved;
}

async function importPlugin(path: string): Promise<unknown> {
  if (path.endsWith(".ts")) {
    const source = readFileSync(path, "utf8");
    assertNoRuntimeRelativeImports(source, path);
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        esModuleInterop: true
      },
      fileName: path
    }).outputText;
    const dir = mkdtempSync(resolve(tmpdir(), "localrabbit-rule-"));
    const compiledPath = resolve(dir, `${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
    writeFileSync(compiledPath, output, "utf8");
    return import(pathToFileURL(compiledPath).href);
  }

  return import(`${pathToFileURL(path).href}?t=${Date.now()}`);
}

function assertNoRuntimeRelativeImports(source: string, path: string): void {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = moduleSpecifierText(statement.moduleSpecifier);
      if (specifier && isRelativeSpecifier(specifier) && !statement.importClause?.isTypeOnly) {
        throw new Error(
          `TypeScript review rule plugins do not support runtime relative imports yet: ${specifier}. Use type-only imports or compile the plugin to JavaScript first.`
        );
      }
    }

    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier ? moduleSpecifierText(statement.moduleSpecifier) : undefined;
      if (specifier && isRelativeSpecifier(specifier) && !statement.isTypeOnly) {
        throw new Error(
          `TypeScript review rule plugins do not support runtime relative exports yet: ${specifier}. Use type-only exports or compile the plugin to JavaScript first.`
        );
      }
    }
  }
}

function moduleSpecifierText(specifier: ts.Expression): string | undefined {
  return ts.isStringLiteral(specifier) ? specifier.text : undefined;
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function extractRules(moduleExports: unknown): unknown[] {
  if (!moduleExports || typeof moduleExports !== "object") {
    return [];
  }

  const exported = moduleExports as Record<string, unknown>;
  const candidates = [exported.default, exported.rule, exported.rules, moduleExports];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (isRuleLike(candidate)) {
      return [candidate];
    }
  }
  return [];
}

function validateRule(rule: unknown, label: string): ReviewRule {
  if (!isRuleLike(rule)) {
    throw new Error(`Invalid ReviewRule export from ${label}. Expected name, appliesTo(), and buildPromptContext().`);
  }
  return rule;
}

function isRuleLike(value: unknown): value is ReviewRule {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rule = value as Partial<ReviewRule>;
  return typeof rule.name === "string" && typeof rule.appliesTo === "function" && typeof rule.buildPromptContext === "function";
}

function configRoot(startDir: string): string {
  const configPath = findConfigPath(startDir);
  return configPath ? dirname(configPath) : startDir;
}
