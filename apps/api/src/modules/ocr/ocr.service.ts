import { OcrQueueJobSchema, type OcrQueueJob } from "@fin-rag/shared";

import { getIngestionQueue } from "../../queues/queues";
import { createModuleLogger } from "../../utils/logger";
import { parseWithSchema } from "../../utils/validation";
import { getRetryConfig } from "../config/feature-flags";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
const TEXTUAL_MIME_TYPES = new Set([
  "text/plain",
  "text/html",
  "application/json",
  "application/xml",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff"]);

const PDF_MIME_TYPE = "application/pdf";

const getExtension = (filePath: string) => {
  const lastDot = filePath.lastIndexOf(".");
  return lastDot >= 0 ? filePath.slice(lastDot).toLowerCase() : "";
};

export interface OcrDetectionParams {
  mimeType?: string;
  filePath: string;
  textExtracted?: boolean;
}

export class OcrService {
  private readonly logger = createModuleLogger("ocr");

  shouldEnqueue({ mimeType, filePath, textExtracted }: OcrDetectionParams): boolean {
    if (textExtracted) {
      return false;
    }

    if (!mimeType) {
      const extension = getExtension(filePath);
      return IMAGE_EXTENSIONS.has(extension);
    }

    if (mimeType === PDF_MIME_TYPE) {
      // TODO: inspect PDF metadata to determine if text layer exists
      return true;
    }

    if (mimeType.startsWith("image/")) {
      return true;
    }

    return !TEXTUAL_MIME_TYPES.has(mimeType);
  }

  async queueOcrJob(job: OcrQueueJob) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const payload: OcrQueueJob = parseWithSchema<OcrQueueJob>(OcrQueueJobSchema, job);
    const queue = getIngestionQueue();
    const retry = getRetryConfig();

    await queue.add("ocr", payload as Record<string, unknown>, {
      attempts: retry.maxAttempts,
      backoff: {
        type: "exponential",
        delay: retry.initialDelayMs,
      },
      removeOnComplete: 100,
      removeOnFail: false,
      priority: 5,
    });

    this.logger.info({ jobId: payload.jobId, documentId: payload.documentId }, "Queued OCR job");
  }
}
