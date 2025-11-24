export const QUEUE_NAMES = {
  INGESTION: "ingestion",
  INGESTION_DLQ: "ingestion-dlq",
  EMBEDDING: "embedding",
  EMBEDDING_DLQ: "embedding-dlq",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
