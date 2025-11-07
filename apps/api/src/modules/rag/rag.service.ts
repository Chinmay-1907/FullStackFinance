import {
  DEFAULT_MODEL,
  QueryRequestSchema,
  type Citation,
  type QueryRequest,
  type QueryResponse,
} from "@fin-rag/shared";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import { createModuleLogger } from "../../utils/logger";
import { metrics } from "../../utils/metrics";
import { EmbeddingsService } from "./embeddings.service";
import { resolveAnswerProvider, type IAnswerProvider } from "./providers/answer.provider";
import { VectorStoreService } from "./vectorstore.service";
import type { VectorQueryResultItem } from "./vector-store/vector-store.types";

const tracer = trace.getTracer("rag:service");
const log = createModuleLogger("rag:service");

const SYSTEM_INSTRUCTIONS =
  "You are a financial research assistant. Use only the supplied context to answer. " +
  "Cite evidence inline using bracketed numbers that correspond to the provided citations.";

const ANSWER_INSTRUCTIONS =
  "Respond with concise paragraphs followed by actionable bullet points when possible. " +
  "If the context is insufficient, state that explicitly.";

export type QueryStreamEvent =
  | {
      type: "retrieval";
      data: {
        ticker: string;
        chunkCount: number;
        citations: Citation[];
      };
    }
  | { type: "token"; data: { token: string } }
  | { type: "done"; data: QueryResponse };

export interface RagStreamOptions {
  requestId?: string;
  signal?: AbortSignal;
}

export interface RagServiceDependencies {
  embeddings?: EmbeddingsService;
  vectorStore?: VectorStoreService;
  answerProviderResolver?: (modelId?: string) => IAnswerProvider;
}

export class RagService {
  private readonly embeddings: EmbeddingsService;
  private readonly vectorStore: VectorStoreService;
  private readonly resolveAnswerProvider: (modelId?: string) => IAnswerProvider;

  constructor(dependencies: RagServiceDependencies = {}) {
    this.embeddings = dependencies.embeddings ?? EmbeddingsService.fromConfig();
    this.vectorStore = dependencies.vectorStore ?? new VectorStoreService();
    this.resolveAnswerProvider =
      dependencies.answerProviderResolver ?? ((modelId?: string) => resolveAnswerProvider(modelId));
  }

  async *streamQuery(
    request: QueryRequest,
    options: RagStreamOptions = {},
  ): AsyncGenerator<QueryStreamEvent> {
    const payload = QueryRequestSchema.parse(request);
    const ticker = payload.ticker.trim().toUpperCase();
    const model = payload.model ?? DEFAULT_MODEL;
    const start = Date.now();

    const span = tracer.startSpan("rag.query");
    span.setAttributes({
      "rag.ticker": ticker,
      "rag.model": model,
      "rag.request_id": options.requestId ?? "",
    });

    try {
      const queryVector = await this.embeddings.embedQuery(payload.question);
      const matches = await this.vectorStore.query({
        ticker,
        embedding: queryVector,
        k: payload.k,
      });

      if (!matches.length) {
        const fallback = this.buildInsufficientResponse(payload);
        metrics.observeQueryLatency(ticker, model, fallback.latencyMs ?? 0);
        yield {
          type: "retrieval",
          data: {
            ticker,
            chunkCount: 0,
            citations: fallback.citations,
          },
        };
        yield { type: "done", data: fallback };
        span.setStatus({ code: SpanStatusCode.OK });
        return;
      }

      const citations = this.buildCitations(matches);

      log.info(
        {
          ticker,
          question: payload.question,
          retrieved: matches.length,
          topK: payload.k,
          requestId: options.requestId,
        },
        "Vector store retrieval complete",
      );

      yield {
        type: "retrieval",
        data: {
          ticker,
          chunkCount: matches.length,
          citations,
        },
      };

      const provider = this.resolveAnswerProvider(model);
      const prompt = this.buildPrompt(payload, matches);
      const tokens: string[] = [];

      for await (const token of provider.streamAnswer(prompt, { signal: options.signal })) {
        tokens.push(token);
        yield { type: "token", data: { token } };
      }

      const latencyMs = Date.now() - start;
      const response: QueryResponse = {
        answer: this.decorateAnswer(tokens.join("").trim(), citations),
        citations,
        latencyMs,
      };
      metrics.observeQueryLatency(ticker, model, latencyMs);

      span.setStatus({ code: SpanStatusCode.OK, message: "rag.complete" });
      yield { type: "done", data: response };
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  private buildPrompt(request: QueryRequest, chunks: VectorQueryResultItem[]) {
    const context = chunks
      .map(
        (chunk, index) =>
          `Chunk ${index + 1} | doc ${chunk.docId} | source ${chunk.sourceType} | score ${chunk.score.toFixed(4)}\n${chunk.snippet}`,
      )
      .join("\n---\n");

    return {
      ticker: request.ticker.toUpperCase(),
      question: request.question,
      context,
      systemInstructions: SYSTEM_INSTRUCTIONS,
      instructions: ANSWER_INSTRUCTIONS,
      model: request.model ?? DEFAULT_MODEL,
    };
  }

  private buildCitations(chunks: VectorQueryResultItem[]): Citation[] {
    return chunks.map((chunk) => ({
      docId: chunk.docId,
      snippet: chunk.snippet,
      score: Number(chunk.score.toFixed(4)),
      sourceType: chunk.sourceType,
    }));
  }

  private decorateAnswer(answer: string, citations: Citation[]) {
    if (!citations.length) {
      return answer || "Insufficient data";
    }

    const referenceSuffix = citations.map((_citation, index) => `[${index + 1}]`).join(" ");
    return `${answer} ${referenceSuffix}`.trim();
  }

  private buildInsufficientResponse(request: QueryRequest): QueryResponse {
    return {
      answer: `Insufficient data to answer "${request.question}" for ${request.ticker.toUpperCase()}.`,
      citations: [
        {
          docId: "insufficient-context",
          snippet: "The vector store returned 0 context chunks for this query.",
          sourceType: "system",
          score: 0,
        },
      ],
      latencyMs: 0,
    };
  }
}
