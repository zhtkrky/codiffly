import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "@/config/default-config.js";
import { createReviewEngine } from "@/core/review-engine.js";
import type { MappedReviewResult, Reporter, ReviewConfig, ReviewInput } from "@/core/types.js";
import type { GitIntegration } from "@/integrations/git.js";
import type { ReviewProvider } from "@/providers/provider.js";

const diff = `diff --git a/src/file.ts b/src/file.ts
index 1111111..2222222 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1 +1,2 @@
 const value = 1;
+console.log(value);
`;

describe("review engine progress", () => {
  it("reports review milestones", async () => {
    const messages: string[] = [];
    const config: ReviewConfig = {
      ...defaultConfig,
      provider: "mock",
      rules: [],
      plugins: []
    };
    const git: GitIntegration = {
      ensureGitAvailable: async () => {},
      isInsideWorkTree: async () => true,
      ensureInsideWorkTree: async () => {},
      defaultBaseBranch: async () => "origin/main",
      diff: async () => diff,
      fetch: async () => {}
    };
    const provider: ReviewProvider = {
      review: async () => ({
        comments: [{ target_id: 1, severity: "suggestion", body: "Check this." }]
      })
    };
    const reporter: Reporter = {
      render: (input) => `${(input as MappedReviewResult).comments.length} comment(s)`
    };

    const engine = createReviewEngine({
      config,
      git,
      provider,
      reporter,
      onProgress: ({ message }) => messages.push(message)
    });

    const result = await engine.review({ diff });

    assert.equal(result.markdown, "1 comment(s)");
    assert.deepEqual(messages, [
      "Reading the provided diff...",
      "Preparing the diff for review...",
      "Found 1 changed line to review.",
      "Loading review rules...",
      "Asking mock to review the diff...",
      "Checking 1 comment from the reviewer...",
      "Review complete: 1 comment ready."
    ]);
  });

  it("passes focus context to the provider", async () => {
    let reviewInput: ReviewInput | undefined;
    const config: ReviewConfig = {
      ...defaultConfig,
      provider: "mock",
      focus: "maintainability",
      rules: [],
      plugins: []
    };
    const git: GitIntegration = {
      ensureGitAvailable: async () => {},
      isInsideWorkTree: async () => true,
      ensureInsideWorkTree: async () => {},
      defaultBaseBranch: async () => "origin/main",
      diff: async () => diff,
      fetch: async () => {}
    };
    const provider: ReviewProvider = {
      review: async (input) => {
        reviewInput = input;
        return { comments: [] };
      }
    };
    const reporter: Reporter = {
      render: () => "No review comments."
    };

    const engine = createReviewEngine({ config, git, provider, reporter });
    await engine.review({ diff });

    assert.equal(reviewInput?.focus, "maintainability");
    assert.match(reviewInput?.focusContext ?? "", /Focus: maintainability/);
    assert.match(reviewInput?.focusContext ?? "", /concrete duplication/);
  });
});
