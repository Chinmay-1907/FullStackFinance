import { Router } from "express";

import { IngestionController } from "./ingestion.controller";

const controller = new IngestionController();
export const ingestionRouter: Router = Router();

// eslint-disable-next-line @typescript-eslint/no-misused-promises
ingestionRouter.post("/start", controller.start);
// eslint-disable-next-line @typescript-eslint/no-misused-promises
ingestionRouter.get("/status/:jobId", controller.status);
// eslint-disable-next-line @typescript-eslint/no-misused-promises
ingestionRouter.post("/retry/:jobId", controller.retry);
