import type { ChangedFile, PresetName, ReviewRule } from "@/core/types.js";

const frontendExtensions = new Set([".tsx", ".jsx", ".vue", ".svelte", ".html"]);
const databaseExtensions = new Set([".sql", ".prisma"]);
const infraExtensions = new Set([".tf", ".tfvars", ".hcl"]);
const dependencyFiles = new Set([
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "poetry.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "Dockerfile"
]);

export const presetRules: Record<PresetName, string[]> = {
  recommended: [
    "security",
    "secrets",
    "api-contract",
    "error-handling",
    "concurrency",
    "performance",
    "tests",
    "accessibility",
    "database-migration-safety",
    "dependencies",
    "infrastructure"
  ],
  frontend: ["security", "secrets", "api-contract", "error-handling", "performance", "tests", "accessibility", "dependencies"],
  backend: [
    "security",
    "secrets",
    "api-contract",
    "error-handling",
    "concurrency",
    "performance",
    "tests",
    "database-migration-safety",
    "dependencies"
  ],
  "node-api": [
    "security",
    "secrets",
    "api-contract",
    "error-handling",
    "concurrency",
    "performance",
    "tests",
    "database-migration-safety",
    "dependencies"
  ],
  infra: ["security", "secrets", "infrastructure", "dependencies", "tests"],
  minimal: ["security", "tests"]
};

export function isPresetName(value: unknown): value is PresetName {
  return typeof value === "string" && value in presetRules;
}

export function rulesForPreset(preset: PresetName): string[] {
  return [...presetRules[preset]];
}

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
    name: "secrets",
    description: "Look for committed credentials, tokens, private keys, and unsafe secret handling.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Secrets review context:",
        `- File: ${file.path}`,
        "- Check added literals, config, logs, fixtures, environment defaults, and generated clients for credentials, API keys, private keys, tokens, webhooks, or connection strings.",
        "- Also flag changes that move secrets into client-visible code or persistent logs.",
        "- Do not flag placeholder values unless they look usable or normalize an unsafe pattern."
      ].join("\n")
  },
  {
    name: "api-contract",
    description: "Look for breaking API, schema, event, and CLI contract changes.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "API contract review context:",
        `- File: ${file.path}`,
        "- Check changed request/response shapes, status codes, validation, serialization, public types, exported functions, CLI flags, event names, queue payloads, and database schema contracts.",
        "- Flag compatibility breaks, migration gaps, renamed fields, changed defaults, and ambiguous error semantics when callers may already depend on the old behavior.",
        "- Prefer comments that name the likely caller or integration impact."
      ].join("\n")
  },
  {
    name: "error-handling",
    description: "Look for swallowed failures, bad retries, misleading fallbacks, and incomplete cleanup.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Error-handling review context:",
        `- File: ${file.path}`,
        "- Check changed error paths for swallowed exceptions, lost context, incorrect status codes, partial writes, missing cleanup, retry storms, unbounded retries, and fallbacks that hide data loss.",
        "- Flag user-visible or operationally misleading failures over stylistic error handling preferences."
      ].join("\n")
  },
  {
    name: "concurrency",
    description: "Look for race conditions, idempotency gaps, locking issues, and async lifecycle bugs.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Concurrency review context:",
        `- File: ${file.path}`,
        "- Check changed async flows, jobs, transactions, callbacks, shared state, caches, locks, and retries for races, duplicate work, missed awaits, leaked tasks, and non-idempotent side effects.",
        "- Prefer comments tied to realistic interleavings or production lifecycle behavior."
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
  },
  {
    name: "dependencies",
    description: "Look for risky dependency, package, Docker, and runtime configuration changes.",
    appliesTo: (file) => dependencyFiles.has(fileName(file.path)) || isConfigPath(file.path),
    buildPromptContext: (file) =>
      [
        "Dependency and runtime config review context:",
        `- File: ${file.path}`,
        "- Check package/runtime changes for version incompatibilities, missing lockfile updates, broad version ranges, removed transitive assumptions, insecure defaults, changed Node/Python/JVM/runtime versions, and Docker image hazards.",
        "- Comment only when the diff suggests a concrete install, build, security, or runtime failure."
      ].join("\n")
  },
  {
    name: "infrastructure",
    description: "Look for risky infrastructure, deployment, permissions, networking, and observability changes.",
    appliesTo: (file) => infraExtensions.has(extension(file.path)) || isInfraPath(file.path),
    buildPromptContext: (file) =>
      [
        "Infrastructure review context:",
        `- File: ${file.path}`,
        "- Check changed infrastructure/deployment config for overbroad IAM, public exposure, missing encryption, destructive replacement, state drift, missing health checks, unsafe rollout strategy, and broken monitoring/logging.",
        "- Prefer comments that describe the operational failure mode and blast radius."
      ].join("\n")
  },
  {
    name: "logic-detail",
    description: "Look for subtle changed-line logic regressions.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Changed-line logic detail context:",
        `- File: ${file.path}`,
        "- Compare removed and added branches, conditions, variables, properties, and return values for behavior that no longer matches the surrounding code.",
        "- Comment only when the diff gives concrete evidence of an unintended behavior change."
      ].join("\n")
  },
  {
    name: "boundary-cases",
    description: "Look for boundary, pagination, math, rounding, and timezone mistakes.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Boundary-case review context:",
        `- File: ${file.path}`,
        "- Check changed comparisons, limits, defaults, pagination offsets, ranges, rounding, math, and timezone handling for edge-case regressions.",
        "- Prefer concrete boundary examples over generic requests for more edge cases."
      ].join("\n")
  },
  {
    name: "nullability",
    description: "Look for missing null, undefined, empty, and optional-state handling.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Nullability review context:",
        `- File: ${file.path}`,
        "- Check changed dereferences, optional values, empty arrays, empty strings, missing fields, and fallback paths for crashes or behavior changes.",
        "- Comment only when the changed lines expose a plausible null or empty-state failure."
      ].join("\n")
  },
  {
    name: "refactor-consistency",
    description: "Look for stale names and missed updates after local refactors.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Refactor consistency review context:",
        `- File: ${file.path}`,
        "- Check renamed symbols, moved behavior, copied branches, updated call sites, and stale literals for inconsistencies introduced by the diff.",
        "- Prefer comments that identify the mismatched old and new names or assumptions."
      ].join("\n")
  },
  {
    name: "test-assertion-quality",
    description: "Look for tests that execute changed behavior without asserting it.",
    appliesTo: (file) => isTestFile(file.path),
    buildPromptContext: (file) =>
      [
        "Test assertion quality context:",
        `- File: ${file.path}`,
        "- Check whether changed tests assert the behavior they are meant to protect, including negative paths and boundary inputs.",
        "- Flag weakened, removed, skipped, or overly broad assertions only when the diff shows the gap."
      ].join("\n")
  },
  {
    name: "duplication",
    description: "Look for concrete duplication introduced by the diff.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Duplication review context:",
        `- File: ${file.path}`,
        "- Check for repeated conditionals, literals, mapping logic, error handling, setup, and validation introduced or expanded by the diff.",
        "- Comment only when a specific smaller reuse path is visible."
      ].join("\n")
  },
  {
    name: "local-patterns",
    description: "Look for inconsistency with nearby local patterns.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Local pattern consistency context:",
        `- File: ${file.path}`,
        "- Check whether the diff ignores established helpers, conventions, error shapes, data access patterns, or component patterns visible in the changed file.",
        "- Avoid broad style preferences; tie comments to a concrete local pattern."
      ].join("\n")
  },
  {
    name: "responsibility-boundaries",
    description: "Look for functions or classes taking on unrelated responsibilities.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Responsibility boundary context:",
        `- File: ${file.path}`,
        "- Check whether changed functions, classes, commands, or components now combine unrelated responsibilities that make behavior harder to test or reason about.",
        "- Prefer comments that name the smaller boundary or extraction point."
      ].join("\n")
  },
  {
    name: "abstraction-fit",
    description: "Look for unnecessary, leaky, or missed abstractions.",
    appliesTo: isCodeOrConfigFile,
    buildPromptContext: (file) =>
      [
        "Abstraction fit context:",
        `- File: ${file.path}`,
        "- Check whether the diff adds abstraction without enough reuse, leaks caller details, over-couples modules, or misses an existing helper that would simplify the change.",
        "- Comment only when a concrete simpler design or reuse path is evident."
      ].join("\n")
  },
  {
    name: "test-maintainability",
    description: "Look for duplicated or brittle test setup.",
    appliesTo: (file) => isTestFile(file.path),
    buildPromptContext: (file) =>
      [
        "Test maintainability context:",
        `- File: ${file.path}`,
        "- Check for duplicated setup, brittle fixture construction, over-mocking, and inconsistent helper usage introduced by changed tests.",
        "- Prefer comments that suggest a specific local helper, fixture, or assertion structure."
      ].join("\n")
  }
];

export function enabledBuiltInRules(names: string[]): ReviewRule[] {
  const enabled = new Set(names);
  return builtInRules.filter((rule) => enabled.has(rule.name));
}

function isCodeOrConfigFile(file: ChangedFile): boolean {
  const ext = extension(file.path);
  return [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".rb",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".sql",
    ".prisma",
    ".yml",
    ".yaml",
    ".json",
    ".toml",
    ".tf",
    ".hcl"
  ].includes(ext);
}

function isTestFile(path: string): boolean {
  return /(^|[/_.-])(test|tests|spec|specs)([/_.-]|$)/i.test(path);
}

function isFrontendPath(path: string): boolean {
  return /(^|\/)(components|pages|app|ui|views|frontend|client)\//i.test(path);
}

function isInfraPath(path: string): boolean {
  return /(^|\/)(infra|infrastructure|terraform|deploy|deployment|k8s|kubernetes|helm|charts|cloudformation|pulumi|ansible|github\/workflows)\//i.test(path);
}

function isConfigPath(path: string): boolean {
  return /(^|\/)(\.github\/workflows|config|configs|deploy|deployment)\//i.test(path) || /\.(ya?ml|json|toml)$/i.test(path);
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function extension(path: string): string {
  const fileName = path.toLowerCase().split("/").at(-1) ?? path.toLowerCase();
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index) : "";
}
