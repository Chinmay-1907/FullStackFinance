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

export const JobStageStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export type JobStageStatus = z.infer<typeof JobStageStatusSchema>;

export const IngestionStageSchema = z.object({
  name: z.string().min(1),
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
  status: z.enum(["queued", "running", "failed", "completed"]),
  progress: z.number().min(0).max(1),
  currentStage: z.string().nullable(),
  stages: z.array(IngestionStageSchema),
  startedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type IngestionStatus = z.infer<typeof IngestionStatusSchema>;
