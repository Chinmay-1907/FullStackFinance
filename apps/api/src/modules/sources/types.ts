import type { IngestionSource } from "@fin-rag/shared";

export interface RawDocumentPayload {
  buffer: Buffer;
  filename: string;
  contentType?: string;
  contentLength?: number;
}

export interface NormalizedSourceDocument {
  sourceType: IngestionSource;
  ticker: string;
  title?: string;
  url?: string;
  formType?: string;
  textPath: string;
  textHash: string;
  bytes: number;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface SourceFetchParams {
  limit?: number;
  cursor?: string;
}
