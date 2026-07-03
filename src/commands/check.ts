import type { Command } from "commander";
import { loadConfig } from "@/config/load.js";
import { createReviewEngine } from "@/core/review-engine.js";
import type { ReviewConfig } from "@/core/types.js";
import { createGitIntegration } from "@/integrations/git.js";
import { createMarkdownReviewReporter, createMarkdownThreadCheckReporter } from "@/reporters/markdown.js";
import { assertProviderName, createProvider } from "@/commands/providers.js";
import { assertPlatformName, createPlatformIntegration } from "@/commands/platforms.js";

interface CheckCommandOptions {
  pr: string;
  resolve?: boolean;
  yes?: boolean;
  provider?: string;
  platform?: string;
  model?: string;
}

export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Check unresolved GitHub PR or GitLab MR review threads")
    .requiredOption("--pr <number>", "Pull request or merge request number")
    .option("--resolve", "Resolve addressed threads; intentionally not implemented yet")
    .option("--yes", "Confirm non-interactive resolving")
    .option("--provider <provider>", "Provider override: codex-cli, claude-cli, mock")
    .option("--platform <platform>", "PR/MR platform override: github, gitlab")
    .option("--model <model>", "Model override")
    .action(async (options: CheckCommandOptions) => {
      assertProviderName(options.provider);
      assertPlatformName(options.platform);
      const providerOverride = options.provider as ReviewConfig["provider"] | undefined;
      const platformOverride = options.platform as ReviewConfig["platform"] | undefined;
      const config = loadConfig(process.cwd(), {
        provider: providerOverride,
        platform: platformOverride,
        model: options.model
      });
      const engine = createReviewEngine({
        config,
        git: createGitIntegration(),
        provider: createProvider(config),
        reporter: createMarkdownReviewReporter(),
        platform: createPlatformIntegration(config.platform)
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
