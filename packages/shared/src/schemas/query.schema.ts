import { z } from "zod";

export const CitationSchema = z.object({
  docId: z.string().min(1),
  snippet: z.string().min(1),
  url: z.string().url().optional(),
  score: z.number().nonnegative().optional(),
  sourceType: z.string().optional()
});

export type Citation = z.infer<typeof CitationSchema>;

export const QueryRequestSchema = z.object({
  ticker: z.string().trim().min(1),
  question: z.string().trim().min(1),
  k: z.number().int().positive().max(20).default(6),
  model: z.string().optional()
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const QueryResponseSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(CitationSchema).min(1),
  summary: z.string().optional(),
  latencyMs: z.number().nonnegative().optional()
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;
