export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal_error";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super("validation_failed", 422, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Resource") {
    super("not_found", 404, `${entity} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", 409, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("unauthorized", 401, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Try again later.") {
    super("rate_limited", 429, message);
  }
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}
