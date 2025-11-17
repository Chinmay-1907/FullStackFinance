import mongoose from "mongoose";

import { getEnvConfig } from "../modules/config/config.service";
import { logger } from "../utils/logger";
import { retry } from "../utils/retry";

let connectionPromise: Promise<typeof mongoose> | null = null;

const handleConnectionEvents = () => {
  const connection = mongoose.connection;

  connection.on("connected", () => {
    logger.debug("MongoDB connection established");
  });

  connection.on("error", (error) => {
    logger.error({ err: error }, "MongoDB connection error");
  });

  connection.on("disconnected", () => {
    logger.warn("MongoDB connection closed");
  });
};

handleConnectionEvents();

export const connectDB = async () => {
  if (!connectionPromise) {
    const { mongoUri } = getEnvConfig();

    connectionPromise = retry(() => mongoose.connect(mongoUri), {
      onRetry: (error, attempt) => {
        logger.warn({ err: error, attempt }, "Retrying MongoDB connection");
      }
    }).then((conn) => {
      logger.info({ hosts: mongoose.connection.host }, "MongoDB connected");
      return conn;
    });
  }

  return connectionPromise;
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

const handleSignal = (signal: NodeJS.Signals) => {
  disconnectDB()
    .then(() => {
      logger.info({ signal }, "Gracefully disconnected from MongoDB");
    })
    .catch((error) => {
      logger.error({ err: error, signal }, "Error during MongoDB shutdown");
    });
};

process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);
