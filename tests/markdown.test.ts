import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdownReview, renderMarkdownThreadCheck } from "@/reporters/markdown.js";

describe("Markdown reporters", () => {
  it("renders review comments", () => {
    const markdown = renderMarkdownReview({
      skipped: 0,
      comments: [
        {
          target_id: 1,
          path: "src/file.ts",
          line: 42,
          severity: "blocking",
          body: "Comment body"
        }
      ]
    });

    assert.equal(markdown, "- **#1 src/file.ts:42** [blocking] Comment body");
  });

  it("renders thread checks", () => {
    const markdown = renderMarkdownThreadCheck({
      checks: [
        {
          check_id: 1,
          status: "addressed",
          summary: "Fixed.",
          evidence: "The test now covers it.",
          next_action: "Resolve the thread."
        }
      ]
    });

    assert.match(markdown, /\*\*#1\*\* \[addressed\] Fixed\./);
    assert.match(markdown, /Next: Resolve the thread\./);
  });
});
