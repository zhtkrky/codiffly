import type { ReviewConfig } from "@/core/types.js";
import { createClaudeCliProvider } from "@/providers/claude-cli.js";
import { createCodexCliProvider } from "@/providers/codex-cli.js";
import { createMockProvider } from "@/providers/mock.js";
import type { ReviewProvider } from "@/providers/provider.js";

export const providerNames = ["codex-cli", "claude-cli", "mock"] as const;

export function assertProviderName(value: string | undefined): asserts value is ReviewConfig["provider"] | undefined {
  if (value && !providerNames.includes(value as ReviewConfig["provider"])) {
    throw new Error(`Unknown provider '${value}'. Expected one of: ${providerNames.join(", ")}.`);
  }
}

export function createProvider(config: ReviewConfig): ReviewProvider {
  switch (config.provider) {
    case "mock":
      return createMockProvider();
    case "claude-cli":
      return createClaudeCliProvider(config.review.timeoutSeconds);
    case "codex-cli":
      return createCodexCliProvider(config.review.timeoutSeconds);
  }
}
