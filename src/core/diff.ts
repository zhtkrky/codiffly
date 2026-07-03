import { readFileSync } from "node:fs";
import type { ChangedFile } from "@/core/types.js";

export type DiffFile = ChangedFile;

export function readDiffFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function splitDiffByFile(diff: string): DiffFile[] {
  const chunks = diff.split(/^diff --git /m).filter(Boolean);
  return chunks.map((chunk) => {
    const patch = `diff --git ${chunk}`;
    const path = extractPathFromPatch(patch);
    return {
      path,
      patch,
      addedLines: countMatchingLines(patch, /^\+(?!\+\+)/),
      removedLines: countMatchingLines(patch, /^-(?!--)/)
    };
  });
}

export function extractPathFromPatch(patch: string): string {
  const plusLine = patch.match(/^\+\+\+ b\/(.+)$/m);
  if (plusLine?.[1] && plusLine[1] !== "/dev/null") {
    return plusLine[1];
  }

  const gitLine = patch.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  return gitLine?.[2] ?? gitLine?.[1] ?? "unknown";
}

export function filterDiffByPaths(diff: string, paths: string[]): string {
  const allowed = new Set(paths);
  return splitDiffByFile(diff)
    .filter((file) => allowed.has(file.path))
    .map((file) => file.patch.trimEnd())
    .join("\n");
}

export function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function countMatchingLines(value: string, regex: RegExp): number {
  return value.split("\n").filter((line) => regex.test(line)).length;
}
