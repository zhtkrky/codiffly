import { execa } from "execa";
import type { ReviewComment, ReviewThread, PullRequestInfo } from "@/core/types.js";
import { ensureCommand } from "@/integrations/git.js";
import type { ReviewPlatformIntegration } from "@/integrations/platform.js";

interface RepoInfo {
  owner: { login: string };
  name: string;
}

export interface GitHubIntegration extends ReviewPlatformIntegration {
  ensureGhAvailable(): Promise<void>;
}

export function createGitHubIntegration(cwd = process.cwd()): GitHubIntegration {
  const ensureGhAvailable = async (): Promise<void> => {
    try {
      await ensureCommand("gh");
    } catch {
      throw new Error("GitHub PR mode requires the gh CLI. Install GitHub CLI and authenticate with `gh auth login`.");
    }
  };

  const repoInfo = async (): Promise<RepoInfo> => {
    const { stdout } = await execa("gh", ["repo", "view", "--json", "owner,name"], { cwd });
    return JSON.parse(stdout) as RepoInfo;
  };

  return {
    name: "GitHub",
    ensureGhAvailable,
    async inferPullRequestNumber(): Promise<number | undefined> {
      try {
        await ensureGhAvailable();
        const { stdout } = await execa("gh", ["pr", "view", "--json", "number"], { cwd });
        const parsed = JSON.parse(stdout) as { number?: number };
        return parsed.number;
      } catch {
        return undefined;
      }
    },

    async getPullRequest(number: number): Promise<PullRequestInfo> {
      await ensureGhAvailable();
      const { stdout } = await execa("gh", ["pr", "view", String(number), "--json", "number,baseRefName,headRefName,headRefOid,url"], {
        cwd
      });
      return JSON.parse(stdout) as PullRequestInfo;
    },

    async getPullRequestDiff(number: number): Promise<string> {
      await ensureGhAvailable();
      const { stdout } = await execa("gh", ["pr", "diff", String(number), "--patch", "--color=never"], {
        cwd,
        maxBuffer: 50 * 1024 * 1024
      });
      return stdout;
    },

    async postReviewComments(pr: PullRequestInfo, comments: ReviewComment[]): Promise<void> {
      if (comments.length === 0) {
        return;
      }

      const repo = await repoInfo();
      for (const comment of comments) {
        await execa(
          "gh",
          [
            "api",
            `repos/${repo.owner.login}/${repo.name}/pulls/${pr.number}/comments`,
            "--method",
            "POST",
            "--field",
            `body=${comment.body}`,
            "--field",
            `commit_id=${pr.headRefOid}`,
            "--field",
            `path=${comment.path}`,
            "--field",
            `line=${comment.line}`,
            "--field",
            "side=RIGHT"
          ],
          { cwd }
        );
      }
    },

    async unresolvedThreads(prNumber: number): Promise<ReviewThread[]> {
      await ensureGhAvailable();
      const repo = await repoInfo();
      const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
                path
                line
                comments(first: 20) {
                  nodes {
                    body
                    author { login }
                  }
                }
              }
            }
          }
        }
      }
    `;

      const { stdout } = await execa(
        "gh",
        [
          "api",
          "graphql",
          "-f",
          `query=${query}`,
          "-F",
          `owner=${repo.owner.login}`,
          "-F",
          `repo=${repo.name}`,
          "-F",
          `number=${prNumber}`
        ],
        { cwd, maxBuffer: 10 * 1024 * 1024 }
      );

      const parsed = JSON.parse(stdout);
      const nodes = parsed.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
      let checkId = 1;
      return nodes
        .filter((node: { isResolved: boolean }) => !node.isResolved)
        .map((node: { id: string; isResolved: boolean; path?: string; line?: number; comments?: { nodes?: Array<{ body: string; author?: { login: string } }> } }) => {
          const comments = node.comments?.nodes ?? [];
          const last = comments.at(-1);
          return {
            id: node.id,
            check_id: checkId++,
            path: node.path,
            line: node.line,
            body: last?.body ?? "",
            author: last?.author?.login,
            isResolved: node.isResolved
          };
        });
    }
  };
}
