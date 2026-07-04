import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as outputStream } from "node:process";
import type { ReviewComment } from "@/core/types.js";

type BrowserAction = "next" | "previous" | "toggle" | "edit" | "all" | "quit" | "help";
type PatchRowByPath = Map<string, PatchRow[]>;

const ACTION_ALIASES: Record<string, BrowserAction> = {
  "": "next",
  n: "next",
  next: "next",
  p: "previous",
  prev: "previous",
  previous: "previous",
  s: "toggle",
  skip: "toggle",
  include: "toggle",
  toggle: "toggle",
  e: "edit",
  edit: "edit",
  a: "all",
  all: "all",
  q: "quit",
  quit: "quit",
  done: "quit",
  "?": "help",
  h: "help",
  help: "help"
};

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

  const rowsByPath = buildPatchRowsByPath(diff);
  const state: ReviewBrowserState = {
    comments: comments.map((comment) => ({ ...comment })),
    selected: comments.map(() => true),
    index: 0
  };
  const rl = createInterface({ input, output: outputStream });

  try {
    while (true) {
      renderReviewBrowser(rowsByPath, state);
      const answer = normalizeBrowserAction(await rl.question("Action [n/p/s/e/a/q/?]: "));
      if (answer === "quit") {
        return { comments: selectedComments(state) };
      }
      if (!answer) {
        console.log("Choose n, p, s, e, a, q, or ?.");
        continue;
      }
      await applyBrowserAction(answer, state, rl);
    }
  } finally {
    rl.close();
  }
}

export function renderCommentDiffContext(diff: string, comment: ReviewComment, radius = 4): string {
  return renderCommentRowsContext(buildPatchRowsByPath(diff), comment, radius);
}

function renderCommentRowsContext(rowsByPath: PatchRowByPath, comment: ReviewComment, radius = 4): string {
  const rows = rowsByPath.get(comment.path);
  if (!rows) return "(No matching diff context found.)";

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

async function applyBrowserAction(
  action: Exclude<BrowserAction, "quit">,
  state: ReviewBrowserState,
  rl: ReturnType<typeof createInterface>
): Promise<void> {
  if (action === "next") {
    state.index = Math.min(state.index + 1, state.comments.length - 1);
  } else if (action === "previous") {
    state.index = Math.max(state.index - 1, 0);
  } else if (action === "toggle") {
    state.selected[state.index] = !state.selected[state.index];
  } else if (action === "all") {
    state.selected.fill(true);
  } else if (action === "edit") {
    const edited = (await rl.question("Replacement body (blank keeps current): ")).trim();
    if (edited) {
      state.comments[state.index] = { ...state.comments[state.index], body: edited };
    }
  } else if (action === "help") {
    printBrowserHelp();
    await rl.question("Press Enter to continue.");
  }
}

function renderReviewBrowser(rowsByPath: PatchRowByPath, state: ReviewBrowserState): void {
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
  console.log(renderCommentRowsContext(rowsByPath, comment));
  console.log("");
  console.log("n next  p previous  s skip/include  e edit  a include all  q done  ? help");
}

function printBrowserHelp(): void {
  console.log(`
n: move to the next comment
p: move to the previous comment
s: toggle whether this comment is included for posting/output
e: edit this comment body
a: include all comments
q: finish browsing
`);
}

function selectedComments(state: ReviewBrowserState): ReviewComment[] {
  return state.comments.filter((_, index) => state.selected[index]);
}

function normalizeBrowserAction(answer: string): BrowserAction | undefined {
  return ACTION_ALIASES[answer.trim().toLowerCase()];
}

interface PatchRow {
  kind: "context" | "add" | "remove" | "hunk";
  oldLine?: number;
  newLine?: number;
  text: string;
}

function buildPatchRowsByPath(diff: string): PatchRowByPath {
  return new Map(
    diff
    .split(/^diff --git /m)
    .filter(Boolean)
    .map((chunk) => `diff --git ${chunk}`)
      .map((patch) => [extractPatchPath(patch), parsePatchRows(patch)] as const)
      .filter((entry): entry is readonly [string, PatchRow[]] => entry[0] !== undefined)
  );
}

function extractPatchPath(patch: string): string | undefined {
  const plusLine = patch.match(/^\+\+\+ b\/(.+)$/m);
  if (plusLine?.[1] && plusLine[1] !== "/dev/null") {
    return plusLine[1];
  }

  const gitLine = patch.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  return gitLine?.[2] ?? gitLine?.[1];
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
    if (isPatchHeader(line)) {
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
  const oldLabel = formatLineNumber(row.oldLine);
  const newLabel = formatLineNumber(row.newLine);
  return `${marker} ${oldLabel} ${newLabel} ${sign} ${row.text}`;
}

function isPatchHeader(line: string): boolean {
  return line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ");
}

function formatLineNumber(line: number | undefined): string {
  return line === undefined ? "    " : String(line).padStart(4);
}
