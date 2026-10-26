export class PolymarketError extends Error {
  public readonly code: string;
  public readonly status: number | null;
  public readonly retryable: boolean;
  public readonly details: string | null;

  public constructor(
    message: string,
    options: {
      code: string;
      status?: number | null;
      retryable?: boolean;
      details?: string | null;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'PolymarketError';
    this.code = options.code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? null;
  }
}

export function toPolymarketError(
  error: unknown,
  fallbackCode = 'provider_error',
): PolymarketError {
  if (error instanceof PolymarketError) {
    return error;
  }
  if (error instanceof Error) {
    return new PolymarketError(error.message, {
      code: fallbackCode,
      cause: error,
    });
  }
  return new PolymarketError('unknown provider error', {
    code: fallbackCode,
    details: String(error),
  });
}
