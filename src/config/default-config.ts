import type { ReviewConfig } from "@/core/types.js";

export const defaultConfig: ReviewConfig = {
  provider: "codex-cli",
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
  rules: ["security", "performance", "tests", "accessibility", "database-migration-safety"],
  plugins: []
};
