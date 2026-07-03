import type { ReviewFocus } from "@/core/types.js";

export const reviewFocusValues = ["balanced", "details", "maintainability", "risk"] as const;

const focusRuleAdditions: Record<ReviewFocus, string[]> = {
  balanced: [],
  details: ["logic-detail", "boundary-cases", "nullability", "refactor-consistency", "test-assertion-quality"],
  maintainability: ["duplication", "local-patterns", "responsibility-boundaries", "abstraction-fit", "test-maintainability"],
  risk: [
    "security",
    "secrets",
    "api-contract",
    "error-handling",
    "concurrency",
    "performance",
    "tests",
    "database-migration-safety",
    "dependencies",
    "infrastructure"
  ]
};

export function isReviewFocus(value: unknown): value is ReviewFocus {
  return typeof value === "string" && (reviewFocusValues as readonly string[]).includes(value);
}

export function rulesForFocus(focus: ReviewFocus): string[] {
  return [...focusRuleAdditions[focus]];
}

export function applyFocusRules(rules: string[], focus: ReviewFocus): string[] {
  return [...new Set([...rules, ...rulesForFocus(focus)])];
}

export function buildFocusPromptContext(focus: ReviewFocus): string {
  switch (focus) {
    case "balanced":
      return [
        "Focus: balanced.",
        "Use the configured rubric and rule context for a general-purpose changed-line review.",
        "Prefer concrete, high-confidence findings with evidence from the diff."
      ].join("\n");
    case "details":
      return [
        "Focus: details.",
        "Review changed hunks for subtle regressions by comparing old behavior to new behavior.",
        "Look for wrong variables or properties, inverted conditions, missing null or empty branches, off-by-one errors, changed defaults, stale refactor names, boundary cases, timezone, math, rounding, and pagination mistakes.",
        "Check whether tests assert the changed behavior instead of only executing the changed path.",
        "Avoid broad architecture comments unless the issue is directly caused by the changed lines."
      ].join("\n");
    case "maintainability":
      return [
        "Focus: maintainability.",
        "Review for redundancy, DRY violations, duplicated conditionals, literals, or error handling, missed reuse of existing local helpers, inconsistent local patterns, unrelated responsibilities, unnecessary abstraction, over-coupling, and weak or duplicated test setup.",
        "Do not make generic SOLID comments. Only comment when the diff shows concrete duplication, inconsistency, or avoidable complexity.",
        "Prefer comments that suggest a specific smaller refactor or reuse path."
      ].join("\n");
    case "risk":
      return [
        "Focus: risk.",
        "Review for production-impacting failures: auth and authorization, security, data loss, migrations, API compatibility, dependency or runtime changes, infrastructure and deployment, error handling, observability, and rollback hazards.",
        "Ignore style and minor maintainability issues unless they create real production risk.",
        "Every comment should name the likely failure mode or operational impact visible from the diff."
      ].join("\n");
  }
}
