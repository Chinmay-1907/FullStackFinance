import type { ErrorEnvelope } from "@fin-rag/shared";
import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import type { LevelWithSilent, Logger } from "pino";
import pinoHttp from "pino-http";
import { ZodError } from "zod";

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
  res.status(200).send({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/v1/config", configRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  void _next;

  if (err instanceof ZodError) {
    const response: ErrorEnvelope = {
      code: "VALIDATION_ERROR",
      message: "Invalid request payload",
      details: err.flatten(),
      status: 400,
    };

    res.status(400).json(response);
    return;
  }

  logger.error({ err }, "Unhandled application error");

  const response: ErrorEnvelope = {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    status: 500,
  };

  res.status(500).json(response);
};

app.use(errorHandler);
