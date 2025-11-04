import { logger } from "../../utils/logger";

import { EnvSchema, type EnvConfig } from "./env.schema";

let cachedConfig: EnvConfig | null = null;

const redactCredential = (value?: string | null) => (value ? "set" : "unset");

export const getEnvConfig = (): EnvConfig => {
  if (!cachedConfig) {
    cachedConfig = EnvSchema.parse(process.env);

    logger.info(
      {
        nodeEnv: cachedConfig.nodeEnv,
        vectorStore: cachedConfig.vectorStore,
        otelEnabled: cachedConfig.otel.enabled,
        credentials: Object.fromEntries(
          Object.entries(cachedConfig.credentials).map(([key, value]) => [
            key,
            redactCredential(value),
          ]),
        ),
      },
      "Environment configuration loaded",
    );
  }

  return cachedConfig;
};

export const resetEnvConfigCache = () => {
  cachedConfig = null;
};

export const getMongoUri = () => getEnvConfig().mongoUri;

export const getPort = () => getEnvConfig().port;

export const getRedisUrl = () => getEnvConfig().redisUrl;

export const getVectorStoreSelection = () => getEnvConfig().vectorStore;

export const getTelemetryConfig = () => getEnvConfig().otel;
