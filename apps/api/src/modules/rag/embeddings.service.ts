/* eslint-disable import/order, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

import { DEFAULT_EMBEDDING_MODEL, type ChunkRecord } from "@fin-rag/shared";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import { AppError } from "../../utils/errors";
import { createModuleLogger } from "../../utils/logger";
import { metrics } from "../../utils/metrics";
import { executeWithRetry } from "../../utils/retry";
import { getRetryConfig } from "../config/feature-flags";
import { GeminiEmbeddingProvider } from "./providers/gemini.provider";
import { GroqEmbeddingProvider } from "./providers/groq.provider";

export type EmbeddingVector = {
  id: string;
  embedding: number[];
  meta: ChunkRecord["meta"];
  text: string;
};

export interface IEmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingsServiceOptions {
  batchSize?: number;
  concurrency?: number;
  cache?: Map<string, number[]>;
}

const tracer = trace.getTracer("rag:embeddings-service");
const log = createModuleLogger("rag:embeddings");

const PROVIDERS: Record<string, IEmbeddingProvider> = {
  groq: new GroqEmbeddingProvider(),
  gemini: new GeminiEmbeddingProvider(),
};

const inferProviderKey = (modelId: string) => {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("groq")) {
    return "groq";
  }
  if (normalized.includes("gemini")) {
    return "gemini";
  }
  return "groq";
};

export class EmbeddingsService {
  private readonly batchSize: number;
  private readonly cache?: Map<string, number[]>;
  private readonly retryConfig = getRetryConfig();

  constructor(
    private readonly provider: IEmbeddingProvider,
    options: EmbeddingsServiceOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 16;
    this.cache = options.cache;
  }

  static fromConfig(options: EmbeddingsServiceOptions = {}) {
    const model = DEFAULT_EMBEDDING_MODEL;
    const providerKey = inferProviderKey(model);
    const provider = PROVIDERS[providerKey];
    if (!provider) {
      throw new AppError(`Embedding provider ${providerKey} is not supported`, {
        code: "INTERNAL_ERROR",
        status: 500,
      });
    }
    return new EmbeddingsService(provider, options);
  }

  async embedQuery(text: string) {
    const span = tracer.startSpan("embed.query");
    span.setAttribute("embeddings.provider", this.provider.name);
    try {
      const [vector] = await executeWithRetry(() => this.provider.embed([text]), {
        attempts: this.retryConfig.maxAttempts,
        baseDelayMs: this.retryConfig.initialDelayMs,
        jitterRatio: this.retryConfig.jitterRatio,
      });

      if (!vector) {
        throw new AppError("Embedding provider returned empty query vector", {
          code: "UPSTREAM_ERROR",
          status: 502,
        });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return vector;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  async embedChunks(chunks: ChunkRecord[], options: EmbeddingsServiceOptions = {}) {
    const batchSize = options.batchSize ?? this.batchSize;
    const cache = options.cache ?? this.cache;
    const batches = this.splitIntoBatches(chunks, batchSize);

    const span = tracer.startSpan("embed.chunks");
    span.setAttribute("embeddings.provider", this.provider.name);
    span.setAttribute("embeddings.batch_count", batches.length);
    span.setAttribute("embeddings.chunk_count", chunks.length);

    const vectors: EmbeddingVector[] = [];

    try {
      for (const batch of batches) {
        const batchSpan = tracer.startSpan("embed.batch");
        const embeddings: Array<number[] | undefined> = [];
        const pendingTexts: string[] = [];
        const pendingIndices: number[] = [];

        batch.forEach((chunk, index) => {
          const textHash = chunk.textHash;
          const cachedVector = cache?.get(textHash);
          if (cachedVector) {
            embeddings[index] = cachedVector;
          } else {
            pendingTexts.push(chunk.text);
            pendingIndices.push(index);
          }
        });

        if (pendingTexts.length > 0) {
          const freshEmbeddings = await executeWithRetry(() => this.provider.embed(pendingTexts), {
            attempts: this.retryConfig.maxAttempts,
            baseDelayMs: this.retryConfig.initialDelayMs,
            jitterRatio: this.retryConfig.jitterRatio,
          });

          pendingIndices.forEach((batchIndex, i) => {
            const vector = freshEmbeddings[i];
            embeddings[batchIndex] = vector;
            const hash = batch[batchIndex]?.textHash;
            if (hash && vector) {
              cache?.set(hash, vector);
            }
          });
        }

        embeddings.forEach((vector, index) => {
          const chunk = batch[index];
          if (!vector || !chunk) {
            throw new AppError("Embedding provider returned mismatched vector count", {
              code: "UPSTREAM_ERROR",
              status: 502,
            });
          }
          vectors.push({
            id: chunk.id,
            embedding: vector,
            meta: chunk.meta,
            text: chunk.text,
          });
        });

        batchSpan.setAttributes({
          "embeddings.batch_size": batch.length,
        });
        metrics.recordEmbeddingBatch(this.provider.name);
        batchSpan.end();
      }

      span.setStatus({ code: SpanStatusCode.OK });
      log.info(
        { count: vectors.length, provider: this.provider.name },
        "Embedding vectors generated",
      );

      return vectors;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  private splitIntoBatches(chunks: ChunkRecord[], batchSize: number) {
    const batches: ChunkRecord[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push(chunks.slice(i, i + batchSize));
    }
    return batches;
  }
}
