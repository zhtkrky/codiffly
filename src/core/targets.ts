import type { ChangedLineTarget } from "@/core/types.js";

export function extractChangedLineTargets(diff: string, maxTargets: number): ChangedLineTarget[] {
  const targets: ChangedLineTarget[] = [];
  let currentPath: string | undefined;
  let newLine = 0;

  for (const line of diff.split("\n")) {
    const fileHeader = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileHeader) {
      currentPath = fileHeader[1] === "/dev/null" ? undefined : fileHeader[1];
      continue;
    }

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (!currentPath || line.startsWith("diff --git")) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      targets.push({
        id: targets.length + 1,
        path: currentPath,
        line: newLine,
        kind: "added"
      });
      newLine += 1;
    } else if (line.startsWith(" ") || line === "") {
      newLine += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      continue;
    }

    if (targets.length >= maxTargets) {
      break;
    }
  }

  return targets;
}

export function formatTargetsForPrompt(targets: ChangedLineTarget[]): string {
  return targets.map((target) => `${target.id}: ${target.path}:${target.line}`).join("\n");
}
