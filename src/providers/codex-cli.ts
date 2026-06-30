import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { reviewResultSchema, parseProviderJson, threadCheckResultSchema } from "@/core/schemas.js";
import { formatTargetsForPrompt } from "@/core/targets.js";
import type { ReviewInput, ReviewResult, ThreadCheckInput, ThreadCheckResult } from "@/core/types.js";
import { ensureCommand } from "@/integrations/git.js";
import type { ReviewProvider } from "@/providers/provider.js";

export function createCodexCliProvider(timeoutSeconds: number): ReviewProvider {
  return {
    async review(input: ReviewInput): Promise<ReviewResult> {
      const prompt = renderTemplate("review-prompt.md", {
        rules: input.rules.join(", "),
        ruleContext: input.ruleContext?.trim() || "(No rule-specific context matched these files.)",
        targets: formatTargetsForPrompt(input.targets),
        diff: input.diff
      });

      const raw = await runCodex(prompt, input.model, timeoutSeconds);
      return parseProviderJson(raw, reviewResultSchema);
    },

    async checkThreads(input: ThreadCheckInput): Promise<ThreadCheckResult> {
      const threads = input.threads
        .map((thread) => {
          const loc = thread.path && thread.line ? `${thread.path}:${thread.line}` : "unknown location";
          return `ID ${thread.check_id} (${loc}) by ${thread.author ?? "unknown"}:\n${thread.body}`;
        })
        .join("\n\n");
      const prompt = renderTemplate("thread-check-prompt.md", {
        threads,
        diff: input.diff ?? "(diff unavailable)"
      });

      const raw = await runCodex(prompt, input.model, timeoutSeconds);
      return parseProviderJson(raw, threadCheckResultSchema);
    }
  };
}

async function runCodex(prompt: string, model: string, timeoutSeconds: number): Promise<string> {
  try {
    await ensureCommand("codex");
  } catch {
    throw new Error("Provider codex-cli requires the Codex CLI. Install and authenticate `codex`, or run with --provider mock.");
  }

  const args = model && model !== "default" ? ["exec", "--model", model, prompt] : ["exec", prompt];
  try {
    const { stdout } = await execa("codex", args, {
      timeout: timeoutSeconds * 1000,
      maxBuffer: 20 * 1024 * 1024
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Codex CLI review failed. Ensure 'codex' is installed and authenticated. ${message}`);
  }
}

function renderTemplate(fileName: string, values: Record<string, string>): string {
  const templatePath = join(dirname(fileURLToPath(import.meta.url)), "../../templates", fileName);
  let template = readFileSync(templatePath, "utf8");
  for (const [key, value] of Object.entries(values)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }
  return template;
}
