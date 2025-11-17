import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";

import { configRouter } from "./modules/config/config.routes";
import { NotFoundError } from "./utils/errors";
import { errorHandler } from "./utils/errors";
import { logger } from "./utils/logger";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err) return "error";
      if (res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    }
  })
);

app.get("/healthz", (_req, res) => {
  res.status(200).send({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/v1/config", configRouter);

app.use((_req, _res, next) => {
  next(new NotFoundError("Route not found"));
});

app.use(errorHandler);

export { app };
