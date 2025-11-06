import { RAGDefaults, RetryDefaults } from "@fin-rag/shared";

import { getEnvConfig } from "./config.service";

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

export const ChunkingConfig = {
  defaultChunkSize: RAGDefaults.chunkSize,
  defaultOverlap: RAGDefaults.chunkOverlap,
} as const;

export interface QueueWorkerSettings {
  concurrency: number;
  maxStalledCount: number;
}

const WORKER_DEFAULTS: Record<"ingestion" | "embedding", QueueWorkerSettings> = {
  ingestion: {
    concurrency: 5,
    maxStalledCount: 1,
  },
  embedding: {
    concurrency: 8,
    maxStalledCount: 1,
  },
};

export const getRetryConfig = (overrides?: Partial<RetryConfig>): RetryConfig => {
  const base: RetryConfig = {
    maxAttempts: RetryDefaults.attempts,
    initialDelayMs: RetryDefaults.baseDelayMs,
    maxDelayMs: RetryDefaults.baseDelayMs * 10,
    jitterRatio: 0.2,
  };

  return {
    ...base,
    ...overrides,
  };
};

export const getSelectedVectorStore = () => getEnvConfig().vectorStore;

export const getQueueWorkerSettings = (
  queue: keyof typeof WORKER_DEFAULTS,
  overrides?: Partial<QueueWorkerSettings>,
): QueueWorkerSettings => ({
  ...WORKER_DEFAULTS[queue],
  ...overrides,
});
