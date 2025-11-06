import IORedis, { type Redis } from "ioredis";

import { getEnvConfig } from "../modules/config/config.service";

import { createModuleLogger } from "./logger";

const log = createModuleLogger("redis");

const clients = new Set<Redis>();

const createClient = () => {
  const { redisUrl } = getEnvConfig();

  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  client.on("error", (err) => {
    log.error({ err }, "Redis client error");
  });
  client.on("close", () => {
    log.info("Redis client connection closed");
  });

  clients.add(client);
  return client;
};

export const getRedisClient = () => createClient();

export const closeRedisClients = async () => {
  await Promise.all(
    Array.from(clients).map(async (client) => {
      clients.delete(client);
      try {
        await client.quit();
      } catch (error) {
        log.warn({ err: error }, "Failed to quit Redis client gracefully");
        client.disconnect();
      }
    }),
  );
};
