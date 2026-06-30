import type { Command } from "commander";
import { loadConfig } from "@/config/load.js";
import { createReviewEngine } from "@/core/review-engine.js";
import type { ReviewConfig } from "@/core/types.js";
import { createGitIntegration } from "@/integrations/git.js";
import { createGitHubIntegration } from "@/integrations/github.js";
import { createMarkdownReviewReporter, createMarkdownThreadCheckReporter } from "@/reporters/markdown.js";
import { assertProviderName, createProvider } from "@/commands/providers.js";

interface CheckCommandOptions {
  pr: string;
  resolve?: boolean;
  yes?: boolean;
  provider?: string;
  model?: string;
}

export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Check unresolved GitHub PR review threads")
    .requiredOption("--pr <number>", "GitHub pull request number")
    .option("--resolve", "Resolve addressed threads; intentionally not implemented yet")
    .option("--yes", "Confirm non-interactive resolving")
    .option("--provider <provider>", "Provider override: codex-cli, mock")
    .option("--model <model>", "Model override")
    .action(async (options: CheckCommandOptions) => {
      assertProviderName(options.provider);
      const providerOverride = options.provider as ReviewConfig["provider"] | undefined;
      const config = loadConfig(process.cwd(), {
        provider: providerOverride,
        model: options.model
      });
      const engine = createReviewEngine({
        config,
        git: createGitIntegration(),
        provider: createProvider(config),
        reporter: createMarkdownReviewReporter(),
        github: createGitHubIntegration()
      });
      const markdown = await engine.check(
        {
          pr: Number(options.pr),
          resolve: Boolean(options.resolve),
          yes: Boolean(options.yes)
        },
        createMarkdownThreadCheckReporter()
      );
      console.log(markdown);
    });
}
