import { ErrorEnvelopeSchema, type ErrorCode, type ErrorEnvelope } from "@fin-rag/shared";
import { ZodError } from "zod";

type ErrorDetails = Record<string, unknown> | undefined;

export interface AppErrorOptions extends Omit<ErrorOptions, "cause"> {
  code?: ErrorCode;
  status?: number;
  cause?: unknown;
  details?: ErrorDetails;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetails;
  override readonly cause?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.status = options.status ?? 500;
    this.details = options.details;
    this.cause = options.cause;
  }

  toEnvelope(requestId?: string): ErrorEnvelope {
    const envelope: ErrorEnvelope = {
      code: this.code,
      message: this.message,
      status: this.status,
      ...(this.details ? { details: this.details } : {}),
      ...(requestId ? { requestId } : {}),
    };

    return ErrorEnvelopeSchema.parse(envelope);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, {
      ...options,
      code: "VALIDATION_ERROR",
      status: options.status ?? 400,
    });
  }

  static fromZod(error: ZodError, requestId?: string) {
    return new ValidationError("Invalid request payload", {
      details: {
        issues: error.issues,
        flattened: error.flatten(),
        requestId,
      },
      cause: error,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, {
      ...options,
      code: "NOT_FOUND",
      status: options.status ?? 404,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, {
      ...options,
      code: "CONFLICT",
      status: options.status ?? 409,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", options: AppErrorOptions = {}) {
    super(message, {
      ...options,
      code: "UNAUTHORIZED",
      status: options.status ?? 401,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", options: AppErrorOptions = {}) {
    super(message, {
      ...options,
      code: "FORBIDDEN",
      status: options.status ?? 403,
    });
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const createErrorEnvelope = (error: unknown, requestId?: string): ErrorEnvelope => {
  if (error instanceof AppError) {
    return error.toEnvelope(requestId);
  }

  if (error instanceof ZodError) {
    return ValidationError.fromZod(error, requestId).toEnvelope(requestId);
  }

  const fallback = new AppError("An unexpected error occurred", {
    code: "INTERNAL_ERROR",
    status: 500,
    cause: error,
  });

  return fallback.toEnvelope(requestId);
};
