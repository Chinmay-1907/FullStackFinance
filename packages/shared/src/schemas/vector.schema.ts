import { z } from "zod";

export const VectorStoreTypeSchema = z.enum(["faiss", "pinecone"]);

export type VectorStoreType = z.infer<typeof VectorStoreTypeSchema>;

export const VectorManifestSchema = z.object({
  id: z.string().optional(),
  ticker: z.string().min(1),
  embeddingModel: z.string().min(1),
  chunkSize: z.number().int().positive(),
  overlap: z.number().int().nonnegative(),
  vectorStore: VectorStoreTypeSchema,
  docIds: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime({ offset: true }),
});

export type VectorManifest = z.infer<typeof VectorManifestSchema>;

export const ChunkMetadataSchema = z.object({
  docId: z.string(),
  ticker: z.string(),
  sourceType: z.enum(["sec", "transcripts", "news"]),
  sequence: z.number().int().nonnegative(),
  stage: z.literal("chunked"),
  publishedAt: z.string().datetime({ offset: true }).optional(),
});

export const ChunkRecordSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  textHash: z.string().min(1),
  meta: ChunkMetadataSchema,
});

export type ChunkRecord = z.infer<typeof ChunkRecordSchema>;
