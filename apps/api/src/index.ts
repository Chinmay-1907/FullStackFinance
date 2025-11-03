import "dotenv/config";

import { app } from "./app";
import { logger } from "./utils/logger";

const port = Number(process.env["PORT"] ?? 3001);

const server = app.listen(port, () => {
  logger.info({ port }, "API server listening");
});

const shutdown = (signal: NodeJS.Signals) => {
  logger.info({ signal }, "Shutting down API server");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
