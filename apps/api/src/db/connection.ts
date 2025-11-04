import mongoose from "mongoose";

import { getEnvConfig } from "../modules/config/config.service";
import { logger } from "../utils/logger";

let connectionPromise: Promise<typeof mongoose> | null = null;
let eventsRegistered = false;

const registerConnectionEvents = () => {
  if (eventsRegistered) {
    return;
  }

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

  eventsRegistered = true;
};

export const connectDB = async () => {
  registerConnectionEvents();

  if (!connectionPromise) {
    const { mongoUri } = getEnvConfig();
    connectionPromise = mongoose.connect(mongoUri).then((connection) => {
      logger.info("Connected to MongoDB");
      return connection;
    });
  }

  return connectionPromise;
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }

  connectionPromise = null;
};

const handleSignal = (signal: NodeJS.Signals) => {
  void disconnectDB()
    .then(() => {
      logger.info({ signal }, "Gracefully disconnected from MongoDB");
    })
    .catch((error) => {
      logger.error({ err: error, signal }, "Error disconnecting MongoDB");
    });
};

process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);
