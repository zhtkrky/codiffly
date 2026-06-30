import type { ReviewProvider } from "@/providers/provider.js";
import type { GitHubIntegration } from "@/integrations/github.js";
import type { GitIntegration } from "@/integrations/git.js";
import { byteLength } from "@/core/diff.js";
import { filterExcludedFiles, limitDiffToRiskyFiles } from "@/core/risk.js";
import { extractChangedLineTargets } from "@/core/targets.js";
import type { CheckRunOptions, MappedReviewResult, RawReviewComment, Reporter, ReviewConfig, ReviewRunOptions, ReviewRunResult, ThreadCheckResult } from "@/core/types.js";
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
  github?: GitHubIntegration;
}

export function createReviewEngine(deps: ReviewEngineDeps): ReviewEngine {
  const resolveDiff = async (options: ReviewRunOptions): Promise<string> => {
    if (options.pr) {
      if (!deps.github) {
        throw new Error("GitHub integration is required for --pr.");
      }
      await deps.github.getPullRequest(options.pr);
      return deps.github.getPullRequestDiff(options.pr);
    }

    const base = options.base ?? (await deps.git.defaultBaseBranch());
    const head = options.head ?? "HEAD";
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
      const rawDiff = options.diff ?? (await resolveDiff(options));
      if (!rawDiff.trim()) {
        throw new Error("Diff is empty. There are no changes to review.");
      }

      const preparedDiff = prepareDiff(rawDiff);
      if (!preparedDiff.trim()) {
        throw new Error("No reviewable diff found after exclusions.");
      }

      const targets = extractChangedLineTargets(preparedDiff, deps.config.review.maxCommentTargets);
      if (targets.length === 0) {
        throw new Error("No changed-line targets found in the diff.");
      }

      const rules = await loadReviewRules(deps.config);
      const ruleContext = await buildRulePromptContext(preparedDiff, rules);
      const result = await deps.provider.review({
        diff: preparedDiff,
        targets,
        rules: deps.config.rules,
        ruleContext,
        model: deps.config.model,
        metadata: options.pr ? { pr: options.pr } : undefined
      });
      const mapped = mapAndFilterComments(result.comments, targets);

      const dryRun = options.dryRun ?? !options.post;
      let posted = false;

      if (options.pr && options.post && !dryRun) {
        if (!options.yes) {
          throw new Error("Posting requires --yes in this first implementation.");
        }
        if (!deps.github) {
          throw new Error("GitHub integration is required to post PR comments.");
        }
        const pr = await deps.github.getPullRequest(options.pr);
        await deps.github.postReviewComments(pr, mapped.comments);
        posted = true;
      }

      return {
        markdown: deps.reporter.render(mapped),
        result: mapped,
        dryRun,
        posted,
        postEligible: mapped.comments.length
      };
    },

    async check(options: CheckRunOptions, reporter: Reporter<ThreadCheckResult>): Promise<string> {
      if (!deps.github) {
        throw new Error("GitHub integration is required for check --pr.");
      }
      const threads = await deps.github.unresolvedThreads(options.pr);
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
