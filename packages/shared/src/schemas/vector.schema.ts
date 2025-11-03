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
