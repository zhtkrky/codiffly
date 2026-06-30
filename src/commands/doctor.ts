import type { Command } from "commander";
import { execa } from "execa";
import { loadConfig } from "@/config/load.js";
import { createGitIntegration } from "@/integrations/git.js";
import { providerNames } from "@/commands/providers.js";

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
      checks.push(await commandCheck("codex", "codex --version"));

      const providerLines = providerNames.map((provider) => {
        if (provider === "mock") return `- mock: available`;
        const codex = checks.find((check) => check.name === "codex");
        return `- codex-cli: ${codex?.ok ? "available" : "missing codex CLI"}`;
      });

      console.log("localrabbit doctor\n");
      for (const check of checks) {
        console.log(`${check.ok ? "ok" : "fail"} ${check.name}: ${check.detail}`);
      }
      console.log(`\nConfigured provider: ${config.provider}`);
      console.log("Provider availability:");
      console.log(providerLines.join("\n"));
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
