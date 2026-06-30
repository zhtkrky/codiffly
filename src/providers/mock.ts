import type { ReviewInput, ReviewResult, ThreadCheckInput, ThreadCheckResult } from "@/core/types.js";
import type { ReviewProvider } from "@/providers/provider.js";

export function createMockProvider(): ReviewProvider {
  return {
    async review(input: ReviewInput): Promise<ReviewResult> {
      const first = input.targets[0];
      if (!first) {
        return { comments: [] };
      }

      return {
        comments: [
          {
            target_id: first.id,
            severity: "suggestion",
            body: "Mock review comment: verify this changed line has the intended behavior and test coverage."
          }
        ]
      };
    },

    async checkThreads(input: ThreadCheckInput): Promise<ThreadCheckResult> {
      return {
        checks: input.threads.map((thread) => ({
          check_id: thread.check_id,
          status: "unclear",
          summary: "Mock check cannot determine whether this thread was addressed.",
          evidence: "No real model was invoked.",
          next_action: "Ask a reviewer to inspect the latest diff."
        }))
      };
    }
  };
}
