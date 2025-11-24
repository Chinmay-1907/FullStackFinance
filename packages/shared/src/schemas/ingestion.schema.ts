import { z } from "zod";

export const IngestionSourceSchema = z.enum(["sec", "transcripts", "news"]);

export type IngestionSource = z.infer<typeof IngestionSourceSchema>;

export const IngestionStartRequestSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1, { message: "Ticker is required" })
    .regex(/^[A-Z.]{1,10}$/i, { message: "Ticker must be alphanumeric" }),
  sources: z.array(IngestionSourceSchema).min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export type IngestionStartRequest = z.infer<typeof IngestionStartRequestSchema>;

export const IngestionStageNameSchema = z.enum([
  "download",
  "ocr",
  "review",
  "clean",
  "chunk",
  "embed",
  "persist",
]);

export type IngestionStageName = z.infer<typeof IngestionStageNameSchema>;

export const JobStageStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export type JobStageStatus = z.infer<typeof JobStageStatusSchema>;

export const IngestionStageSchema = z.object({
  name: IngestionStageNameSchema,
  status: JobStageStatusSchema,
  progress: z.number().min(0).max(1).default(0),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
      details: z.record(z.any()).optional(),
    })
    .optional(),
});

export type IngestionStage = z.infer<typeof IngestionStageSchema>;

export const IngestionStatusSchema = z.object({
  jobId: z.string().min(1),
  ticker: z.string().min(1),
  status: z.enum(["queued", "running", "failed", "completed", "awaiting_approval"]),
  sources: z.array(IngestionSourceSchema).default([]),
  progress: z.number().min(0).max(1),
  currentStage: z.string().nullable(),
  stages: z.array(IngestionStageSchema),
  startedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type IngestionStatus = z.infer<typeof IngestionStatusSchema>;

export const IngestionDocumentSchema = z.object({
  id: z.string().min(1),
  ticker: z.string().min(1),
  sourceType: IngestionSourceSchema,
  formType: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
  bytes: z.number().int().nonnegative().nullable().optional(),
  jobId: z.string().optional(),
  approvalStatus: z.enum(["pending", "approved", "rejected", "processed"]).optional(),
  contentPreview: z.string().optional(),
});

export const IngestionDocumentsResponseSchema = z.object({
  documents: z.array(IngestionDocumentSchema),
});

export type IngestionDocument = z.infer<typeof IngestionDocumentSchema>;
export type IngestionDocumentsResponse = z.infer<typeof IngestionDocumentsResponseSchema>;

export const IngestionQueueJobSchema = z.object({
  jobId: z.string().min(1),
  ticker: z.string().min(1),
  sources: z.array(IngestionSourceSchema).nonempty(),
  retryCount: z.number().int().min(0).default(0),
  requestedAt: z.string().datetime({ offset: true }).optional(),
  startStage: IngestionStageNameSchema.optional(),
});

export type IngestionQueueJob = z.infer<typeof IngestionQueueJobSchema>;

export const EmbeddingQueueJobSchema = z.object({
  jobId: z.string().min(1),
  ticker: z.string().min(1),
  documentIds: z.array(z.string().min(1)).nonempty(),
  embeddingModel: z.string().min(1),
  retryCount: z.number().int().min(0).default(0),
});

export type EmbeddingQueueJob = z.infer<typeof EmbeddingQueueJobSchema>;

export const OcrQueueJobSchema = z.object({
  jobId: z.string().min(1),
  documentId: z.string().min(1),
  sourcePath: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  retryCount: z.number().int().min(0).default(0),
});

export type OcrQueueJob = z.infer<typeof OcrQueueJobSchema>;
