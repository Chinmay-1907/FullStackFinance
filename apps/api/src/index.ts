import "dotenv/config";

import type { Server } from "http";

import { app } from "./app";
import { connectDB, disconnectDB } from "./db/connection";
import { getEnvConfig } from "./modules/config/config.service";
import { logger } from "./utils/logger";

const start = async () => {
  try {
    const { port } = getEnvConfig();
    await connectDB();

    const server = app.listen(port, () => {
      logger.info({ port }, "API server listening");
    });

    registerShutdown(server);
  } catch (error) {
    logger.error({ err: error }, "Failed to start API server");
    process.exit(1);
  }
};

const registerShutdown = (server: Server) => {
  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down API server");

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });

      await disconnectDB();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (shutdownError) {
      logger.error({ err: shutdownError }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

void start();
