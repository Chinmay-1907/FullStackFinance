import type { VectorStoreType } from "@fin-rag/shared";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import { VectorManifestModel, type VectorManifestDocument } from "../../db/models";
import { getVectorStoreSelection } from "../config/config.service";
import { getRetryConfig } from "../config/feature-flags";
import { executeWithRetry } from "../../utils/retry";
import { createModuleLogger } from "../../utils/logger";
import { getVectorStore } from "./vector-store/vector-store.factory";
import type {
  IVectorStore,
  VectorChunkPayload,
  VectorQueryOptions,
  VectorQueryResultItem,
} from "./vector-store/vector-store.types";

const tracer = trace.getTracer("rag:vectorstore");
const log = createModuleLogger("rag:vectorstore");

export interface VectorUpsertRequest {
  ticker: string;
  vectors: VectorChunkPayload[];
  embeddingModel: string;
  chunkSize: number;
  overlap: number;
  rebuild?: boolean;
}

export interface VectorDeleteRequest {
  ticker: string;
  docIds: string[];
}

export class VectorStoreService {
  private readonly retryConfig = getRetryConfig();

  constructor(
    private readonly vectorStore: IVectorStore = getVectorStore(),
    private readonly manifestModel = VectorManifestModel,
    private readonly storeType: VectorStoreType = getVectorStoreSelection(),
  ) {}

  async upsertVectors(request: VectorUpsertRequest): Promise<VectorManifestDocument> {
    const ticker = request.ticker.trim().toUpperCase();
    const docIds = this.extractDocIds(request.vectors);

    return tracer.startActiveSpan("vectorstore.upsert", async (span) => {
      span.setAttributes({
        "vectorstore.ticker": ticker,
        "vectorstore.doc_count": docIds.length,
        "vectorstore.rebuild": Boolean(request.rebuild),
      });

      try {
        await executeWithRetry(
          () =>
            this.vectorStore.upsertChunks(request.vectors, {
              ticker,
              embeddingModel: request.embeddingModel,
              chunkSize: request.chunkSize,
              overlap: request.overlap,
              rebuild: request.rebuild,
            }),
          this.buildRetryOptions(),
        );

        const manifest = await this.manifestModel.upsertManifest(
          {
            ticker,
            embeddingModel: request.embeddingModel,
            chunkSize: request.chunkSize,
            overlap: request.overlap,
            vectorStore: this.storeType,
            docIds,
          },
          { replaceDocIds: request.rebuild },
        );

        log.info(
          { ticker, docIds: docIds.length, rebuild: request.rebuild },
          "Vector manifest updated",
        );

        span.setStatus({ code: SpanStatusCode.OK });
        return manifest;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async deleteDocuments(request: VectorDeleteRequest) {
    if (!request.docIds.length) {
      return null;
    }

    const ticker = request.ticker.trim().toUpperCase();

    return tracer.startActiveSpan("vectorstore.delete", async (span) => {
      span.setAttributes({
        "vectorstore.ticker": ticker,
        "vectorstore.doc_count": request.docIds.length,
      });
      try {
        await executeWithRetry(
          () =>
            this.vectorStore.deleteByDocIds({
              ticker,
              docIds: request.docIds,
            }),
          this.buildRetryOptions(),
        );

        const manifest = await this.manifestModel.findOne({ ticker });
        if (!manifest) {
          span.setStatus({ code: SpanStatusCode.OK });
          return null;
        }

        manifest.docIds = manifest.docIds.filter(
          (docId) => !request.docIds.includes(docId.toString()),
        );
        const saved = await manifest.save();

        log.info(
          { ticker, removed: request.docIds.length },
          "Vector manifest doc ids pruned",
        );

        span.setStatus({ code: SpanStatusCode.OK });
        return saved;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async query(options: VectorQueryOptions): Promise<VectorQueryResultItem[]> {
    return tracer.startActiveSpan("vectorstore.query", async (span) => {
      const normalizedTicker = options.ticker.trim().toUpperCase();
      span.setAttributes({
        "vectorstore.ticker": normalizedTicker,
        "vectorstore.top_k": options.k,
      });
      try {
        const results = await executeWithRetry(
          () =>
            this.vectorStore.query({
              ...options,
              ticker: normalizedTicker,
            }),
          this.buildRetryOptions(Math.min(3, this.retryConfig.maxAttempts)),
        );

        span.setStatus({ code: SpanStatusCode.OK });
        return results;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async flushTicker(ticker: string) {
    return tracer.startActiveSpan("vectorstore.flush", async (span) => {
      const normalized = ticker.trim().toUpperCase();
      span.setAttribute("vectorstore.ticker", normalized);
      try {
        await this.vectorStore.flushTicker(normalized);
        await this.manifestModel.findOneAndUpdate(
          { ticker: normalized },
          { $set: { docIds: [] } },
          { new: true },
        );
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private extractDocIds(vectors: VectorChunkPayload[]) {
    return Array.from(
      new Set(vectors.map((vector) => vector.meta.docId).filter((docId) => !!docId)),
    );
  }

  private buildRetryOptions(attempts?: number) {
    return {
      attempts: attempts ?? this.retryConfig.maxAttempts,
      baseDelayMs: this.retryConfig.initialDelayMs,
      jitterRatio: this.retryConfig.jitterRatio,
    };
  }
}
