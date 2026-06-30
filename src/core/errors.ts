export class LocalRabbitError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "LocalRabbitError";
  }
}

export function toFriendlyError(error: unknown): Error {
  if (error instanceof LocalRabbitError) {
    return error;
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
