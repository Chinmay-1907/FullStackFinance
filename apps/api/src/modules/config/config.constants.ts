import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  RAGDefaults,
  RetryDefaults
} from "@fin-rag/shared";

import { getEnvConfig } from "./config.service";

export const getChunkingDefaults = () => ({ ...RAGDefaults });

export const getRetryDefaults = () => ({ ...RetryDefaults });

export const getVectorStoreSelection = () => getEnvConfig().vectorStore;

export const getDefaultModels = () => ({
  provider: DEFAULT_PROVIDER,
  llm: DEFAULT_MODEL,
  embedding: DEFAULT_EMBEDDING_MODEL
});
