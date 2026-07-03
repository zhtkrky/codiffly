import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { configSchema, parseProviderJson, reviewResultSchema, threadCheckResultSchema } from "@/core/schemas.js";

const fixtureDir = join(process.cwd(), "tests", "fixtures");

describe("provider output validation", () => {
  it("accepts valid review JSON", () => {
    const result = parseProviderJson(
      '{"comments":[{"target_id":1,"body":"Looks risky.","severity":"blocking"}]}',
      reviewResultSchema
    );

    assert.equal(result.comments[0]?.severity, "blocking");
  });

  it("rejects invalid provider JSON with a helpful error", () => {
    const raw = readFileSync(join(fixtureDir, "invalid-provider-response.txt"), "utf8");

    assert.throws(() => parseProviderJson(raw, reviewResultSchema), /Invalid provider JSON/);
  });

  it("accepts thread check JSON", () => {
    const raw = readFileSync(join(fixtureDir, "thread-check-response.json"), "utf8");
    const result = parseProviderJson(raw, threadCheckResultSchema);

    assert.equal(result.checks[0]?.status, "unclear");
  });

  it("rejects invalid config focus", () => {
    assert.throws(() => configSchema.parse({ focus: "everything" }), /Invalid option/);
  });
});
