import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterExcludedFiles, limitDiffToRiskyFiles } from "@/core/risk.js";

const fixtureDir = join(process.cwd(), "tests", "fixtures");

describe("risk ranking", () => {
  it("filters excluded files and keeps the highest-risk file", () => {
    const diff = readFileSync(join(fixtureDir, "large.diff"), "utf8");
    const filtered = filterExcludedFiles(diff, ["package-lock.json"]);
    const risky = limitDiffToRiskyFiles(filtered, 1);

    assert.match(risky, /src\/auth\/session\.ts/);
    assert.doesNotMatch(risky, /docs\/readme\.md/);
    assert.doesNotMatch(risky, /package-lock\.json/);
  });
});
