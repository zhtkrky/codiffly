import { execa } from "execa";
import { LocalRabbitError } from "@/core/errors.js";

export interface GitIntegration {
  ensureGitAvailable(): Promise<void>;
  isInsideWorkTree(): Promise<boolean>;
  ensureInsideWorkTree(): Promise<void>;
  defaultBaseBranch(): Promise<string>;
  diff(base: string, head: string, contextLines: number): Promise<string>;
  fetch(ref: string): Promise<void>;
}

export function createGitIntegration(cwd = process.cwd()): GitIntegration {
  const tryGit = async (args: string[]): Promise<string | undefined> => {
    try {
      const { stdout } = await execa("git", args, { cwd });
      return stdout;
    } catch {
      return undefined;
    }
  };

  const revExists = async (ref: string): Promise<boolean> => Boolean(await tryGit(["rev-parse", "--verify", ref]));

  const ensureGitAvailable = async (): Promise<void> => {
    await ensureCommand("git");
  };

  const isInsideWorkTree = async (): Promise<boolean> => {
    try {
      const { stdout } = await execa("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  };

  const ensureInsideWorkTree = async (): Promise<void> => {
    await ensureGitAvailable();
    if (!(await isInsideWorkTree())) {
      throw new LocalRabbitError("Not inside a Git repository. Run this command from a repository or use --diff <file>.", "NOT_GIT_REPO");
    }
  };

  return {
    ensureGitAvailable,
    isInsideWorkTree,
    ensureInsideWorkTree,
    async defaultBaseBranch(): Promise<string> {
      await ensureInsideWorkTree();

      const originHead = await tryGit(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
      if (originHead) {
        return originHead.trim();
      }

      if (await revExists("origin/main")) return "origin/main";
      if (await revExists("origin/master")) return "origin/master";
      throw new Error("Could not detect a default base branch. Pass --base explicitly.");
    },
    async diff(base: string, head: string, contextLines: number): Promise<string> {
      await ensureInsideWorkTree();
      const { stdout } = await execa("git", ["diff", `--unified=${contextLines}`, "--no-ext-diff", `${base}...${head}`], {
        cwd,
        maxBuffer: 50 * 1024 * 1024
      });
      return stdout;
    },
    async fetch(ref: string): Promise<void> {
      await execa("git", ["fetch", "origin", ref], { cwd });
    }
  };
}

export async function ensureCommand(command: string): Promise<void> {
  try {
    await execa(command, ["--version"]);
  } catch {
    throw new LocalRabbitError(`Required command not found: ${command}`, "MISSING_COMMAND");
  }
}
