import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { ErrorEnvelope, ErrorEnvelopeSchema } from "@fin-rag/shared";

import { logger } from "./logger";

export class AppError extends Error {
  public readonly status: number;

  public readonly code: string;

  public readonly details?: Record<string, unknown>;

  constructor(message: string, options: { status?: number; code?: string; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? "internal_error";
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 400, code: "validation_error", details });
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 404, code: "not_found", details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 401, code: "unauthorized", details });
  }
}

const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ValidationError("Request validation failed", { issues: error.issues });
  }

  if (error instanceof Error) {
    return new AppError(error.message);
  }

  return new AppError("Unknown error", { details: { error } });
};

export const toErrorEnvelope = (error: AppError): ErrorEnvelope => {
  const envelope = {
    code: error.code,
    message: error.message,
    details: error.details
  } satisfies ErrorEnvelope;

  return ErrorEnvelopeSchema.parse(envelope);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const normalized = normalizeError(err);

  if (normalized.status >= 500) {
    logger.error({ err: normalized }, "Unhandled error");
  } else {
    logger.warn({ err: normalized }, "Request failed");
  }

  const envelope = toErrorEnvelope(normalized);
  res.status(normalized.status).json(envelope);
};
