import "dotenv/config";

import type { Server } from "http";

import { app } from "./app";
import { connectDB, disconnectDB } from "./db/connection";
import { getEnvConfig } from "./modules/config/config.service";
import { logger } from "./utils/logger";
import { initializeTracing, shutdownTracing } from "./utils/tracing";

const start = async () => {
  try {
    await initializeTracing().catch((error) => {
      logger.warn({ err: error }, "Failed to initialize tracing");
    });

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
      await shutdownTracing();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (shutdownError) {
      logger.error({ err: shutdownError }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.once("SIGINT", (signal) => {
    void shutdown(signal);
  });
  process.once("SIGTERM", (signal) => {
    void shutdown(signal);
  });
};

void start();
