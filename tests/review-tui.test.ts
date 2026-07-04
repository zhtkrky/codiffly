import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderCommentDiffContext } from "@/commands/review-tui.js";
import type { ReviewComment } from "@/core/types.js";

const diff = `diff --git a/src/file.ts b/src/file.ts
index 1111111..2222222 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,4 +1,5 @@
 const first = 1;
 const second = 2;
+const added = first + second;
 const fourth = 4;
 const fifth = 5;
`;

describe("review TUI diff context", () => {
  it("renders the matching changed line with nearby context", () => {
    const comment: ReviewComment = {
      target_id: 1,
      path: "src/file.ts",
      line: 3,
      severity: "suggestion",
      body: "Check this line."
    };

    const rendered = renderCommentDiffContext(diff, comment, 2);

    assert.match(rendered, />\s+\s+3 \+ const added = first \+ second;/);
    assert.match(rendered, /1\s+1\s+const first = 1;/);
    assert.match(rendered, /3\s+4\s+const fourth = 4;/);
  });

  it("returns a useful fallback when no target line matches", () => {
    const rendered = renderCommentDiffContext(diff, {
      target_id: 1,
      path: "src/file.ts",
      line: 99,
      severity: "suggestion",
      body: "Missing."
    });

    assert.equal(rendered, "(No matching changed line found in the diff.)");
  });
});
