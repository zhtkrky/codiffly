import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractChangedLineTargets } from "@/core/targets.js";

const fixtureDir = join(process.cwd(), "tests", "fixtures");

describe("extractChangedLineTargets", () => {
  it("extracts target IDs for added lines in a unified diff", () => {
    const diff = readFileSync(join(fixtureDir, "small.diff"), "utf8");
    const targets = extractChangedLineTargets(diff, 400);

    assert.deepEqual(targets, [
      {
        id: 1,
        path: "src/example.ts",
        line: 2,
        kind: "added"
      }
    ]);
  });

  it("respects max target limits", () => {
    const diff = readFileSync(join(fixtureDir, "large.diff"), "utf8");
    const targets = extractChangedLineTargets(diff, 2);

    assert.equal(targets.length, 2);
    assert.equal(targets[0]?.id, 1);
    assert.equal(targets[1]?.id, 2);
  });
});
