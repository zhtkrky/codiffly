import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as outputStream } from "node:process";
import type { Command } from "commander";
import { loadConfig } from "@/config/load.js";
import { readDiffFile } from "@/core/diff.js";
import { createReviewEngine } from "@/core/review-engine.js";
import type { MappedReviewResult, ReviewComment, ReviewConfig, ReviewRunResult } from "@/core/types.js";
import { createGitIntegration } from "@/integrations/git.js";
import type { ReviewPlatformIntegration } from "@/integrations/platform.js";
import { createMarkdownReviewReporter } from "@/reporters/markdown.js";
import { assertProviderName, createProvider } from "@/commands/providers.js";
import { assertPlatformName, createPlatformIntegration } from "@/commands/platforms.js";
import { createProgressReporter } from "@/commands/progress.js";

interface ReviewCommandOptions {
  base?: string;
  head?: string;
  diff?: string;
  pr?: string;
  post?: boolean;
  yes?: boolean;
  provider?: string;
  platform?: string;
  model?: string;
  output?: string;
  json?: boolean;
  dryRun?: boolean;
  pause?: boolean;
}

export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("Review a local diff, patch file, GitHub PR, or GitLab MR")
    .option("--base <ref>", "Base ref for local diff")
    .option("--head <ref>", "Head ref for local diff")
    .option("--diff <file>", "Existing unified diff file")
    .option("--pr <number>", "Pull request or merge request number")
    .option("--post", "Post eligible comments to the selected platform")
    .option("--yes", "Confirm non-interactive actions such as posting all comments")
    .option("--provider <provider>", "Provider override: codex-cli, claude-cli, mock")
    .option("--platform <platform>", "PR/MR platform override: github, gitlab")
    .option("--model <model>", "Model override")
    .option("--output <file>", "Write Markdown preview to a file")
    .option("--json", "Print machine-readable JSON result")
    .option("--dry-run", "Do not post platform comments even when --post is passed")
    .option("--pause", "Wait for Enter before exiting after printing the review")
    .action(async (options: ReviewCommandOptions) => {
      validateReviewOptions(options);
      assertProviderName(options.provider);
      assertPlatformName(options.platform);
      const providerOverride = options.provider as ReviewConfig["provider"] | undefined;
      const platformOverride = options.platform as ReviewConfig["platform"] | undefined;
      const config = loadConfig(process.cwd(), {
        provider: providerOverride,
        platform: platformOverride,
        model: options.model
      });
      const git = createGitIntegration();
      const platform = createPlatformIntegration(config.platform);
      const provider = createProvider(config);
      const reporter = createMarkdownReviewReporter();
      const progressReporter = createProgressReporter();
      const engine = createReviewEngine({
        config,
        git,
        provider,
        reporter,
        platform,
        onProgress: (progress) => progressReporter.update(progress)
      });

      const pr = options.pr ? Number(options.pr) : undefined;
      const diff = options.diff ? readDiffFile(options.diff) : undefined;
      let output: ReviewRunResult;
      try {
        output = await engine.review({
          base: options.base,
          head: options.head,
          diffFile: options.diff,
          diff,
          pr,
          post: false,
          yes: Boolean(options.yes),
          dryRun: true
        });
        progressReporter.stop();
      } catch (error) {
        progressReporter.fail();
        throw error;
      }

      if (options.output) {
        writeFileSync(options.output, `${output.markdown}\n`, "utf8");
      }

      if (options.json) {
        if (Boolean(options.post) && !options.dryRun) {
          const postPr = await resolvePostTargetPr(pr, platform, config.platform, Boolean(options.yes));
          output = await postReviewComments({
            output,
            pr: postPr,
            platform,
            platformName: config.platform,
            mode: options.yes ? "all" : "select"
          });
        }
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
        if (Boolean(options.post) && !options.dryRun) {
          const postPr = await resolvePostTargetPr(pr, platform, config.platform, Boolean(options.yes));
          output = await postReviewComments({
            output,
            pr: postPr,
            platform,
            platformName: config.platform,
            mode: options.yes ? "all" : "select"
          });
        }
        console.log(summaryLine(output.dryRun, output.posted, output.postEligible, Boolean(pr), config.platform));
        await waitForEnterBeforeExit(options);
        return;
      }

      console.log(output.markdown);
      if (pr) {
        console.log(`\n${summaryLine(output.dryRun, output.posted, output.postEligible, true, config.platform)}`);
      } else {
        console.log(`\n${summaryLine(output.dryRun, output.posted, output.postEligible, false, config.platform)}`);
      }
      const postRequest = await maybeResolveInteractivePostRequest({
        pr,
        options,
        output,
        platform,
        platformName: config.platform
      });
      if (postRequest !== undefined) {
        output = await postReviewComments({
          output,
          pr: postRequest.pr,
          platform,
          platformName: config.platform,
          mode: postRequest.mode
        });
        console.log(summaryLine(output.dryRun, output.posted, output.postEligible, true, config.platform));
      }
      await waitForEnterBeforeExit(options);
    });
}

function validateReviewOptions(options: ReviewCommandOptions): void {
  const modes = [Boolean(options.diff), Boolean(options.pr), Boolean(options.base || options.head)].filter(Boolean).length;
  if (modes > 1 && (options.diff || options.pr)) {
    throw new Error("Use only one review source: --diff, --pr, or --base/--head.");
  }
}

function summaryLine(dryRun: boolean, posted: boolean, eligible: number, prMode: boolean, platform: ReviewConfig["platform"]): string {
  const label = platform === "gitlab" ? "GitLab" : "GitHub";
  if (!prMode) {
    return `Generated ${eligible} review comment(s).`;
  }
  if (posted) {
    return `Posted ${eligible} ${label} review comment(s).`;
  }
  if (dryRun) {
    return `Dry run: generated ${eligible} eligible ${label} comment(s); no comments were posted.`;
  }
  return `Generated ${eligible} eligible ${label} comment(s); no comments were posted.`;
}

async function waitForEnterBeforeExit(options: ReviewCommandOptions): Promise<void> {
  const shouldPause = Boolean(options.pause) || process.env.LOCALRABBIT_PAUSE_ON_COMPLETE === "1";
  if (!shouldPause || !input.isTTY || !outputStream.isTTY) {
    return;
  }

  const rl = createInterface({ input, output: outputStream });
  try {
    await rl.question("\nPress Enter to exit.");
  } finally {
    rl.close();
  }
}

interface InteractivePostRequestOptions {
  pr: number | undefined;
  options: ReviewCommandOptions;
  output: ReviewRunResult;
  platform: ReviewPlatformIntegration;
  platformName: ReviewConfig["platform"];
}

interface PostRequest {
  pr: number;
  mode: "select" | "all";
}

async function maybeResolveInteractivePostRequest(options: InteractivePostRequestOptions): Promise<PostRequest | undefined> {
  if (options.output.postEligible === 0 || options.options.dryRun) {
    return undefined;
  }
  if (options.options.post) {
    return {
      pr: await resolvePostTargetPr(options.pr, options.platform, options.platformName, Boolean(options.options.yes)),
      mode: options.options.yes ? "all" : "select"
    };
  }
  if (options.options.yes || !input.isTTY || !outputStream.isTTY) {
    return undefined;
  }

  return promptForPostRequest(options.pr, options.platform, options.platformName);
}

async function resolvePostTargetPr(
  pr: number | undefined,
  platform: ReviewPlatformIntegration,
  platformName: ReviewConfig["platform"],
  yes: boolean
): Promise<number> {
  if (pr !== undefined) {
    return pr;
  }
  const inferred = await inferPostTargetPr(platform, platformName);
  if (inferred !== undefined) {
    return inferred;
  }
  if (yes) {
    throw new Error(`Could not infer the current ${platformLabel(platformName)}. Re-run with --pr so comments can be posted non-interactively.`);
  }
  if (!input.isTTY || !outputStream.isTTY) {
    throw new Error("--post without --pr requires an interactive TTY so the PR/MR number can be entered.");
  }

  const prompted = await promptForPostTargetNumber(platformName, true);
  if (prompted === undefined) {
    throw new Error("Posting canceled; no PR/MR number was provided.");
  }
  return prompted;
}

async function promptForPostRequest(
  pr: number | undefined,
  platform: ReviewPlatformIntegration,
  platformName: ReviewConfig["platform"],
  requireTarget = false
): Promise<PostRequest | undefined> {
  const label = platformLabel(platformName);
  const rl = createInterface({ input, output: outputStream });
  try {
    const action = await askPostAction(rl);
    if (action === "none") {
      return undefined;
    }
    if (pr !== undefined) {
      return { pr, mode: action };
    }
    const inferred = await inferPostTargetPr(platform, platformName);
    if (inferred !== undefined) {
      return { pr: inferred, mode: action };
    }

    while (true) {
      const rawNumber = (await rl.question(`${label} number: `)).trim();
      const parsed = Number(rawNumber);
      if (Number.isInteger(parsed) && parsed > 0) {
        return { pr: parsed, mode: action };
      }
      if (!requireTarget && rawNumber === "") {
        return undefined;
      }
      console.log(`Enter a valid ${label} number.`);
    }
  } finally {
    rl.close();
  }
}

async function inferPostTargetPr(platform: ReviewPlatformIntegration, platformName: ReviewConfig["platform"]): Promise<number | undefined> {
  const inferred = await platform.inferPullRequestNumber?.();
  if (inferred !== undefined) {
    console.log(`Using current ${platformLabel(platformName)} #${inferred}.`);
  }
  return inferred;
}

async function askPostAction(rl: ReturnType<typeof createInterface>): Promise<"select" | "all" | "none"> {
  while (true) {
    const answer = normalizePostAction(
      await rl.question("Post comments? [s]elect one-by-one / [a]ll / [n]one: ")
    );
    if (answer) {
      return answer;
    }
    console.log("Choose s to select comments, a to post all, or n to skip posting.");
  }
}

async function promptForPostTargetNumber(platformName: ReviewConfig["platform"], requireTarget = false): Promise<number | undefined> {
  const label = platformLabel(platformName);
  const rl = createInterface({ input, output: outputStream });
  try {
    while (true) {
      const rawNumber = (await rl.question(`${label} number: `)).trim();
      const parsed = Number(rawNumber);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
      if (!requireTarget && rawNumber === "") {
        return undefined;
      }
      console.log(`Enter a valid ${label} number.`);
    }
  } finally {
    rl.close();
  }
}

function platformLabel(platformName: ReviewConfig["platform"]): string {
  return platformName === "gitlab" ? "GitLab MR" : "GitHub PR";
}

interface PostReviewCommentsOptions {
  output: ReviewRunResult;
  pr: number;
  platform: ReturnType<typeof createPlatformIntegration>;
  platformName: ReviewConfig["platform"];
  mode: "select" | "all";
}

async function postReviewComments(options: PostReviewCommentsOptions): Promise<ReviewRunResult> {
  const selection = options.mode === "all"
    ? { comments: options.output.result.comments, canceled: false }
    : await selectCommentsForPosting(options.output.result.comments);
  const comments = selection.canceled ? [] : selection.comments;
  if (comments.length > 0) {
    const prInfo = await options.platform.getPullRequest(options.pr);
    console.log(`Posting ${comments.length} ${options.platformName === "gitlab" ? "GitLab" : "GitHub"} review comment(s)...`);
    await options.platform.postReviewComments(prInfo, comments);
  } else if (selection.canceled) {
    console.log("Posting canceled; no comments were posted.");
  } else {
    console.log("No comments selected; nothing was posted.");
  }

  return withPostingResult(options.output, comments, comments.length > 0);
}

interface CommentSelection {
  comments: ReviewComment[];
  canceled: boolean;
}

async function selectCommentsForPosting(comments: ReviewComment[]): Promise<CommentSelection> {
  if (!input.isTTY || !outputStream.isTTY) {
    throw new Error("Interactive comment selection requires a TTY. Re-run with --yes to post all comments or omit --post for a dry run.");
  }

  const selected: ReviewComment[] = [];
  const rl = createInterface({ input, output: outputStream });

  try {
    for (let index = 0; index < comments.length; index += 1) {
      const comment = comments[index];
      printCommentPrompt(comment, index + 1, comments.length);

      while (true) {
        const answer = normalizeAnswer(await rl.question("Post this comment? [Y/n/e/a/q] "));
        if (answer === "y") {
          selected.push(comment);
          break;
        }
        if (answer === "n") {
          break;
        }
        if (answer === "e") {
          const edited = await editCommentBody(rl, comment);
          if (edited) {
            selected.push(edited);
          }
          break;
        }
        if (answer === "a") {
          selected.push(comment, ...comments.slice(index + 1));
          return { comments: selected, canceled: false };
        }
        if (answer === "q") {
          return { comments: [], canceled: true };
        }
        console.log("Choose y, n, e, a, or q.");
      }
    }
  } finally {
    rl.close();
  }

  return { comments: selected, canceled: false };
}

function printCommentPrompt(comment: ReviewComment, index: number, total: number): void {
  console.log("");
  console.log(`[${index}/${total}] ${comment.severity} ${comment.path}:${comment.line}`);
  console.log(comment.body);
}

function normalizeAnswer(answer: string): "y" | "n" | "e" | "a" | "q" | undefined {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return "y";
  }
  if (["y", "yes"].includes(normalized)) {
    return "y";
  }
  if (["n", "no"].includes(normalized)) {
    return "n";
  }
  if (["e", "edit"].includes(normalized)) {
    return "e";
  }
  if (["a", "all"].includes(normalized)) {
    return "a";
  }
  if (["q", "quit"].includes(normalized)) {
    return "q";
  }
  return undefined;
}

function normalizePostAction(answer: string): "select" | "all" | "none" | undefined {
  const normalized = answer.trim().toLowerCase();
  if (["", "s", "select"].includes(normalized)) {
    return "select";
  }
  if (["a", "all"].includes(normalized)) {
    return "all";
  }
  if (["n", "no", "none", "skip", "q", "quit"].includes(normalized)) {
    return "none";
  }
  return undefined;
}

async function editCommentBody(rl: ReturnType<typeof createInterface>, comment: ReviewComment): Promise<ReviewComment | undefined> {
  const body = (await rl.question("Replacement body (blank skips this comment): ")).trim();
  if (!body) {
    return undefined;
  }
  return { ...comment, body };
}

function withPostingResult(output: ReviewRunResult, comments: ReviewComment[], posted: boolean): ReviewRunResult {
  const result: MappedReviewResult = {
    ...output.result,
    comments
  };

  return {
    ...output,
    markdown: createMarkdownReviewReporter().render(result),
    result,
    dryRun: false,
    posted,
    postEligible: comments.length
  };
}
