/* eslint-disable import/order */

import { createReadStream } from "node:fs";

import {
  IngestionSourceSchema,
  IngestionStartRequestSchema,
  type IngestionStartRequest,
} from "@fin-rag/shared";
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { parseWithSchema } from "../../utils/validation";
import { IngestionService } from "./ingestion.service";

const JobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1, "jobId is required"),
});

const DocumentsQuerySchema = z.object({
  ticker: z.string().trim().min(1, "ticker is required"),
  source: IngestionSourceSchema.optional(),
  jobId: z.string().trim().optional(),
});

const DocumentParamsSchema = z.object({
  docId: z.string().trim().min(1, "docId is required"),
});

const ApproveJobParamsSchema = z.object({
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

  documents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ticker, source, jobId } = parseWithSchema(DocumentsQuerySchema, req.query);
      const documents = await this.service.listDocuments(ticker, source, jobId ?? undefined);
      res.status(200).json({ documents });
    } catch (error) {
      next(error);
    }
  };

  downloadDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { docId } = parseWithSchema(DocumentParamsSchema, req.params);
      const document = await this.service.getDocumentForDownload(docId);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${document.ticker}-${document.id}.txt"`,
      );
      const stream = createReadStream(document.textPath, { encoding: "utf8" });
      stream.on("error", next);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = parseWithSchema(ApproveJobParamsSchema, req.params);
      const result = await this.service.approveJob(jobId);
      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  };
}
