import type { ReviewInput, ReviewResult, ThreadCheckInput, ThreadCheckResult } from "@/core/types.js";

export interface ReviewProvider {
  review(input: ReviewInput): Promise<ReviewResult>;
  checkThreads?(input: ThreadCheckInput): Promise<ThreadCheckResult>;
}
