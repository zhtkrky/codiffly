import type { Reporter } from "@/core/types.js";

export function renderJson<T>(input: T): string {
  return JSON.stringify(input, null, 2);
}

export function createJsonReporter<T>(): Reporter<T> {
  return { render: renderJson };
}
