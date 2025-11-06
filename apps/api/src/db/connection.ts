import mongoose, { type ConnectOptions } from "mongoose";

import { getEnvConfig } from "../modules/config/config.service";
import { getRetryConfig, type RetryConfig } from "../modules/config/feature-flags";
import { createModuleLogger } from "../utils/logger";

const log = createModuleLogger("db:connection");

let connectionPromise: Promise<typeof mongoose> | null = null;
let eventsRegistered = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getDelay = (attempt: number, config: RetryConfig) => {
  const expBackoff = config.initialDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(expBackoff, config.maxDelayMs);
  const jitter = capped * config.jitterRatio * Math.random();
  return Math.round(capped + jitter);
};

const registerConnectionEvents = () => {
  if (eventsRegistered) {
    return;
  }

  const connection = mongoose.connection;

  connection.on("connected", () => {
    log.info("MongoDB connection established");
  });
  connection.on("reconnected", () => {
    log.info("MongoDB connection re-established");
  });
  connection.on("disconnected", () => {
    log.warn("MongoDB connection closed");
  });
  connection.on("close", () => {
    log.warn("MongoDB connection closed by application");
  });
  connection.on("error", (error) => {
    log.error({ err: error }, "MongoDB connection error");
  });

  eventsRegistered = true;
};

const connectWithRetry = async (
  uri: string,
  options: ConnectOptions,
  retryConfig: RetryConfig,
): Promise<typeof mongoose> => {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < retryConfig.maxAttempts) {
    attempt += 1;
    try {
      log.debug({ attempt }, "Attempting MongoDB connection");
      const connection = await mongoose.connect(uri, options);
      log.info({ attempt }, "MongoDB connection successful");
      return connection;
    } catch (error) {
      lastError = error;
      const delay = getDelay(attempt, retryConfig);
      log.warn({ err: error, attempt, delay }, "MongoDB connection attempt failed");
      await sleep(delay);
    }
  }

  log.error({ attempts: retryConfig.maxAttempts, err: lastError }, "MongoDB connection exhausted");
  throw lastError instanceof Error ? lastError : new Error("Failed to connect to MongoDB");
};

export const connectDB = async (
  overrideOptions: ConnectOptions = {},
  retryConfig: RetryConfig = getRetryConfig(),
) => {
  registerConnectionEvents();

  if (!connectionPromise) {
    const { mongoUri, nodeEnv } = getEnvConfig();
    const defaultOptions: ConnectOptions = {
      maxPoolSize: nodeEnv === "test" ? 1 : 10,
      serverSelectionTimeoutMS: 5_000,
      autoIndex: nodeEnv !== "production",
    };

    connectionPromise = connectWithRetry(
      mongoUri,
      { ...defaultOptions, ...overrideOptions },
      retryConfig,
    ).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  return connectionPromise;
};

export const awaitConnection = async () => {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    return mongoose.connection;
  }

  return connectDB();
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect();
    log.info("MongoDB disconnected");
  }

  connectionPromise = null;
};

const handleSignal = (signal: NodeJS.Signals) => {
  void disconnectDB()
    .then(() => {
      log.info({ signal }, "Gracefully disconnected from MongoDB");
    })
    .catch((error) => {
      log.error({ err: error, signal }, "Error disconnecting MongoDB");
    });
};

process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);
