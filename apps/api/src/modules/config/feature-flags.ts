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
