import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "@/config/load.js";

describe("config loading", () => {
  it("loads defaults without a config file", () => {
    const dir = join(tmpdir(), `codiffly-config-defaults-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const config = loadConfig(dir);

    assert.equal(config.provider, "codex-cli");
    assert.equal(config.platform, "github");
    assert.equal(config.preset, "recommended");
    assert.equal(config.focus, "balanced");
    assert.equal(config.review.contextLines, 1);
    assert.equal(config.github.post, false);
    assert.ok(config.exclude.includes("package-lock.json"));
    assert.ok(config.rules.includes("security"));
    assert.ok(config.rules.includes("api-contract"));
    assert.ok(config.rules.includes("concurrency"));
    assert.ok(config.rules.includes("dependencies"));
    assert.deepEqual(config.plugins, []);
  });

  it("loads focus from config files", () => {
    const dir = join(tmpdir(), `codiffly-config-focus-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".codiffly.yml"), ["provider: mock", "focus: details"].join("\n"), "utf8");

    const config = loadConfig(dir);

    assert.equal(config.focus, "details");
    assert.ok(config.rules.includes("logic-detail"));
    assert.ok(config.rules.includes("boundary-cases"));
  });

  it("lets CLI focus override config files", () => {
    const dir = join(tmpdir(), `codiffly-config-focus-override-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".codiffly.yml"), ["provider: mock", "focus: details"].join("\n"), "utf8");

    const config = loadConfig(dir, { focus: "risk" });

    assert.equal(config.focus, "risk");
    assert.ok(config.rules.includes("database-migration-safety"));
  });

  it("rejects invalid focus values", () => {
    const dir = join(tmpdir(), `codiffly-config-focus-invalid-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".codiffly.yml"), ["provider: mock", "focus: everything"].join("\n"), "utf8");

    assert.throws(() => loadConfig(dir), /Invalid option/);
  });

  it("expands presets when rules are not explicitly configured", () => {
    const dir = join(tmpdir(), `codiffly-config-preset-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".codiffly.yml"), ["provider: mock", "preset: frontend"].join("\n"), "utf8");

    const config = loadConfig(dir);

    assert.equal(config.preset, "frontend");
    assert.ok(config.rules.includes("accessibility"));
    assert.ok(config.rules.includes("api-contract"));
    assert.doesNotMatch(config.rules.join(","), /database-migration-safety/);
    assert.deepEqual(config.plugins, []);
  });

  it("merges repo config and CLI overrides", () => {
    const dir = join(tmpdir(), `codiffly-config-merge-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, ".codiffly.yml"),
      ["provider: mock", "preset: backend", "review:", "  maxRiskyFiles: 3", "rules:", "  - security", "plugins:", "  - ./review-rules/custom.ts"].join("\n"),
      "utf8"
    );

    const config = loadConfig(dir, { model: "custom-model" });

    assert.equal(config.provider, "mock");
    assert.equal(config.preset, "backend");
    assert.equal(config.model, "custom-model");
    assert.equal(config.review.contextLines, 1);
    assert.equal(config.review.maxRiskyFiles, 3);
    assert.deepEqual(config.rules, ["security"]);
    assert.deepEqual(config.plugins, ["./review-rules/custom.ts"]);
  });
});
