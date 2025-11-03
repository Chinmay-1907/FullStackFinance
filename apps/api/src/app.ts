import cors from "cors";
import express, { type Express } from "express";
import type { LevelWithSilent, Logger } from "pino";
import pinoHttp from "pino-http";

import { configRouter } from "./modules/config/config.routes";
import { logger } from "./utils/logger";

export const app: Express = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(
  pinoHttp({
    logger: logger as unknown as Logger<LevelWithSilent>,
    customLogLevel: (_req, res, err): LevelWithSilent => {
      if (err) {
        return "error";
      }
      if (res.statusCode >= 500) {
        return "error";
      }
      if (res.statusCode >= 400) {
        return "warn";
      }
      return "info";
    },
  }),
);

app.get("/healthz", (_req, res) => {
  res.status(200).send({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/config", configRouter);
