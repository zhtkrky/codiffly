import { z } from "zod";

export const severitySchema = z.enum(["blocking", "suggestion", "question", "nit"]);

export const reviewResultSchema = z.object({
  comments: z.array(
    z.object({
      target_id: z.number().int().positive(),
      body: z.string(),
      severity: severitySchema
    })
  )
});

export const threadCheckResultSchema = z.object({
  checks: z.array(
    z.object({
      check_id: z.number().int().positive(),
      status: z.enum(["addressed", "not_addressed", "unclear"]),
      summary: z.string(),
      evidence: z.string(),
      next_action: z.string()
    })
  )
});

export const configSchema = z.object({
  provider: z.enum(["codex-cli", "claude-cli", "mock"]).default("codex-cli"),
  platform: z.enum(["github", "gitlab"]).default("github"),
  model: z.string().default("default"),
  review: z
    .object({
      contextLines: z.number().int().min(0).default(1),
      maxDiffBytes: z.number().int().positive().default(180000),
      maxRiskyFiles: z.number().int().positive().default(8),
      maxCommentTargets: z.number().int().positive().default(400),
      timeoutSeconds: z.number().int().positive().default(180)
    })
    .default({
      contextLines: 1,
      maxDiffBytes: 180000,
      maxRiskyFiles: 8,
      maxCommentTargets: 400,
      timeoutSeconds: 180
    }),
  github: z
    .object({
      post: z.boolean().default(false)
    })
    .default({ post: false }),
  exclude: z.array(z.string()).default([]),
  rules: z.array(z.string()).default([]),
  plugins: z.array(z.string()).default([])
});

export function parseProviderJson<T>(raw: string, schema: z.ZodSchema<T>): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Invalid provider JSON: response did not contain a JSON object.");
  }

  const jsonText = candidate.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid provider JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid provider JSON: ${result.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  return result.data;
}
