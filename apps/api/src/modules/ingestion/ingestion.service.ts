/* eslint-disable import/order */

import { promises as fs } from "node:fs";

import {
  IngestionQueueJobSchema,
  type IngestionSource,
  type IngestionStartRequest,
} from "@fin-rag/shared";
import { trace } from "@opentelemetry/api";
import type { Queue } from "bullmq";

import { getIngestionQueue } from "../../queues/queues";
import { AppError, NotFoundError } from "../../utils/errors";
import { createModuleLogger } from "../../utils/logger";
import { getRetryConfig } from "../config/feature-flags";
import type { IngestionStageName } from "../../db/models";
import { IngestionRepository } from "./ingestion.repository";

const tracer = trace.getTracer("ingestion-service");
const log = createModuleLogger("ingestion:service");

type QueueLike = Pick<Queue, "add">;

const DEFAULT_SOURCES: IngestionStartRequest["sources"] = ["sec", "transcripts", "news"];
const PREVIEW_LIMIT = Number(process.env["INGESTION_PREVIEW_LIMIT"] ?? 2000);

export class IngestionService {
  constructor(
    private readonly repository = new IngestionRepository(),
    private readonly ingestionQueue: QueueLike = getIngestionQueue(),
  ) {}

  async startIngestion(request: IngestionStartRequest) {
    const payload = {
      ...request,
      sources: request.sources && request.sources.length > 0 ? request.sources : DEFAULT_SOURCES,
    };

    return tracer.startActiveSpan("ingestion.start", async (span) => {
      span.setAttributes({
        "ingestion.ticker": payload.ticker.toUpperCase(),
        "ingestion.sources": payload.sources?.join(",") ?? "",
      });

      try {
        await this.repository.ensureTicker(payload.ticker);
        const job = await this.repository.createJob(payload.ticker, {
          sources: payload.sources ?? DEFAULT_SOURCES,
        });
        const jobId = job._id.toString();

        await this.enqueueIngestionJob(jobId, payload);

        log.info(
          {
            jobId,
            ticker: job.ticker,
            sources: payload.sources,
          },
          "Enqueued ingestion job",
        );

        span.setStatus({ code: 1 });
        return { jobId };
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async getStatus(jobId: string) {
    return tracer.startActiveSpan("ingestion.status", async (span) => {
      span.setAttribute("ingestion.job_id", jobId);
      try {
        const status = await this.repository.getJobStatus(jobId);
        if (!status) {
          throw new NotFoundError(`Ingestion job ${jobId} not found`);
        }
        span.setStatus({ code: 1 });
        return status;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async retryJob(jobId: string) {
    return tracer.startActiveSpan("ingestion.retry", async (span) => {
      span.setAttribute("ingestion.job_id", jobId);
      try {
        const status = await this.repository.prepareJobForRetry(jobId);
        if (!status) {
          throw new NotFoundError(`Ingestion job ${jobId} not found`);
        }

        await this.enqueueIngestionJob(jobId, {
          ticker: status.ticker,
          sources: status.sources?.length ? status.sources : DEFAULT_SOURCES,
        });

        log.info({ jobId, ticker: status.ticker }, "Re-enqueued ingestion job retry");
        span.setStatus({ code: 1 });
        return status;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async listDocuments(ticker: string, source?: IngestionSource, jobId?: string) {
    const documents = await this.repository.findDocumentsForTicker(ticker, source, jobId);
    return Promise.all(
      documents.map(async (doc) => ({
        id: doc._id.toString(),
        ticker: doc.ticker,
        sourceType: doc.sourceType,
        formType: doc.formType,
        url: doc.url,
        publishedAt: doc.publishedAt?.toISOString() ?? null,
        bytes: doc.bytes ?? null,
        jobId: doc.jobId ?? undefined,
        approvalStatus: doc.approvalStatus ?? "pending",
        contentPreview: await this.readDocumentPreview(doc.textPath),
      })),
    );
  }

  async getDocumentForDownload(documentId: string) {
    const document = await this.repository.getDocumentById(documentId);
    if (!document) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }
    return document;
  }

  async approveJob(jobId: string) {
    const status = await this.repository.getJob(jobId);
    if (!status) {
      throw new NotFoundError(`Ingestion job ${jobId} not found`);
    }

    await this.repository.approveDocumentsForJob(jobId);
    await this.repository.setJobStatus(jobId, "queued");

    await this.enqueueIngestionJob(
      jobId,
      {
        ticker: status.ticker,
        sources: status.sources?.length ? status.sources : DEFAULT_SOURCES,
      },
      { startStage: "clean" },
    );

    log.info({ jobId }, "Approved ingestion documents and resumed processing");
    return { jobId };
  }

  private async enqueueIngestionJob(
    jobId: string,
    request: Pick<IngestionStartRequest, "ticker" | "sources">,
    options: { startStage?: IngestionStageName } = {},
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const jobPayload = IngestionQueueJobSchema.parse({
      jobId,
      ticker: request.ticker.toUpperCase(),
      sources: request.sources ?? DEFAULT_SOURCES,
      retryCount: 0,
      requestedAt: new Date().toISOString(),
      startStage: options.startStage,
    });

    try {
      const retry = getRetryConfig();

      await this.ingestionQueue.add("ingest", jobPayload as Record<string, unknown>, {
        attempts: retry.maxAttempts,
        backoff: {
          type: "exponential",
          delay: retry.initialDelayMs,
        },
        removeOnComplete: 500,
        removeOnFail: false,
      });
    } catch (error) {
      log.error({ err: error, jobId }, "Failed to enqueue ingestion job");
      throw new AppError("Failed to enqueue ingestion job", {
        code: "UPSTREAM_ERROR",
        status: 502,
        cause: error,
      });
    }
  }

  private async readDocumentPreview(textPath: string) {
    try {
      const content = await fs.readFile(textPath, "utf8");
      if (content.length <= PREVIEW_LIMIT) {
        return content;
      }
      return `${content.slice(0, PREVIEW_LIMIT)}…`;
    } catch (error) {
      log.warn({ err: error, textPath }, "Failed to read document preview");
      return "Preview unavailable.";
    }
  }
}
