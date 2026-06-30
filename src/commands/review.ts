import { writeFileSync } from "node:fs";
import type { Command } from "commander";
import { loadConfig } from "@/config/load.js";
import { readDiffFile } from "@/core/diff.js";
import { createReviewEngine } from "@/core/review-engine.js";
import type { ReviewConfig } from "@/core/types.js";
import { createGitIntegration } from "@/integrations/git.js";
import { createGitHubIntegration } from "@/integrations/github.js";
import { createMarkdownReviewReporter } from "@/reporters/markdown.js";
import { assertProviderName, createProvider } from "@/commands/providers.js";

interface ReviewCommandOptions {
  base?: string;
  head?: string;
  diff?: string;
  pr?: string;
  post?: boolean;
  yes?: boolean;
  provider?: string;
  model?: string;
  output?: string;
  json?: boolean;
  dryRun?: boolean;
}

export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("Review a local diff, patch file, or GitHub PR")
    .option("--base <ref>", "Base ref for local diff")
    .option("--head <ref>", "Head ref for local diff")
    .option("--diff <file>", "Existing unified diff file")
    .option("--pr <number>", "GitHub pull request number")
    .option("--post", "Post eligible comments to GitHub")
    .option("--yes", "Confirm non-interactive actions such as posting all comments")
    .option("--provider <provider>", "Provider override: codex-cli, mock")
    .option("--model <model>", "Model override")
    .option("--output <file>", "Write Markdown preview to a file")
    .option("--json", "Print machine-readable JSON result")
    .option("--dry-run", "Do not post GitHub comments even when --post is passed")
    .action(async (options: ReviewCommandOptions) => {
      validateReviewOptions(options);
      assertProviderName(options.provider);
      const providerOverride = options.provider as ReviewConfig["provider"] | undefined;
      const config = loadConfig(process.cwd(), {
        provider: providerOverride,
        model: options.model
      });
      const git = createGitIntegration();
      const github = createGitHubIntegration();
      const provider = createProvider(config);
      const reporter = createMarkdownReviewReporter();
      const engine = createReviewEngine({ config, git, provider, reporter, github });

      const pr = options.pr ? Number(options.pr) : undefined;
      const diff = options.diff ? readDiffFile(options.diff) : undefined;
      const output = await engine.review({
        base: options.base,
        head: options.head,
        diffFile: options.diff,
        diff,
        pr,
        post: Boolean(options.post),
        yes: Boolean(options.yes),
        dryRun: options.dryRun ?? !options.post
      });

      if (options.output) {
        writeFileSync(options.output, `${output.markdown}\n`, "utf8");
      }

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              comments: output.result.comments,
              skipped: output.result.skipped,
              dryRun: output.dryRun,
              posted: output.posted,
              postEligible: output.postEligible
            },
            null,
            2
          )
        );
        return;
      }

      if (options.output) {
        console.log(`Wrote Markdown preview to ${options.output}.`);
        console.log(summaryLine(output.dryRun, output.posted, output.postEligible, Boolean(pr)));
        return;
      }

      console.log(output.markdown);
      if (pr) {
        console.log(`\n${summaryLine(output.dryRun, output.posted, output.postEligible, true)}`);
      }
    });
}

function validateReviewOptions(options: ReviewCommandOptions): void {
  const modes = [Boolean(options.diff), Boolean(options.pr), Boolean(options.base || options.head)].filter(Boolean).length;
  if (modes > 1 && (options.diff || options.pr)) {
    throw new Error("Use only one review source: --diff, --pr, or --base/--head.");
  }
  if (options.post && !options.pr) {
    throw new Error("--post is only valid with --pr.");
  }
}

function summaryLine(dryRun: boolean, posted: boolean, eligible: number, prMode: boolean): string {
  if (!prMode) {
    return `Generated ${eligible} review comment(s).`;
  }
  if (posted) {
    return `Posted ${eligible} GitHub review comment(s).`;
  }
  if (dryRun) {
    return `Dry run: generated ${eligible} eligible GitHub comment(s); no comments were posted.`;
  }
  return `Generated ${eligible} eligible GitHub comment(s); no comments were posted.`;
}
