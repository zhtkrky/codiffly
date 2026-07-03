import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFocusPromptContext } from "@/core/focus.js";
import { renderTemplate } from "@/providers/codex-cli.js";

describe("review prompt rendering", () => {
  it("includes the selected focus context", () => {
    const prompt = renderTemplate("review-prompt.md", {
      rules: "logic-detail",
      focus: "details",
      focusContext: buildFocusPromptContext("details"),
      ruleContext: "(No rule-specific context matched these files.)",
      targets: "ID 1: src/file.ts:2",
      diff: "+const value = maybeNull.name;"
    });

    assert.match(prompt, /Focus: details/);
    assert.match(prompt, /subtle regressions/);
    assert.doesNotMatch(prompt, /\{\{focusContext\}\}/);
  });
});
