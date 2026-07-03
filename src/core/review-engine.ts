import type { ReviewProvider } from "@/providers/provider.js";
import type { GitIntegration } from "@/integrations/git.js";
import type { ReviewPlatformIntegration } from "@/integrations/platform.js";
import { byteLength } from "@/core/diff.js";
import { filterExcludedFiles, limitDiffToRiskyFiles } from "@/core/risk.js";
import { extractChangedLineTargets } from "@/core/targets.js";
import { buildFocusPromptContext } from "@/core/focus.js";
import type {
  CheckRunOptions,
  MappedReviewResult,
  RawReviewComment,
  Reporter,
  ReviewConfig,
  ReviewProgress,
  ReviewRunOptions,
  ReviewRunResult,
  ThreadCheckResult
} from "@/core/types.js";
import { buildRulePromptContext, loadReviewRules } from "@/rules/loader.js";

export interface ReviewEngine {
  review(options: ReviewRunOptions & { diff?: string }): Promise<ReviewRunResult>;
  check(options: CheckRunOptions, reporter: Reporter<ThreadCheckResult>): Promise<string>;
}

export interface ReviewEngineDeps {
  config: ReviewConfig;
  git: GitIntegration;
  provider: ReviewProvider;
  reporter: Reporter;
  platform?: ReviewPlatformIntegration;
  onProgress?: (progress: ReviewProgress) => void;
}

export function createReviewEngine(deps: ReviewEngineDeps): ReviewEngine {
  const progress = (message: string, detail?: string): void => deps.onProgress?.({ message, detail });
  const complete = (message: string, detail?: string): void => deps.onProgress?.({ message, detail, status: "complete" });
  const changedLineLabel = (count: number): string => `${count} changed ${count === 1 ? "line" : "lines"}`;
  const commentLabel = (count: number): string => `${count} ${count === 1 ? "comment" : "comments"}`;

  const resolveDiff = async (options: ReviewRunOptions): Promise<string> => {
    if (options.pr) {
      if (!deps.platform) {
        throw new Error("A review platform integration is required for --pr.");
      }
      progress(`Fetching ${deps.platform.name} PR/MR #${options.pr}...`, "Reading metadata.");
      await deps.platform.getPullRequest(options.pr);
      progress("Downloading the diff...", "Using the selected platform integration.");
      return deps.platform.getPullRequestDiff(options.pr);
    }

    progress("Finding the local changes to review...", "Resolving base and head refs.");
    const base = options.base ?? (await deps.git.defaultBaseBranch());
    const head = options.head ?? "HEAD";
    progress(`Reading diff from ${base}...${head}...`, `Using ${deps.config.review.contextLines} context line(s).`);
    return deps.git.diff(base, head, deps.config.review.contextLines);
  };

  const prepareDiff = (diff: string): string => {
    let prepared = filterExcludedFiles(diff, deps.config.exclude);
    if (byteLength(prepared) > deps.config.review.maxDiffBytes) {
      prepared = limitDiffToRiskyFiles(prepared, deps.config.review.maxRiskyFiles);
    }
    return prepared;
  };

  return {
    async review(options: ReviewRunOptions & { diff?: string }): Promise<ReviewRunResult> {
      if (options.diff) {
        progress(
          options.diffFile ? `Reading diff from ${options.diffFile}...` : "Reading the provided diff...",
          "Using an existing unified diff."
        );
      }
      const rawDiff = options.diff ?? (await resolveDiff(options));
      if (!rawDiff.trim()) {
        throw new Error("Diff is empty. There are no changes to review.");
      }

      progress("Preparing the diff for review...", "Applying exclusions and size limits.");
      const preparedDiff = prepareDiff(rawDiff);
      if (!preparedDiff.trim()) {
        throw new Error("No reviewable diff found after exclusions.");
      }

      const targets = extractChangedLineTargets(preparedDiff, deps.config.review.maxCommentTargets);
      if (targets.length === 0) {
        throw new Error("No changed-line targets found in the diff.");
      }
      progress(
        `Found ${changedLineLabel(targets.length)} to review.`,
        `Capped at ${deps.config.review.maxCommentTargets} comment target(s).`
      );

      progress("Loading review rules...", deps.config.rules.length ? deps.config.rules.join(", ") : "No rules enabled.");
      const rules = await loadReviewRules(deps.config);
      const ruleContext = await buildRulePromptContext(preparedDiff, rules);
      const focusContext = buildFocusPromptContext(deps.config.focus);
      const model = deps.config.model && deps.config.model !== "default" ? ` with model ${deps.config.model}` : "";
      progress(
        `Asking ${deps.config.provider}${model} to review the diff...`,
        `Waiting for a JSON review result. Timeout: ${deps.config.review.timeoutSeconds}s.`
      );
      const result = await deps.provider.review({
        diff: preparedDiff,
        targets,
        rules: deps.config.rules,
        ruleContext,
        focus: deps.config.focus,
        focusContext,
        model: deps.config.model,
        metadata: options.pr ? { pr: options.pr } : undefined
      });
      progress(`Checking ${commentLabel(result.comments.length)} from the reviewer...`, "Keeping only valid changed-line comments.");
      const mapped = mapAndFilterComments(result.comments, targets);

      const dryRun = options.dryRun ?? !options.post;

      complete(`Review complete: ${commentLabel(mapped.comments.length)} ready.`);
      return {
        markdown: deps.reporter.render(mapped),
        result: mapped,
        dryRun,
        posted: false,
        postEligible: mapped.comments.length
      };
    },

    async check(options: CheckRunOptions, reporter: Reporter<ThreadCheckResult>): Promise<string> {
      if (!deps.platform) {
        throw new Error("A review platform integration is required for check --pr.");
      }
      const threads = await deps.platform.unresolvedThreads(options.pr);
      if (!deps.provider.checkThreads) {
        throw new Error("Selected provider does not support thread checks.");
      }
      const result = await deps.provider.checkThreads({
        threads,
        model: deps.config.model
      });

      if (options.resolve && !options.yes) {
        throw new Error("Resolving threads requires --yes. Auto-resolve is not implemented in this version.");
      }
      if (options.resolve) {
        throw new Error("Auto-resolving threads is intentionally not implemented yet.");
      }

      return reporter.render(result);
    }
  };
}

function mapAndFilterComments(comments: RawReviewComment[], targets: ReturnType<typeof extractChangedLineTargets>): MappedReviewResult {
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const mapped = comments.flatMap((comment) => {
    const target = targetById.get(comment.target_id);
    if (!target || !comment.body.trim()) {
      return [];
    }

    return [
      {
        ...comment,
        body: comment.body.trim(),
        path: target.path,
        line: target.line
      }
    ];
  });

  return {
    comments: mapped,
    skipped: comments.length - mapped.length
  };
}
