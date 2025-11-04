import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "UPSTREAM_ERROR",
  "VALIDATION_ERROR"
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorEnvelopeSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.any()).optional(),
  requestId: z.string().optional(),
  status: z.number().int().optional()
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
