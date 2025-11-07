import type { ChunkRecord } from "@fin-rag/shared";

export interface VectorChunkPayload {
  id: string;
  embedding: number[];
  text: string;
  meta: ChunkRecord["meta"];
}

export interface VectorUpsertOptions {
  ticker: string;
  embeddingModel: string;
  chunkSize: number;
  overlap: number;
  rebuild?: boolean;
}

export interface VectorDeleteOptions {
  ticker: string;
  docIds: string[];
}

export interface VectorQueryOptions {
  ticker: string;
  embedding: number[];
  k: number;
  filterDocIds?: string[];
}

export interface VectorQueryResultItem {
  chunkId: string;
  docId: string;
  snippet: string;
  score: number;
  sourceType: ChunkRecord["meta"]["sourceType"];
  metadata: ChunkRecord["meta"];
}

export interface VectorIndexSummary {
  ticker: string;
  vectorCount: number;
  docIds: string[];
  updatedAt: string;
}

export interface IVectorStore {
  upsertChunks(
    chunks: VectorChunkPayload[],
    options: VectorUpsertOptions,
  ): Promise<VectorIndexSummary>;
  deleteByDocIds(options: VectorDeleteOptions): Promise<number>;
  query(options: VectorQueryOptions): Promise<VectorQueryResultItem[]>;
  flushTicker(ticker: string): Promise<void>;
}
