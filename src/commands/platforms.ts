import type { PlatformName } from "@/core/types.js";
import { createGitHubIntegration } from "@/integrations/github.js";
import { createGitLabIntegration } from "@/integrations/gitlab.js";
import type { ReviewPlatformIntegration } from "@/integrations/platform.js";

export const platformNames = ["github", "gitlab"] as const;

export function assertPlatformName(value: string | undefined): asserts value is PlatformName | undefined {
  if (value && !platformNames.includes(value as PlatformName)) {
    throw new Error(`Unknown platform '${value}'. Expected one of: ${platformNames.join(", ")}.`);
  }
}

export function createPlatformIntegration(platform: PlatformName): ReviewPlatformIntegration {
  switch (platform) {
    case "gitlab":
      return createGitLabIntegration();
    case "github":
      return createGitHubIntegration();
  }
}
