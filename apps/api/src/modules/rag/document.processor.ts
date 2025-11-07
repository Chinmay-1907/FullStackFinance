/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import { createHash } from "node:crypto";

import type { ChunkRecord, IngestionSource } from "@fin-rag/shared";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import { createModuleLogger } from "../../utils/logger";
import { metrics } from "../../utils/metrics";

export interface DocumentProcessorOptions {
  chunkSize: number;
  chunkOverlap: number;
  maxChunks?: number;
}

export interface ProcessDocumentInput {
  id: string;
  ticker: string;
  sourceType: IngestionSource;
  publishedAt?: string;
  text: string;
}

const tracer = trace.getTracer("rag:document-processor");
const log = createModuleLogger("rag:document-processor");

type ChunkDraft = {
  id: string;
  text: string;
  textHash: string;
  meta: {
    docId: string;
    ticker: string;
    sourceType: IngestionSource;
    sequence: number;
    stage: "chunked";
    publishedAt?: string;
  };
};

export class DocumentProcessor {
  private readonly maxChunks?: number;

  constructor(private readonly options: DocumentProcessorOptions) {
    this.maxChunks = options.maxChunks;
  }

  process(document: ProcessDocumentInput): Promise<ChunkRecord[]> {
    const span = tracer.startSpan("chunk.document");
    span.setAttributes({
      "document.id": document.id,
      "document.ticker": document.ticker,
      "document.source": document.sourceType,
    });

    const start = Date.now();
    try {
      const segments: string[] = this.buildChunks(document.text);
      const limitedSegments = segments.slice(0, this.maxChunks ?? segments.length);
      const drafts: ChunkDraft[] = limitedSegments.map((chunkText, index) =>
        this.createChunkRecord(document, chunkText, index),
      );

      const uniqueDrafts = this.dedupeChunks(drafts);
      const chunkRecords: ChunkRecord[] = uniqueDrafts.map(
        (chunk): ChunkRecord => ({
          ...chunk,
        }),
      );
      const duration = Date.now() - start;

      span.setAttributes({
        "chunk.count": chunkRecords.length,
        "chunk.duration_ms": duration,
      });
      span.setStatus({ code: SpanStatusCode.OK });

      log.info(
        {
          docId: document.id,
          ticker: document.ticker,
          sourceType: document.sourceType,
          chunkCount: chunkRecords.length,
          durationMs: duration,
        },
        "Document chunked",
      );
      metrics.recordChunks(document.ticker, document.sourceType, chunkRecords.length);

      return Promise.resolve(chunkRecords);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      return Promise.reject(error);
    } finally {
      span.end();
    }
  }

  private buildChunks(text: string): string[] {
    const normalized = text.replace(/\r\n?/g, "\n");
    const sections = normalized
      .split(/\n{2,}/)
      .map((section) => section.trim())
      .filter((section) => section.length > 0);

    const { chunkSize, chunkOverlap } = this.options;
    const chunks: string[] = [];
    let current = "";

    const pushCurrent = () => {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        chunks.push(trimmed);
      }
      current = "";
    };

    for (const section of sections) {
      let remaining = section;

      if (section.length > chunkSize) {
        if (current) {
          pushCurrent();
        }

        while (remaining.length > chunkSize) {
          const part = remaining.slice(0, chunkSize);
          chunks.push(part.trim());
          const overlapIndex = Math.max(0, chunkSize - chunkOverlap);
          remaining = remaining.slice(overlapIndex);
        }

        current = remaining;
        continue;
      }

      const candidate = current ? `${current}\n\n${remaining}` : remaining;
      if (candidate.length <= chunkSize) {
        current = candidate;
        continue;
      }

      pushCurrent();
      current = remaining;
    }

    if (current) {
      pushCurrent();
    }

    return chunks;
  }

  private dedupeChunks(chunks: ChunkDraft[]): ChunkDraft[] {
    const seen = new Set<string>();
    const result: ChunkDraft[] = [];

    for (const chunk of chunks) {
      const hash = chunk.textHash;
      if (seen.has(hash)) {
        continue;
      }
      seen.add(hash);
      result.push(chunk);
    }

    return result;
  }

  private createChunkRecord(
    document: ProcessDocumentInput,
    text: string,
    sequence: number,
  ): ChunkDraft {
    const trimmed = text.trim();
    const textHash = createHash("sha256").update(trimmed).digest("hex");

    return {
      id: `${document.id}-${sequence}`,
      text: trimmed,
      textHash,
      meta: {
        docId: document.id,
        ticker: document.ticker.toUpperCase(),
        sourceType: document.sourceType,
        sequence,
        stage: "chunked",
        publishedAt: document.publishedAt,
      },
    };
  }
}
