#!/usr/bin/env node
import { Command } from "commander";
import { registerCheckCommand } from "@/commands/check.js";
import { registerDoctorCommand } from "@/commands/doctor.js";
import { registerInitCommand } from "@/commands/init.js";
import { registerReviewCommand } from "@/commands/review.js";

const program = new Command();

program
  .name("codiffly")
  .description("🐨 Local-first AI code review for Git diffs, GitHub PRs, and GitLab MRs")
  .version("0.1.0");

registerInitCommand(program);
registerReviewCommand(program);
registerCheckCommand(program);
registerDoctorCommand(program);

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
