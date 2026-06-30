import type { Command } from "commander";
import { writeDefaultConfig } from "@/config/load.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create .localrabbit.yml with sensible defaults")
    .action(() => {
      const path = writeDefaultConfig();
      console.log(`Created ${path}`);
    });
}
