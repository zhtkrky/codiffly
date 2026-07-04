import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as outputStream } from "node:process";
import type { ReviewComment } from "@/core/types.js";

interface ReviewBrowserState {
  comments: ReviewComment[];
  selected: boolean[];
  index: number;
}

export interface ReviewBrowserResult {
  comments: ReviewComment[];
}

export async function browseReviewComments(diff: string, comments: ReviewComment[]): Promise<ReviewBrowserResult> {
  if (!input.isTTY || !outputStream.isTTY) {
    throw new Error("--tui requires an interactive TTY.");
  }
  if (comments.length === 0) {
    console.log("No review comments to browse.");
    return { comments: [] };
  }

  const state: ReviewBrowserState = {
    comments: comments.map((comment) => ({ ...comment })),
    selected: comments.map(() => true),
    index: 0
  };
  const rl = createInterface({ input, output: outputStream });

  try {
    while (true) {
      renderReviewBrowser(diff, state);
      const answer = normalizeBrowserAction(await rl.question("Action [n/p/s/e/a/q/?]: "));
      if (answer === "next") {
        state.index = Math.min(state.index + 1, state.comments.length - 1);
      } else if (answer === "previous") {
        state.index = Math.max(state.index - 1, 0);
      } else if (answer === "toggle") {
        state.selected[state.index] = !state.selected[state.index];
      } else if (answer === "all") {
        state.selected = state.selected.map(() => true);
      } else if (answer === "edit") {
        const edited = (await rl.question("Replacement body (blank keeps current): ")).trim();
        if (edited) {
          state.comments[state.index] = { ...state.comments[state.index], body: edited };
        }
      } else if (answer === "help") {
        printBrowserHelp();
        await rl.question("Press Enter to continue.");
      } else if (answer === "quit") {
        return { comments: selectedComments(state) };
      } else {
        console.log("Choose n, p, s, e, a, q, or ?.");
      }
    }
  } finally {
    rl.close();
  }
}

export function renderCommentDiffContext(diff: string, comment: ReviewComment, radius = 4): string {
  const filePatch = findFilePatch(diff, comment.path);
  if (!filePatch) {
    return "(No matching diff context found.)";
  }

  const rows = parsePatchRows(filePatch);
  const targetIndex = rows.findIndex((row) => row.newLine === comment.line && row.kind === "add");
  if (targetIndex === -1) {
    return "(No matching changed line found in the diff.)";
  }

  const start = Math.max(0, targetIndex - radius);
  const end = Math.min(rows.length, targetIndex + radius + 1);
  return rows
    .slice(start, end)
    .map((row, index) => formatPatchRow(row, start + index === targetIndex))
    .join("\n");
}

function renderReviewBrowser(diff: string, state: ReviewBrowserState): void {
  const comment = state.comments[state.index];
  const selected = state.selected[state.index];
  const kept = state.selected.filter(Boolean).length;
  const status = selected ? "included" : "skipped";
  outputStream.write("\x1Bc");
  console.log(`codiffly review (${state.index + 1}/${state.comments.length}) - ${kept} selected`);
  console.log(`${comment.severity.toUpperCase()} ${comment.path}:${comment.line} - ${status}`);
  console.log("");
  console.log(comment.body);
  console.log("");
  console.log(renderCommentDiffContext(diff, comment));
  console.log("");
  console.log("n next  p previous  s skip/include  e edit  a include all  q done  ? help");
}

function printBrowserHelp(): void {
  console.log("");
  console.log("n: move to the next comment");
  console.log("p: move to the previous comment");
  console.log("s: toggle whether this comment is included for posting/output");
  console.log("e: edit this comment body");
  console.log("a: include all comments");
  console.log("q: finish browsing");
  console.log("");
}

function selectedComments(state: ReviewBrowserState): ReviewComment[] {
  return state.comments.filter((_, index) => state.selected[index]);
}

function normalizeBrowserAction(answer: string): "next" | "previous" | "toggle" | "edit" | "all" | "quit" | "help" | undefined {
  const normalized = answer.trim().toLowerCase();
  if (["", "n", "next"].includes(normalized)) return "next";
  if (["p", "prev", "previous"].includes(normalized)) return "previous";
  if (["s", "skip", "include", "toggle"].includes(normalized)) return "toggle";
  if (["e", "edit"].includes(normalized)) return "edit";
  if (["a", "all"].includes(normalized)) return "all";
  if (["q", "quit", "done"].includes(normalized)) return "quit";
  if (["?", "h", "help"].includes(normalized)) return "help";
  return undefined;
}

interface PatchRow {
  kind: "context" | "add" | "remove" | "hunk";
  oldLine?: number;
  newLine?: number;
  text: string;
}

function findFilePatch(diff: string, path: string): string | undefined {
  return diff
    .split(/^diff --git /m)
    .filter(Boolean)
    .map((chunk) => `diff --git ${chunk}`)
    .find((patch) => patch.includes(`+++ b/${path}\n`) || patch.includes(`diff --git a/${path} b/${path}\n`));
}

function parsePatchRows(patch: string): PatchRow[] {
  const rows: PatchRow[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      rows.push({ kind: "hunk", text: line });
      continue;
    }
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue;
    }
    if (line.startsWith("+")) {
      rows.push({ kind: "add", newLine, text: line.slice(1) });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      rows.push({ kind: "remove", oldLine, text: line.slice(1) });
      oldLine += 1;
      continue;
    }
    if (line.startsWith(" ") || line === "") {
      rows.push({ kind: "context", oldLine, newLine, text: line.startsWith(" ") ? line.slice(1) : line });
      oldLine += 1;
      newLine += 1;
    }
  }

  return rows;
}

function formatPatchRow(row: PatchRow, target: boolean): string {
  if (row.kind === "hunk") {
    return `    ${row.text}`;
  }
  const marker = target ? ">" : " ";
  const sign = row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " ";
  const oldLabel = row.oldLine === undefined ? "    " : String(row.oldLine).padStart(4);
  const newLabel = row.newLine === undefined ? "    " : String(row.newLine).padStart(4);
  return `${marker} ${oldLabel} ${newLabel} ${sign} ${row.text}`;
}
