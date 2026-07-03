import { filterDiffByPaths, splitDiffByFile, type DiffFile } from "@/core/diff.js";

const riskyPathParts = [
  "auth",
  "security",
  "payment",
  "billing",
  "permission",
  "migration",
  "database",
  "infra",
  "config"
];

const riskyExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".sql", ".yml", ".yaml"]);
const riskyFileNames = new Set(["package.json", "Dockerfile", "docker-compose.yml", "schema.prisma", "terraform.tf"]);

export function isExcludedPath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globMatch(path, pattern));
}

export function filterExcludedFiles(diff: string, patterns: string[]): string {
  return splitDiffByFile(diff)
    .filter((file) => !isExcludedPath(file.path, patterns))
    .map((file) => file.patch.trimEnd())
    .join("\n");
}

export function limitDiffToRiskyFiles(diff: string, maxFiles: number): string {
  const selected = splitDiffByFile(diff)
    .map((file) => ({ file, score: riskScore(file) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map(({ file }) => file.path);

  return filterDiffByPaths(diff, selected);
}

export function riskScore(file: DiffFile): number {
  const churn = file.addedLines + file.removedLines;
  const lowerPath = file.path.toLowerCase();
  const extension = lowerPath.includes(".") ? lowerPath.slice(lowerPath.lastIndexOf(".")) : "";
  const fileName = file.path.split("/").at(-1) ?? file.path;

  let score = Math.min(churn, 500);
  if (riskyExtensions.has(extension)) score += 80;
  if (riskyFileNames.has(fileName)) score += 120;
  if (riskyPathParts.some((part) => lowerPath.includes(part))) score += 100;
  if (/\b(test|spec)\b/i.test(file.path)) score -= 30;

  return score;
}

function globMatch(path: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    return path.startsWith(pattern.slice(0, -3));
  }
  if (pattern.startsWith("*")) {
    return path.endsWith(pattern.slice(1));
  }
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(path);
  }
  return path === pattern || path.startsWith(`${pattern}/`);
}
