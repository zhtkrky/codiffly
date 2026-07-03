export class CodifflyError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "CodifflyError";
  }
}

export function toFriendlyError(error: unknown): Error {
  if (error instanceof CodifflyError) {
    return error;
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
