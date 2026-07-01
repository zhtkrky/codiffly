import type { PullRequestInfo, ReviewComment, ReviewThread } from "@/core/types.js";

export interface ReviewPlatformIntegration {
  name: string;
  getPullRequest(number: number): Promise<PullRequestInfo>;
  getPullRequestDiff(number: number): Promise<string>;
  postReviewComments(pr: PullRequestInfo, comments: ReviewComment[]): Promise<void>;
  unresolvedThreads(prNumber: number): Promise<ReviewThread[]>;
}
