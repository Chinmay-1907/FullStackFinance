/* eslint-disable import/order */

import { IngestionStartRequestSchema, type IngestionStartRequest } from "@fin-rag/shared";
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { parseWithSchema } from "../../utils/validation";
import { IngestionService } from "./ingestion.service";

const JobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1, "jobId is required"),
});

export class IngestionController {
  constructor(private readonly service = new IngestionService()) {}

  start = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload: IngestionStartRequest = parseWithSchema(
        IngestionStartRequestSchema,
        req.body ?? {},
      );

      const result = await this.service.startIngestion(payload);
      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  };

  status = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = parseWithSchema(JobIdParamsSchema, req.params);
      const status = await this.service.getStatus(jobId);
      res.status(200).json(status);
    } catch (error) {
      next(error);
    }
  };

  retry = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = parseWithSchema(JobIdParamsSchema, req.params);
      const status = await this.service.retryJob(jobId);
      res.status(202).json(status);
    } catch (error) {
      next(error);
    }
  };
}
