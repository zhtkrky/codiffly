import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "@/config/load.js";
import { buildRulePromptContext, loadReviewRules } from "@/rules/loader.js";

const diff = [
  "diff --git a/src/query.ts b/src/query.ts",
  "index 0000000..1111111 100644",
  "--- a/src/query.ts",
  "+++ b/src/query.ts",
  "@@ -1,2 +1,3 @@",
  " export function run(sql: string) {",
  "+  return db.query(sql);",
  " }"
].join("\n");

describe("review rules", () => {
  it("builds context for enabled built-in rules that match changed files", async () => {
    const rules = await loadReviewRules({ ...loadConfig(tmpdir()), rules: ["security"], plugins: [] });
    const context = await buildRulePromptContext(diff, rules);

    assert.match(context, /Rule: security/);
    assert.match(context, /src\/query.ts/);
    assert.doesNotMatch(context, /Rule: accessibility/);
  });

  it("makes zero-config built-ins useful without plugins", async () => {
    const config = loadConfig(tmpdir());
    const rules = await loadReviewRules(config);
    const context = await buildRulePromptContext(diff, rules);

    assert.match(context, /Rule: security/);
    assert.match(context, /Rule: api-contract/);
    assert.match(context, /Rule: error-handling/);
    assert.match(context, /Rule: concurrency/);
    assert.match(context, /Rule: tests/);
    assert.deepEqual(config.plugins, []);
  });

  it("loads explicit local TypeScript plugin rules", async () => {
    const dir = join(tmpdir(), `codiffly-rules-${process.pid}`);
    const pluginDir = join(dir, "review-rules");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(dir, ".codiffly.yml"),
      ["provider: mock", "rules:", "  - security", "plugins:", "  - ./review-rules/no-dangerous-sql.ts"].join("\n"),
      "utf8"
    );
    writeFileSync(
      join(pluginDir, "no-dangerous-sql.ts"),
      [
        "import type { ReviewRule } from '../../src/core/types';",
        "const rule: ReviewRule = {",
        "  name: 'no-dangerous-sql',",
        "  appliesTo: (file) => file.path.endsWith('.ts'),",
        "  buildPromptContext: (file) => `Check ${file.path} for raw SQL interpolation.`",
        "};",
        "export default rule;"
      ].join("\n"),
      "utf8"
    );

    const config = loadConfig(dir);
    const rules = await loadReviewRules(config, dir);
    const context = await buildRulePromptContext(diff, rules);

    assert.match(context, /Rule: no-dangerous-sql/);
    assert.match(context, /raw SQL interpolation/);
  });

  it("rejects plugin paths outside the config directory", async () => {
    const dir = join(tmpdir(), `codiffly-rules-outside-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const config = { ...loadConfig(dir), plugins: ["../outside.ts"] };

    await assert.rejects(loadReviewRules(config, dir), /must stay inside the config directory/);
  });

  it("rejects TypeScript plugin runtime relative imports with a clear error", async () => {
    const dir = join(tmpdir(), `codiffly-rules-relative-import-${process.pid}`);
    const pluginDir = join(dir, "review-rules");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, "with-helper.ts"),
      [
        "import { helper } from './helper.ts';",
        "export default {",
        "  name: 'with-helper',",
        "  appliesTo: () => true,",
        "  buildPromptContext: () => helper()",
        "};"
      ].join("\n"),
      "utf8"
    );
    const config = { ...loadConfig(dir), plugins: ["./review-rules/with-helper.ts"] };

    await assert.rejects(loadReviewRules(config, dir), /do not support runtime relative imports/);
  });
});
