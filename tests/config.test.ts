import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "@/config/load.js";

describe("config loading", () => {
  it("loads defaults without a config file", () => {
    const dir = join(tmpdir(), `localrabbit-config-defaults-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const config = loadConfig(dir);

    assert.equal(config.provider, "codex-cli");
    assert.equal(config.review.contextLines, 1);
    assert.equal(config.github.post, false);
    assert.ok(config.exclude.includes("package-lock.json"));
    assert.ok(config.rules.includes("security"));
    assert.deepEqual(config.plugins, []);
  });

  it("merges repo config and CLI overrides", () => {
    const dir = join(tmpdir(), `localrabbit-config-merge-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, ".localrabbit.yml"),
      ["provider: mock", "review:", "  maxRiskyFiles: 3", "rules:", "  - security", "plugins:", "  - ./review-rules/custom.ts"].join("\n"),
      "utf8"
    );

    const config = loadConfig(dir, { model: "custom-model" });

    assert.equal(config.provider, "mock");
    assert.equal(config.model, "custom-model");
    assert.equal(config.review.contextLines, 1);
    assert.equal(config.review.maxRiskyFiles, 3);
    assert.deepEqual(config.rules, ["security"]);
    assert.deepEqual(config.plugins, ["./review-rules/custom.ts"]);
  });
});
