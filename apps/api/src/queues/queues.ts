import { createDeadLetterQueue, createQueue, type AppQueue } from "./queue.factory";
import { QUEUE_NAMES, type QueueName } from "./queue.names";

const registry = new Map<QueueName, AppQueue>();

const getOrCreateQueue = (name: QueueName, create: () => AppQueue) => {
  const existing = registry.get(name);
  if (existing) {
    return existing;
  }

  const queue = create();
  registry.set(name, queue);
  return queue;
};

export const getIngestionQueue = () =>
  getOrCreateQueue(QUEUE_NAMES.INGESTION, () => createQueue(QUEUE_NAMES.INGESTION));

export const getEmbeddingQueue = () =>
  getOrCreateQueue(QUEUE_NAMES.EMBEDDING, () => createQueue(QUEUE_NAMES.EMBEDDING));

export const getDeadLetterQueue = (queueName: QueueName) => {
  const deadLetterName =
    queueName === QUEUE_NAMES.INGESTION
      ? QUEUE_NAMES.INGESTION_DLQ
      : queueName === QUEUE_NAMES.EMBEDDING
        ? QUEUE_NAMES.EMBEDDING_DLQ
        : queueName;

  return getOrCreateQueue(deadLetterName, () => createDeadLetterQueue(deadLetterName));
};
