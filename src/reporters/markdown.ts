import type { MappedReviewResult, Reporter, ThreadCheckResult } from "@/core/types.js";

export function renderMarkdownReview(result: MappedReviewResult): string {
  if (result.comments.length === 0) {
    return "No review comments.";
  }

  const lines = result.comments.map(
    (comment, index) => `- **#${index + 1} ${comment.path}:${comment.line}** [${comment.severity}] ${comment.body}`
  );
  if (result.skipped > 0) {
    lines.push(`\nSkipped ${result.skipped} invalid provider comment(s).`);
  }
  return lines.join("\n");
}

export function renderMarkdownThreadCheck(result: ThreadCheckResult): string {
  if (result.checks.length === 0) {
    return "No unresolved review threads found.";
  }

  return result.checks
    .map(
      (check) =>
        `- **#${check.check_id}** [${check.status}] ${check.summary}\n  Evidence: ${check.evidence}\n  Next: ${check.next_action}`
    )
    .join("\n");
}

export function createMarkdownReviewReporter(): Reporter<MappedReviewResult> {
  return { render: renderMarkdownReview };
}

export function createMarkdownThreadCheckReporter(): Reporter<ThreadCheckResult> {
  return { render: renderMarkdownThreadCheck };
}
