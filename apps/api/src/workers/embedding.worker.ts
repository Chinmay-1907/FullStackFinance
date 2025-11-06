import "dotenv/config";

import { EmbeddingQueueJobSchema, type EmbeddingQueueJob } from "@fin-rag/shared";
import { Job, Worker } from "bullmq";

import { connectDB, disconnectDB } from "../db/connection";
import { getQueueWorkerSettings, getRetryConfig } from "../modules/config/feature-flags";
import { DEAD_LETTER_MAP } from "../queues/queue.factory";
import { QUEUE_NAMES } from "../queues/queue.names";
import { getDeadLetterQueue } from "../queues/queues";
import { createModuleLogger } from "../utils/logger";
import { closeRedisClients, getRedisClient } from "../utils/redis";
import { initializeTracing, shutdownTracing } from "../utils/tracing";
import { parseWithSchema } from "../utils/validation";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
const log = createModuleLogger("worker:embedding");

const workerSettings = getQueueWorkerSettings("embedding");

const processEmbeddingJob = async (job: Job<unknown>) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const payload: EmbeddingQueueJob = parseWithSchema<EmbeddingQueueJob>(
    EmbeddingQueueJobSchema,
    job.data,
  );

  log.info(
    { jobId: job.id, ticker: payload.ticker, documentCount: payload.documentIds.length },
    "Processing embedding job payload",
  );

  // TODO: integrate vector store embedding pipeline
  await job.updateProgress(1);
  return { status: "accepted" as const };
};

const start = async () => {
  await initializeTracing();
  await connectDB();

  const retryConfig = getRetryConfig();

  const worker = new Worker(QUEUE_NAMES.EMBEDDING, async (job) => processEmbeddingJob(job), {
    connection: getRedisClient(),
    concurrency: workerSettings.concurrency,
    maxStalledCount: workerSettings.maxStalledCount,
  });

  const deadLetterQueue = getDeadLetterQueue(DEAD_LETTER_MAP[QUEUE_NAMES.EMBEDDING]);

  worker.on("completed", (job) => {
    log.info({ jobId: job.id }, "Embedding job completed");
  });

  worker.on("failed", (job, err) => {
    void (async () => {
      if (!job) {
        log.error({ err }, "Embedding job failed without job reference");
        return;
      }

      log.error({ err, jobId: job.id, attempts: job.attemptsMade }, "Embedding job failed");

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
    log.error({ err }, "Embedding worker encountered an error");
  });

  await worker.waitUntilReady();

  const shutdown = async (signal: NodeJS.Signals) => {
    log.info({ signal }, "Shutting down embedding worker");
    try {
      await worker.close();
      await deadLetterQueue.close();
      await disconnectDB();
      await shutdownTracing();
    } catch (error) {
      log.error({ err: error }, "Error during embedding worker shutdown");
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
  log.error({ err: error }, "Failed to initialize embedding worker");
  await shutdownTracing();
  await closeRedisClients();
  process.exit(1);
});
