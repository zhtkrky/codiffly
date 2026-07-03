import type { ReviewComment } from "@/core/types.js";

export interface GitHubReviewPayload {
  body: string;
  event: "COMMENT";
  comments: Array<{
    path: string;
    line: number;
    side: "RIGHT";
    body: string;
  }>;
}

export function toGitHubReviewPayload(comments: ReviewComment[]): GitHubReviewPayload {
  return {
    body: "codiffly review",
    event: "COMMENT",
    comments: comments.map((comment) => ({
      path: comment.path,
      line: comment.line,
      side: "RIGHT",
      body: comment.body
    }))
  };
}
