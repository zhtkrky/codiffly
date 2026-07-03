import type { ReviewConfig } from "@/core/types.js";
import { rulesForPreset } from "@/rules/builtin.js";

export const defaultConfig: ReviewConfig = {
  provider: "codex-cli",
  platform: "github",
  preset: "recommended",
  focus: "balanced",
  model: "default",
  review: {
    contextLines: 1,
    maxDiffBytes: 180000,
    maxRiskyFiles: 8,
    maxCommentTargets: 400,
    timeoutSeconds: 180
  },
  github: {
    post: false
  },
  exclude: [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "dist/**",
    "build/**",
    ".next/**",
    "coverage/**",
    "*.min.js",
    "*.map"
  ],
  rules: rulesForPreset("recommended"),
  plugins: []
};
