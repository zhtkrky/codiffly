import { execa } from "execa";
import type { PullRequestInfo, ReviewComment, ReviewThread } from "@/core/types.js";
import { ensureCommand } from "@/integrations/git.js";
import type { ReviewPlatformIntegration } from "@/integrations/platform.js";

interface GitLabMergeRequest {
  iid: number;
  target_branch: string;
  source_branch: string;
  sha: string;
  web_url?: string;
  diff_refs?: {
    base_sha?: string;
    start_sha?: string;
    head_sha?: string;
  };
}

interface GitLabMergeRequestSummary {
  iid?: number;
}

interface GitLabChange {
  old_path: string;
  new_path: string;
  diff: string;
  new_file?: boolean;
  deleted_file?: boolean;
}

interface GitLabChangesResponse {
  changes?: GitLabChange[];
}

interface GitLabNote {
  body?: string;
  author?: { username?: string };
}

interface GitLabDiscussion {
  id: string;
  resolved?: boolean;
  notes?: GitLabNote[];
  position?: {
    new_path?: string;
    old_path?: string;
    new_line?: number;
    old_line?: number;
  };
}

export function createGitLabIntegration(cwd = process.cwd()): ReviewPlatformIntegration {
  const ensureGlabAvailable = async (): Promise<void> => {
    try {
      await ensureCommand("glab");
    } catch {
      throw new Error("GitLab MR mode requires the glab CLI. Install GitLab CLI and authenticate with `glab auth login`.");
    }
  };

  const apiJson = async <T>(path: string, args: string[] = []): Promise<T> => {
    await ensureGlabAvailable();
    const { stdout } = await execa("glab", ["api", path, ...args], { cwd, maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(stdout) as T;
  };

  const projectPath = async (): Promise<string> => encodeURIComponent(parseGitLabProjectPath(await remoteUrl()));

  const remoteUrl = async (): Promise<string> => {
    const { stdout } = await execa("git", ["remote", "get-url", "origin"], { cwd });
    return stdout.trim();
  };

  const mergeRequest = async (number: number): Promise<GitLabMergeRequest> => {
    const project = await projectPath();
    return apiJson<GitLabMergeRequest>(`projects/${project}/merge_requests/${number}`);
  };

  return {
    name: "GitLab",

    async inferPullRequestNumber(): Promise<number | undefined> {
      try {
        await ensureGlabAvailable();
        const { stdout: branch } = await execa("git", ["branch", "--show-current"], { cwd });
        const sourceBranch = branch.trim();
        if (!sourceBranch) {
          return undefined;
        }
        const { stdout } = await execa(
          "glab",
          ["mr", "list", "--source-branch", sourceBranch, "--state", "opened", "--output", "json"],
          { cwd }
        );
        const parsed = JSON.parse(stdout) as GitLabMergeRequestSummary[];
        return parsed.find((mr) => typeof mr.iid === "number")?.iid;
      } catch {
        return undefined;
      }
    },

    async getPullRequest(number: number): Promise<PullRequestInfo> {
      const mr = await mergeRequest(number);
      return {
        number: mr.iid,
        baseRefName: mr.target_branch,
        headRefName: mr.source_branch,
        headRefOid: mr.sha,
        url: mr.web_url
      };
    },

    async getPullRequestDiff(number: number): Promise<string> {
      const project = await projectPath();
      const response = await apiJson<GitLabChangesResponse>(`projects/${project}/merge_requests/${number}/changes`);
      return (response.changes ?? []).map(formatGitLabChange).join("\n");
    },

    async postReviewComments(pr: PullRequestInfo, comments: ReviewComment[]): Promise<void> {
      if (comments.length === 0) {
        return;
      }

      const project = await projectPath();
      const mr = await mergeRequest(pr.number);
      const baseSha = mr.diff_refs?.base_sha;
      const startSha = mr.diff_refs?.start_sha;
      const headSha = mr.diff_refs?.head_sha ?? mr.sha;
      if (!baseSha || !startSha || !headSha) {
        throw new Error("GitLab did not return MR diff refs required for line comments.");
      }

      for (const comment of comments) {
        await apiJson(`projects/${project}/merge_requests/${pr.number}/discussions`, [
          "--method",
          "POST",
          "-f",
          `body=${comment.body}`,
          "-f",
          "position[position_type]=text",
          "-f",
          `position[base_sha]=${baseSha}`,
          "-f",
          `position[start_sha]=${startSha}`,
          "-f",
          `position[head_sha]=${headSha}`,
          "-f",
          `position[old_path]=${comment.path}`,
          "-f",
          `position[new_path]=${comment.path}`,
          "-f",
          `position[new_line]=${comment.line}`
        ]);
      }
    },

    async unresolvedThreads(prNumber: number): Promise<ReviewThread[]> {
      const project = await projectPath();
      const discussions = await apiJson<GitLabDiscussion[]>(`projects/${project}/merge_requests/${prNumber}/discussions`);
      let checkId = 1;
      return discussions
        .filter((discussion) => !discussion.resolved)
        .map((discussion) => {
          const notes = discussion.notes ?? [];
          const last = notes.at(-1);
          return {
            id: discussion.id,
            check_id: checkId++,
            path: discussion.position?.new_path ?? discussion.position?.old_path,
            line: discussion.position?.new_line ?? discussion.position?.old_line,
            body: last?.body ?? "",
            author: last?.author?.username,
            isResolved: Boolean(discussion.resolved)
          };
        });
    }
  };
}

function parseGitLabProjectPath(remote: string): string {
  const normalized = remote.replace(/\.git$/, "");
  const sshMatch = normalized.match(/git@[^:]+:(.+)$/);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  try {
    const url = new URL(normalized);
    return url.pathname.replace(/^\/+/, "");
  } catch {
    throw new Error(`Could not infer GitLab project path from origin remote: ${remote}`);
  }
}

function formatGitLabChange(change: GitLabChange): string {
  const oldPath = change.deleted_file ? change.old_path : change.old_path;
  const newPath = change.deleted_file ? change.old_path : change.new_path;
  const oldMarker = change.new_file ? "/dev/null" : `a/${oldPath}`;
  const newMarker = change.deleted_file ? "/dev/null" : `b/${newPath}`;
  return [`diff --git a/${oldPath} b/${newPath}`, `--- ${oldMarker}`, `+++ ${newMarker}`, change.diff].join("\n");
}
