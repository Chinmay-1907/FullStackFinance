import { randomUUID } from "node:crypto";

import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import type { LevelWithSilent, Logger } from "pino";
import pinoHttp from "pino-http";

import { configRouter } from "./modules/config/config.routes";
import { ingestionRouter } from "./modules/ingestion/ingestion.routes";
import { AppError, createErrorEnvelope, ValidationError } from "./utils/errors";
import { logger } from "./utils/logger";

export const app: Express = express();
const enableHttpLogging = process.env["NODE_ENV"] !== "test";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(
  pinoHttp({
    enabled: enableHttpLogging,
    logger: logger as unknown as Logger<LevelWithSilent>,
    genReqId: (req, res) => {
      const incoming =
        (req.headers["x-request-id"] as string | undefined) ??
        (req.headers["x-trace-id"] as string | undefined);
      const requestId = incoming ?? randomUUID();
      res.setHeader("x-request-id", requestId);
      return requestId;
    },
    customProps: (_req, res) => ({
      requestId: res.getHeader("x-request-id"),
    }),
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
    autoLogging: enableHttpLogging
      ? {
          ignore: (req) => req.url === "/healthz",
        }
      : false,
  }),
);

app.get("/healthz", (_req, res) => {
  res.status(200).send({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/v1/config", configRouter);
app.use("/api/v1/ingestion", ingestionRouter);

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  void _next;

  const requestWithId = req as typeof req & { id?: string };
  const requestId = requestWithId.id ?? (res.getHeader("x-request-id") as string | undefined);

  if (err instanceof ValidationError || err instanceof AppError) {
    const envelope = createErrorEnvelope(err, requestId);
    res.status(envelope.status ?? 500).json(envelope);
    return;
  }

  logger.error({ err, requestId }, "Unhandled application error");

  const envelope = createErrorEnvelope(err, requestId);
  res.status(envelope.status ?? 500).json(envelope);
};

app.use(errorHandler);
