import mongoose from "mongoose";

import { getEnvConfig } from "../modules/config/config.service";
import { logger } from "../utils/logger";

let connectionPromise: Promise<typeof mongoose> | null = null;

const handleConnectionEvents = () => {
  const connection = mongoose.connection;

  connection.on("connected", () => {
    logger.info("MongoDB connection established");
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
    connectionPromise = mongoose.connect(mongoUri);
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
