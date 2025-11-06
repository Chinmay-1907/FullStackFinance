import { Queue, QueueEvents, type QueueOptions } from "bullmq";

import { getRetryConfig } from "../modules/config/feature-flags";
import { createModuleLogger } from "../utils/logger";
import { closeRedisClients, getRedisClient } from "../utils/redis";

import { QUEUE_NAMES, type QueueName } from "./queue.names";

const log = createModuleLogger("queue:factory");

const createDefaultJobOptions = () => {
  const retry = getRetryConfig();

  return {
    attempts: retry.maxAttempts,
    backoff: {
      type: "exponential" as const,
      delay: retry.initialDelayMs,
    },
    removeOnComplete: 1000,
    removeOnFail: false,
  };
};

export const createQueue = (name: QueueName, options: Partial<QueueOptions> = {}) =>
  new Queue(name, {
    connection: getRedisClient(),
    defaultJobOptions: {
      ...createDefaultJobOptions(),
      ...(options.defaultJobOptions ?? {}),
    },
    ...options,
  });

export const createDeadLetterQueue = (name: QueueName) =>
  new Queue(name, {
    connection: getRedisClient(),
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  });

export const createQueueEvents = (name: QueueName) => {
  const events = new QueueEvents(name, {
    connection: getRedisClient(),
  });

  events.on("error", (error) => {
    log.error({ err: error, queue: name }, "Queue events error");
  });

  return events;
};

export const shutdownQueues = async () => {
  await closeRedisClients();
};

export const DEAD_LETTER_MAP: Record<QueueName, QueueName> = {
  [QUEUE_NAMES.INGESTION]: QUEUE_NAMES.INGESTION_DLQ,
  [QUEUE_NAMES.EMBEDDING]: QUEUE_NAMES.EMBEDDING_DLQ,
  [QUEUE_NAMES.INGESTION_DLQ]: QUEUE_NAMES.INGESTION_DLQ,
  [QUEUE_NAMES.EMBEDDING_DLQ]: QUEUE_NAMES.EMBEDDING_DLQ,
};
