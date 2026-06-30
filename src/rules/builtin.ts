import type { ChangedFile, ReviewRule } from "@/core/types.js";

const frontendExtensions = new Set([".tsx", ".jsx", ".vue", ".svelte", ".html"]);
const databaseExtensions = new Set([".sql", ".prisma"]);

export const builtInRules: ReviewRule[] = [
  {
    name: "security",
    description: "Look for auth, authorization, injection, secrets, unsafe parsing, and data exposure risks.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Security review context:",
        `- File: ${file.path}`,
        "- Check whether changed code introduces injection, auth bypass, secret leakage, insecure crypto, SSRF, XSS, unsafe deserialization, or overly broad permissions.",
        "- Prefer concrete exploitability over generic security advice."
      ].join("\n")
  },
  {
    name: "performance",
    description: "Look for avoidable latency, memory, query, rendering, and algorithmic regressions.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Performance review context:",
        `- File: ${file.path}`,
        "- Check changed loops, queries, network calls, rendering paths, caching, allocations, and concurrency for regressions.",
        "- Comment only when the diff gives enough evidence of user-visible or operational impact."
      ].join("\n")
  },
  {
    name: "tests",
    description: "Look for missing or weakened tests around changed behavior.",
    appliesTo: (file) => isCodeOrConfigFile(file) && !isTestFile(file.path),
    buildPromptContext: (file) =>
      [
        "Test coverage review context:",
        `- File: ${file.path}`,
        "- Check whether changed behavior, edge cases, error handling, or bug fixes need new or updated tests.",
        "- Avoid requesting tests for purely mechanical or non-behavioral changes."
      ].join("\n")
  },
  {
    name: "accessibility",
    description: "Look for accessibility issues in frontend UI files.",
    appliesTo: (file) => frontendExtensions.has(extension(file.path)) || isFrontendPath(file.path),
    buildPromptContext: (file) =>
      [
        "Accessibility review context:",
        `- File: ${file.path}`,
        "- Check changed UI for keyboard access, focus order, labels, semantic elements, ARIA misuse, alt text, color contrast, and motion sensitivity.",
        "- Only comment on accessibility issues visible in this diff."
      ].join("\n")
  },
  {
    name: "database-migration-safety",
    description: "Look for unsafe database migrations in SQL and Prisma files.",
    appliesTo: (file) => databaseExtensions.has(extension(file.path)) || file.path.toLowerCase().includes("migration"),
    buildPromptContext: (file) =>
      [
        "Database migration safety review context:",
        `- File: ${file.path}`,
        "- Check for destructive schema changes, data loss, non-transactional steps, missing backfills, locks on large tables, irreversible changes, and deploy-order hazards.",
        "- Prefer comments that explain the runtime or rollout failure mode."
      ].join("\n")
  }
];

export function enabledBuiltInRules(names: string[]): ReviewRule[] {
  const enabled = new Set(names);
  return builtInRules.filter((rule) => enabled.has(rule.name));
}

function isCodeOrConfigFile(file: ChangedFile): boolean {
  const ext = extension(file.path);
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".sql", ".prisma", ".yml", ".yaml", ".json"].includes(ext);
}

function isTestFile(path: string): boolean {
  return /(^|[/_.-])(test|tests|spec|specs)([/_.-]|$)/i.test(path);
}

function isFrontendPath(path: string): boolean {
  return /(^|\/)(components|pages|app|ui|views|frontend|client)\//i.test(path);
}

function extension(path: string): string {
  const fileName = path.toLowerCase().split("/").at(-1) ?? path.toLowerCase();
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index) : "";
}
