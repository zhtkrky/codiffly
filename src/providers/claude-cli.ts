import { execa } from "execa";
import { reviewResultSchema, parseProviderJson, threadCheckResultSchema } from "@/core/schemas.js";
import { formatTargetsForPrompt } from "@/core/targets.js";
import type { ReviewInput, ReviewResult, ThreadCheckInput, ThreadCheckResult } from "@/core/types.js";
import { ensureCommand } from "@/integrations/git.js";
import { renderTemplate } from "@/providers/codex-cli.js";
import type { ReviewProvider } from "@/providers/provider.js";

export function createClaudeCliProvider(timeoutSeconds: number): ReviewProvider {
  return {
    async review(input: ReviewInput): Promise<ReviewResult> {
      const prompt = renderTemplate("review-prompt.md", {
        rules: input.rules.join(", "),
        ruleContext: input.ruleContext?.trim() || "(No rule-specific context matched these files.)",
        targets: formatTargetsForPrompt(input.targets),
        diff: input.diff
      });

      const raw = await runClaude(prompt, input.model, timeoutSeconds);
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

      const raw = await runClaude(prompt, input.model, timeoutSeconds);
      return parseProviderJson(raw, threadCheckResultSchema);
    }
  };
}

async function runClaude(prompt: string, model: string, timeoutSeconds: number): Promise<string> {
  try {
    await ensureCommand("claude");
  } catch {
    throw new Error("Provider claude-cli requires the Claude CLI. Install and authenticate `claude`, or run with --provider mock.");
  }

  const args = ["-p", prompt];
  if (model && model !== "default") {
    args.push("--model", model);
  }

  try {
    const { stdout } = await execa("claude", args, {
      timeout: timeoutSeconds * 1000,
      maxBuffer: 20 * 1024 * 1024
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Claude CLI review failed. Ensure 'claude' is installed and authenticated. ${message}`);
  }
}
