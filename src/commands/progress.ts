import type { ReviewProgress } from "@/core/types.js";

export interface ProgressReporter {
  update(progress: ReviewProgress): void;
  stop(): void;
  fail(message?: string): void;
}

const spinnerFrames = ["-", "\\", "|", "/"];

export function createProgressReporter(stream: NodeJS.WriteStream = process.stderr): ProgressReporter {
  const markers = progressMarkers();
  if (!stream.isTTY) {
    return createLineProgressReporter(stream, markers);
  }

  return createSpinnerProgressReporter(stream, markers);
}

interface ProgressMarkers {
  done: string;
  failed: string;
}

function formatProgress(progress: ReviewProgress): string {
  return progress.detail ? `${progress.message} ${progress.detail}` : progress.message;
}

function createLineProgressReporter(stream: NodeJS.WriteStream, markers: ProgressMarkers): ProgressReporter {
  return {
    update(progress) {
      const marker = progress.status === "complete" ? markers.done : "-";
      stream.write(`${marker} ${formatProgress(progress)}\n`);
    },
    stop() {},
    fail(message) {
      if (message) {
        stream.write(`${markers.failed} ${message}\n`);
      }
    }
  };
}

function createSpinnerProgressReporter(stream: NodeJS.WriteStream, markers: ProgressMarkers): ProgressReporter {
  let timer: NodeJS.Timeout | undefined;
  let frameIndex = 0;
  let current: ReviewProgress | undefined;
  let currentStartedAt = 0;
  let currentLineLength = 0;

  const clearTimer = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const writeLine = (line: string): void => {
    const padding = currentLineLength > line.length ? " ".repeat(currentLineLength - line.length) : "";
    stream.write(`\r${line}${padding}`);
    currentLineLength = line.length;
  };

  const render = (): void => {
    if (!current) return;
    const frame = spinnerFrames[frameIndex % spinnerFrames.length];
    frameIndex += 1;
    writeLine(`${frame} ${formatProgress(current)}${formatRunningDuration(currentStartedAt)}`);
  };

  const finishCurrent = (): void => {
    if (!current) return;
    clearTimer();
    writeLine(`${markers.done} ${formatProgress(current)}${formatDoneDuration(currentStartedAt)}`);
    stream.write("\n");
    current = undefined;
    currentStartedAt = 0;
    currentLineLength = 0;
  };

  return {
    update(progress) {
      finishCurrent();
      if (progress.status === "complete") {
        writeLine(`${markers.done} ${formatProgress(progress)}`);
        stream.write("\n");
        currentLineLength = 0;
        return;
      }

      current = progress;
      currentStartedAt = Date.now();
      frameIndex = 0;
      render();
      timer = setInterval(render, 120);
      timer.unref();
    },
    stop() {
      finishCurrent();
    },
    fail(message = "Review failed.") {
      clearTimer();
      if (current) {
        writeLine(`${markers.failed} ${formatProgress(current)}`);
        stream.write("\n");
        current = undefined;
        currentStartedAt = 0;
        currentLineLength = 0;
      }
      stream.write(`${markers.failed} ${message}\n`);
    }
  };
}

function progressMarkers(): ProgressMarkers {
  if (!supportsUnicode()) {
    return { done: "v", failed: "x" };
  }
  return { done: "✓", failed: "✕" };
}

function supportsUnicode(): boolean {
  if (process.env.TERM === "dumb") {
    return false;
  }
  const locale = [process.env.LC_ALL, process.env.LC_CTYPE, process.env.LANG].filter(Boolean).join(" ");
  return /utf-?8/i.test(locale);
}

function formatRunningDuration(startedAt: number): string {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < 1000) {
    return "";
  }
  return ` (${formatDuration(elapsedMs)} elapsed)`;
}

function formatDoneDuration(startedAt: number): string {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < 1000) {
    return "";
  }
  return ` (${formatDuration(elapsedMs)})`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}
