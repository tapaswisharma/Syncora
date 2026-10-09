export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CONFIRMATION_REQUIRED"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "UPSTREAM_ERROR"
  | "PG_CONNECTION_FAILED"
  | "PG_AUTH_FAILED"
  | "PG_TIMEOUT"
  | "PG_QUERY_FAILED"
  | "PG_CONSTRAINT_VIOLATION"
  | "GOOGLE_NOT_CONNECTED"
  | "GOOGLE_AUTH_EXPIRED"
  | "GOOGLE_PERMISSION_DENIED"
  | "GOOGLE_NOT_FOUND"
  | "GOOGLE_RATE_LIMITED"
  | "GOOGLE_API_ERROR"
  | "INVALID_MAPPING"
  | "SCHEMA_MISMATCH"
  | "SYNC_IN_PROGRESS"
  | "INTERNAL_ERROR";

/**
 * An error that is safe to show to the user. `message` must be written for humans;
 * technical details go to `cause`, which is only ever logged server-side.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, options?: { details?: unknown; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = options?.details;
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, { details });
export const notFound = (message: string) => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string, details?: unknown) => new AppError(409, "CONFLICT", message, { details });

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
