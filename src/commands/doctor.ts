import type { Command } from "commander";
import { execa } from "execa";
import { loadConfig } from "@/config/load.js";
import { createGitIntegration } from "@/integrations/git.js";
import { providerNames } from "@/commands/providers.js";
import { platformNames } from "@/commands/platforms.js";

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check local tool and provider availability")
    .action(async () => {
      const config = loadConfig();
      const git = createGitIntegration();
      const checks: DoctorCheck[] = [];

      checks.push(await commandCheck("git", "git --version"));
      checks.push({
        name: "git repository",
        ok: await git.isInsideWorkTree(),
        detail: (await git.isInsideWorkTree()) ? "inside a Git repository" : "not inside a Git repository"
      });
      checks.push(await commandCheck("gh", "gh --version"));
      checks.push(await commandCheck("glab", "glab --version"));
      checks.push(await commandCheck("codex", "codex --version"));
      checks.push(await commandCheck("claude", "claude --version"));

      const providerLines = providerNames.map((provider) => {
        if (provider === "mock") return `- mock: available`;
        if (provider === "claude-cli") {
          const claude = checks.find((check) => check.name === "claude");
          return `- claude-cli: ${claude?.ok ? "available" : "missing claude CLI"}`;
        }
        const codex = checks.find((check) => check.name === "codex");
        return `- codex-cli: ${codex?.ok ? "available" : "missing codex CLI"}`;
      });
      const platformLines = platformNames.map((platform) => {
        const check = checks.find((item) => item.name === (platform === "gitlab" ? "glab" : "gh"));
        return `- ${platform}: ${check?.ok ? "available" : `missing ${platform === "gitlab" ? "glab" : "gh"} CLI`}`;
      });

      console.log("localrabbit doctor\n");
      for (const check of checks) {
        console.log(`${check.ok ? "ok" : "fail"} ${check.name}: ${check.detail}`);
      }
      console.log(`\nConfigured provider: ${config.provider}`);
      console.log(`Configured platform: ${config.platform}`);
      console.log("Provider availability:");
      console.log(providerLines.join("\n"));
      console.log("Platform availability:");
      console.log(platformLines.join("\n"));
    });
}

async function commandCheck(name: string, command: string): Promise<DoctorCheck> {
  const [cmd, ...args] = command.split(" ");
  try {
    const { stdout } = await execa(cmd, args);
    return {
      name,
      ok: true,
      detail: stdout.split("\n")[0] || "available"
    };
  } catch {
    return {
      name,
      ok: false,
      detail: "not found"
    };
  }
}
