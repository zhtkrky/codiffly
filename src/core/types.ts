export type Severity = "blocking" | "suggestion" | "question" | "nit";
export type ProviderName = "codex-cli" | "claude-cli" | "mock";
export type PlatformName = "github" | "gitlab";

export interface ReviewConfig {
  provider: ProviderName;
  platform: PlatformName;
  model: string;
  review: {
    contextLines: number;
    maxDiffBytes: number;
    maxRiskyFiles: number;
    maxCommentTargets: number;
    timeoutSeconds: number;
  };
  github: {
    post: boolean;
  };
  exclude: string[];
  rules: string[];
  plugins: string[];
}

export interface ChangedFile {
  path: string;
  patch: string;
  addedLines: number;
  removedLines: number;
}

export interface ReviewRule {
  name: string;
  description?: string;
  appliesTo(file: ChangedFile): boolean;
  buildPromptContext(file: ChangedFile): string | Promise<string>;
}

export interface ChangedLineTarget {
  id: number;
  path: string;
  line: number;
  kind: "added" | "context";
}

export interface ReviewInput {
  diff: string;
  targets: ChangedLineTarget[];
  rules: string[];
  ruleContext?: string;
  model: string;
  metadata?: Record<string, unknown>;
}

export interface RawReviewComment {
  target_id: number;
  body: string;
  severity: Severity;
}

export interface ReviewComment extends RawReviewComment {
  path: string;
  line: number;
}

export interface ReviewResult {
  comments: RawReviewComment[];
}

export interface MappedReviewResult {
  comments: ReviewComment[];
  skipped: number;
}

export interface ThreadCheckItem {
  check_id: number;
  status: "addressed" | "not_addressed" | "unclear";
  summary: string;
  evidence: string;
  next_action: string;
}

export interface ReviewThread {
  id: string;
  check_id: number;
  path?: string;
  line?: number;
  body: string;
  author?: string;
  isResolved: boolean;
}

export interface ThreadCheckInput {
  diff?: string;
  threads: ReviewThread[];
  model: string;
}

export interface ThreadCheckResult {
  checks: ThreadCheckItem[];
}

export interface Reporter<TInput = MappedReviewResult | ThreadCheckResult> {
  render(input: TInput): string;
}

export interface ReviewRunOptions {
  base?: string;
  head?: string;
  diffFile?: string;
  pr?: number;
  post?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

export interface CheckRunOptions {
  pr: number;
  resolve?: boolean;
  yes?: boolean;
}

export interface PullRequestInfo {
  number: number;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  url?: string;
}

export interface ReviewRunResult {
  markdown: string;
  result: MappedReviewResult;
  dryRun: boolean;
  posted: boolean;
  postEligible: number;
}
