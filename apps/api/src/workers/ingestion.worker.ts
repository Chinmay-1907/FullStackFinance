import "dotenv/config";

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  DEFAULT_EMBEDDING_MODEL,
  IngestionQueueJobSchema,
  OcrQueueJobSchema,
  RAGDefaults,
  type ChunkRecord,
  type IngestionQueueJob,
  type IngestionSource,
  type OcrQueueJob,
} from "@fin-rag/shared";
import { Job, Worker } from "bullmq";
import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";

import { connectDB, disconnectDB } from "../db/connection";
import { INGESTION_STAGE_SEQUENCE, type IngestionStageName } from "../db/models/ingestion-job.model";
import { getEnvConfig } from "../modules/config/config.service";
import { getQueueWorkerSettings, getRetryConfig } from "../modules/config/feature-flags";
import { IngestionRepository } from "../modules/ingestion/ingestion.repository";
import {
  NewsService,
  SecFilingsService,
  TranscriptService,
  type NormalizedSourceDocument,
} from "../modules/sources";
import { createOcrProvider } from "../modules/ocr/ocr.provider";
import { extractTextFromFile, type ExtractionStrategy } from "../modules/text/extract";
import { normalizeAndPersistText, type PersistedNormalizedText } from "../modules/text/normalize";
import { DocumentProcessor } from "../modules/rag/document.processor";
import { EmbeddingsService, type EmbeddingVector } from "../modules/rag/embeddings.service";
import { VectorStoreService } from "../modules/rag/vectorstore.service";
import type { VectorChunkPayload } from "../modules/rag/vector-store/vector-store.types";
import { DEAD_LETTER_MAP } from "../queues/queue.factory";
import { QUEUE_NAMES } from "../queues/queue.names";
import { getDeadLetterQueue } from "../queues/queues";
import { NotFoundError } from "../utils/errors";
import { createModuleLogger } from "../utils/logger";
import { closeRedisClients, getRedisClient } from "../utils/redis";
import { initializeTracing, shutdownTracing } from "../utils/tracing";
import { persistBuffer } from "../utils/storage";
import { parseWithSchema } from "../utils/validation";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
const log = createModuleLogger("worker:ingestion");

const workerSettings = getQueueWorkerSettings("ingestion");
const tracer = trace.getTracer("worker:ingestion");
const repository = new IngestionRepository();
const envConfig = getEnvConfig();
const ocrProvider = createOcrProvider({ language: envConfig.ocr.language });
const secFilingsService = new SecFilingsService();
const transcriptService = new TranscriptService();
const newsService = new NewsService();

const resolveNumber = (value: string | undefined, fallback: number, min = 0) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= min) {
    return parsed;
  }
  return fallback;
};

const chunkConfig = {
  chunkSize: resolveNumber(process.env["INGESTION_CHUNK_SIZE"], RAGDefaults.chunkSize, 200),
  chunkOverlap: resolveNumber(process.env["INGESTION_CHUNK_OVERLAP"], RAGDefaults.chunkOverlap, 0),
};

const documentProcessor = new DocumentProcessor({
  chunkSize: chunkConfig.chunkSize,
  chunkOverlap: chunkConfig.chunkOverlap,
});

const embeddingsService = EmbeddingsService.fromConfig();
const vectorStoreService = new VectorStoreService();

const SOURCE_LIMITS: Record<IngestionSource, number> = {
  sec: resolveNumber(process.env["SEC_FETCH_LIMIT"], 5, 1),
  transcripts: resolveNumber(process.env["TRANSCRIPT_FETCH_LIMIT"], 5, 1),
  news: resolveNumber(process.env["NEWS_FETCH_LIMIT"], 5, 1),
};

interface PipelineDocument extends NormalizedSourceDocument {
  rawText?: string;
  rawTextPath?: string;
  rawTextHash?: string;
  extractionStrategy?: ExtractionStrategy;
  normalized?: PersistedNormalizedText;
  chunks?: ChunkRecord[];
  vectors?: VectorChunkPayload[];
  documentId?: string;
  approvalStatus?: "pending" | "approved" | "rejected" | "processed";
}

type StageContext = {
  documents: PipelineDocument[];
};

type WorkerQueueJob = IngestionQueueJob & { startStage?: IngestionStageName };

const sourceFetchers: Record<IngestionSource, (ticker: string) => Promise<NormalizedSourceDocument[]>> =
  {
    sec: (ticker: string) => secFilingsService.fetchFilings(ticker, { limit: SOURCE_LIMITS.sec }),
    transcripts: (ticker: string) =>
      transcriptService.fetchTranscripts(ticker, { limit: SOURCE_LIMITS.transcripts }),
    news: (ticker: string) => newsService.fetchNews(ticker, { limit: SOURCE_LIMITS.news }),
  };

const buildStorageSubdir = (ticker: string, source: IngestionSource) =>
  path.join("ingestion", ticker, source);

const persistRawText = async (ticker: string, source: IngestionSource, content: string) => {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const persisted = await persistBuffer(
    Buffer.from(content, "utf8"),
    path.join(buildStorageSubdir(ticker, source), "raw"),
    fileName,
  );
  return persisted;
};

const runStage = async (
  jobId: string,
  stageName: IngestionStageName,
  handler: (() => Promise<void>) | undefined,
) => {
  const running = await repository.markStageRunning(jobId, stageName);
  if (!running) {
    throw new Error(`Unable to mark ${stageName} as running for job ${jobId}`);
  }

  try {
    await handler?.();
    const completed = await repository.markStageComplete(jobId, stageName);
    if (!completed) {
      throw new Error(`Unable to complete ${stageName} for job ${jobId}`);
    }
    return completed;
  } catch (error) {
    await repository.failStage(jobId, stageName, {
      message: (error as Error).message ?? "Stage failed",
      details: {
        stageName,
      },
    });
    throw error;
  }
};

const hydrateDocumentsFromJob = async (jobId: string): Promise<PipelineDocument[]> => {
  const stored = await repository.findDocumentsByJob(jobId);
  const hydrated: PipelineDocument[] = [];
  for (const doc of stored) {
    const rawPath = doc.rawTextPath ?? doc.textPath;
    const rawText = rawPath ? await fs.readFile(rawPath, "utf8") : undefined;
    hydrated.push({
      sourceType: doc.sourceType,
      ticker: doc.ticker,
      url: doc.url ?? undefined,
      formType: doc.formType ?? undefined,
      textPath: doc.textPath,
      textHash: doc.textHash,
      bytes: doc.bytes ?? 0,
      publishedAt: doc.publishedAt ?? undefined,
      metadata: doc.metadata ?? undefined,
      rawText,
      rawTextPath: rawPath,
      rawTextHash: doc.rawTextHash ?? doc.textHash,
      approvalStatus: doc.approvalStatus ?? "pending",
      documentId: doc._id.toString(),
    });
  }
  return hydrated;
};

const processOcrJob = async (job: Job<unknown>, span: Span) => {
  const payload: OcrQueueJob = parseWithSchema<OcrQueueJob>(OcrQueueJobSchema, job.data);
  log.info({ jobId: job.id, documentId: payload.documentId }, "Processing OCR job payload");
  span.setAttributes({
    "document.id": payload.documentId,
    "ingestion.stage": "ocr-inline",
  });

  const document = await repository.getDocumentById(payload.documentId);
  if (!document) {
    throw new NotFoundError(`Document ${payload.documentId} not found for OCR processing`);
  }

  const extractResult = await extractTextFromFile({
    filePath: payload.sourcePath,
    mimeType: payload.mimeType,
    ticker: document.ticker,
    sourceType: document.sourceType,
    ocrProvider,
  });

  if (!extractResult.text.trim()) {
    throw new Error(`OCR provider returned empty payload for ${payload.sourcePath}`);
  }

  const normalized = await normalizeAndPersistText({
    rawText: extractResult.text,
    ticker: document.ticker,
    sourceType: document.sourceType,
    storageSubdir: buildStorageSubdir(document.ticker, document.sourceType),
    publishedAt: document.publishedAt ?? undefined,
  });

  document.textPath = normalized.textPath;
  document.textHash = normalized.textHash;
  document.bytes = normalized.bytes;
  await document.save();

  log.info(
    { jobId: job.id, documentId: payload.documentId, strategy: extractResult.strategy },
    "OCR job completed",
  );
  await job.updateProgress(1);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
  return { status: "ocr-processed" as const };
};

const processJob = async (job: Job<unknown>) =>
  tracer.startActiveSpan("ingestion.worker.process", async (span) => {
    span.setAttributes({
      "messaging.system": "bullmq",
      "messaging.destination": job.queueName,
      "messaging.message_id": job.id,
      "ingestion.job_name": job.name,
    });

    if (job.name === "ocr") {
      try {
        return await processOcrJob(job, span);
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      }
    }

    const payload: WorkerQueueJob = parseWithSchema<WorkerQueueJob>(
      IngestionQueueJobSchema,
      job.data,
    );

    const ticker = payload.ticker.trim().toUpperCase();
    log.info(
      { jobId: job.id, ticker, sources: payload.sources, startStage: payload.startStage },
      "Processing ingestion job payload",
    );

    span.setAttributes({
      "ingestion.ticker": ticker,
      "ingestion.sources": payload.sources?.join(",") ?? "",
    });

    try {
      const startStage = payload.startStage ?? "download";
      const startIndex = Math.max(
        0,
        INGESTION_STAGE_SEQUENCE.findIndex((stage) => stage === startStage),
      );
      const stagesToRun =
        startIndex >= 0 ? INGESTION_STAGE_SEQUENCE.slice(startIndex) : [...INGESTION_STAGE_SEQUENCE];

      const context: StageContext = {
        documents: [],
      };

      if (startIndex > 0) {
        context.documents = await hydrateDocumentsFromJob(payload.jobId);
      }

      let awaitingApproval = false;

      const stageHandlers: Partial<Record<IngestionStageName, () => Promise<void>>> = {
        download: async () => {
          const seen = new Set<string>();
          for (const source of payload.sources ?? []) {
            const fetcher = sourceFetchers[source];
            if (!fetcher) {
              log.warn({ source }, "No fetcher configured for source");
              continue;
            }
            const docs = await fetcher(ticker);
            docs.forEach((doc) => {
              if (seen.has(doc.textHash)) {
                return;
              }
              seen.add(doc.textHash);
              context.documents.push({ ...doc });
            });
          }

          if (!context.documents.length) {
            throw new Error(`No documents downloaded for ${ticker}`);
          }

          span.setAttribute("ingestion.document_count", context.documents.length);
          log.info(
            { jobId: payload.jobId, documentCount: context.documents.length },
            "Download stage completed",
          );
        },
        ocr: async () => {
          await Promise.all(
            context.documents.map(async (doc) => {
              if (doc.documentId && doc.rawText) {
                return;
              }
              const extraction = await extractTextFromFile({
                filePath: doc.textPath,
                mimeType: doc.contentType,
                ticker,
                sourceType: doc.sourceType,
                ocrProvider,
              });
              if (!extraction.text.trim()) {
                throw new Error(`Failed to extract text for ${doc.textPath}`);
              }
              doc.rawText = extraction.text;
              doc.extractionStrategy = extraction.strategy;

              const persisted = await persistRawText(ticker, doc.sourceType, extraction.text);
              const textHash = persisted.hash;

              const created = await repository.createDocument({
                jobId: payload.jobId,
                ticker,
                sourceType: doc.sourceType,
                formType: doc.formType,
                url: doc.url,
                publishedAt: doc.publishedAt,
                textPath: persisted.path,
                textHash,
                bytes: persisted.bytes,
                approvalStatus: "pending",
                rawTextPath: persisted.path,
                rawTextHash: textHash,
                metadata: doc.metadata,
              });

              doc.documentId = created._id.toString();
              doc.rawTextPath = persisted.path;
              doc.rawTextHash = textHash;
              doc.textPath = persisted.path;
              doc.textHash = textHash;
              doc.bytes = persisted.bytes;
              doc.approvalStatus = created.approvalStatus ?? "pending";
            }),
          );
        },
        review: async () => {
          const pendingDocs = context.documents.filter(
            (doc) => (doc.approvalStatus ?? "pending") !== "approved",
          );
          if (pendingDocs.length > 0) {
            awaitingApproval = true;
            await repository.markJobAwaitingApproval(payload.jobId);
            log.info(
              { jobId: payload.jobId, pendingDocuments: pendingDocs.length },
              "Awaiting manual approval before continuing ingestion",
            );
          }
        },
        clean: async () => {
          await Promise.all(
            context.documents.map(async (doc) => {
              if ((doc.approvalStatus ?? "pending") !== "approved") {
                throw new Error(`Document ${doc.documentId ?? doc.textHash} not approved yet`);
              }
              if (!doc.rawText) {
                const rawPath = doc.rawTextPath ?? doc.textPath;
                doc.rawText = await fs.readFile(rawPath, "utf8");
              }
              if (!doc.rawText?.trim()) {
                throw new Error(`Document ${doc.documentId ?? doc.textHash} missing extracted text`);
              }
              doc.normalized = await normalizeAndPersistText({
                rawText: doc.rawText,
                ticker,
                sourceType: doc.sourceType,
                publishedAt: doc.publishedAt,
                metadata: doc.metadata,
                storageSubdir: buildStorageSubdir(ticker, doc.sourceType),
              });
            }),
          );
        },
        chunk: async () => {
          for (const doc of context.documents) {
            if (!doc.normalized) {
              throw new Error(`Document ${doc.documentId ?? doc.textHash} has not been normalized`);
            }
            doc.chunks = await documentProcessor.process({
              id: doc.normalized.textHash,
              ticker,
              sourceType: doc.sourceType,
              publishedAt: doc.publishedAt?.toISOString(),
              text: doc.normalized.text,
            });
          }
        },
        embed: async () => {
          const allChunks = context.documents.flatMap((doc) => doc.chunks ?? []);
          if (!allChunks.length) {
            log.warn({ jobId: payload.jobId }, "No chunks produced; skipping embedding");
            return;
          }
          const embedded = await embeddingsService.embedChunks(allChunks);
          const grouped = embedded.reduce<Map<string, EmbeddingVector[]>>((acc, vector) => {
            const key = vector.meta.docId;
            if (!acc.has(key)) {
              acc.set(key, []);
            }
            acc.get(key)?.push(vector);
            return acc;
          }, new Map());

          context.documents.forEach((doc) => {
            const docKey = doc.normalized?.textHash;
            if (!docKey) {
              doc.vectors = [];
              return;
            }
            const vectors = grouped.get(docKey) ?? [];
            doc.vectors = vectors.map<VectorChunkPayload>((vector) => ({
              id: vector.id,
              embedding: vector.embedding,
              text: vector.text,
              meta: { ...vector.meta },
            }));
          });
        },
        persist: async () => {
          const vectorsToPersist: VectorChunkPayload[] = [];
          for (const doc of context.documents) {
            if (!doc.normalized) {
              throw new Error(`Document ${doc.documentId ?? doc.textHash} missing normalized payload`);
            }
            if (!doc.documentId) {
              throw new Error(`Document ${doc.textHash} missing database identifier`);
            }
            await repository.updateDocument(doc.documentId, {
              textPath: doc.normalized.textPath,
              textHash: doc.normalized.textHash,
              bytes: doc.normalized.bytes,
              approvalStatus: "processed",
            });
            doc.vectors?.forEach((vector) => {
              vector.meta.docId = doc.documentId as string;
              vectorsToPersist.push(vector);
            });
          }

          if (!vectorsToPersist.length) {
            log.warn({ jobId: payload.jobId }, "No vectors to persist; skipping vector store upsert");
            return;
          }

          await vectorStoreService.upsertVectors({
            ticker,
            vectors: vectorsToPersist,
            embeddingModel: DEFAULT_EMBEDDING_MODEL,
            chunkSize: chunkConfig.chunkSize,
            overlap: chunkConfig.chunkOverlap,
            rebuild: payload.retryCount > 0,
          });

          span.setAttribute("ingestion.vector_count", vectorsToPersist.length);
          log.info(
            {
              jobId: payload.jobId,
              ticker,
              documentCount: context.documents.length,
              vectorCount: vectorsToPersist.length,
            },
            "Persisted documents and vectors",
          );
        },
      };

      const totalStages = INGESTION_STAGE_SEQUENCE.length;
      let completedStages = Math.max(0, startIndex);

      for (const stageName of stagesToRun) {
        const handler = stageHandlers[stageName];
        const status = await runStage(payload.jobId, stageName, handler);
        log.info(
          { jobId: payload.jobId, stage: stageName, jobStatus: status.status },
          "Stage completed",
        );
        completedStages += 1;
        await job.updateProgress(Math.min(1, completedStages / totalStages));

        if (stageName === "review" && awaitingApproval) {
          span.setStatus({ code: SpanStatusCode.OK });
          return { status: "awaiting-approval" as const };
        }
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return { status: "accepted" as const };
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });

const start = async () => {
  await initializeTracing();
  await connectDB();

  const retryConfig = getRetryConfig();

  const worker = new Worker(QUEUE_NAMES.INGESTION, async (job) => processJob(job), {
    connection: getRedisClient(),
    concurrency: workerSettings.concurrency,
    maxStalledCount: workerSettings.maxStalledCount,
  });

  const deadLetterQueue = getDeadLetterQueue(DEAD_LETTER_MAP[QUEUE_NAMES.INGESTION]);

  worker.on("completed", (job) => {
    log.info({ jobId: job.id }, "Ingestion job completed");
  });

  worker.on("failed", (job, err) => {
    void (async () => {
      if (!job) {
        log.error({ err }, "Ingestion job failed without job reference");
        return;
      }

      log.error({ err, jobId: job.id, attempts: job.attemptsMade }, "Ingestion job failed");

      const attemptLimit = job.opts.attempts ?? retryConfig.maxAttempts;
      if (job.attemptsMade >= attemptLimit) {
        await deadLetterQueue.add(
          "failed",
          {
            failedAt: new Date().toISOString(),
            jobId: job.id,
            data: job.data,
            error: {
              message: err?.message,
              stack: err?.stack,
            },
          },
          { removeOnComplete: 100, removeOnFail: false },
        );
      }
    })();
  });

  worker.on("error", (err) => {
    log.error({ err }, "Ingestion worker encountered an error");
  });

  await worker.waitUntilReady();

  const shutdown = async (signal: NodeJS.Signals) => {
    log.info({ signal }, "Shutting down ingestion worker");
    try {
      await worker.close();
      await deadLetterQueue.close();
      await ocrProvider.dispose?.();
      await disconnectDB();
      await shutdownTracing();
    } catch (error) {
      log.error({ err: error }, "Error during ingestion worker shutdown");
    } finally {
      await closeRedisClients();
      process.exit(0);
    }
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal);
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
};

void start().catch(async (error) => {
  log.error({ err: error }, "Failed to initialize ingestion worker");
  await shutdownTracing();
  await closeRedisClients();
  process.exit(1);
});
