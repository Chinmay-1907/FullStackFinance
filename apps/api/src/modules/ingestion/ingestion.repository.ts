import {
  DocumentModel,
  IngestionJobModel,
  TickerModel,
  VectorManifestModel
} from "../../db/models";
import type {
  IngestionJobDocument,
  IngestionStageDocument
} from "../../db/models/ingestion-job.model";
import type { VectorManifestDocument } from "../../db/models/vector-manifest.model";
import { logger } from "../../utils/logger";
import { retry } from "../../utils/retry";
import type {
  IngestionSource,
  JobStageStatus,
  VectorStoreType
} from "@fin-rag/shared";

export interface DocumentUpsertInput {
  ticker: string;
  sourceType: IngestionSource;
  url?: string;
  formType?: string;
  publishedAt?: Date;
  textPath: string;
  textHash: string;
  bytes?: number;
}

export interface StageProgressUpdate {
  status?: JobStageStatus;
  progress?: number;
  error?: string | null;
}

export const ensureTicker = async (symbol: string, name?: string) => {
  const normalized = symbol.trim().toUpperCase();

  return TickerModel.findOneAndUpdate(
    { symbol: normalized },
    { symbol: normalized, ...(name ? { name } : {}) },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).exec();
};

export const createIngestionJob = async (
  ticker: string,
  stages: IngestionStageDocument[] = []
) => {
  const job = await IngestionJobModel.create({
    ticker: ticker.trim().toUpperCase(),
    stages,
    status: "queued",
    progress: 0
  });

  return job;
};

export const updateJobStage = async (
  jobId: string,
  stageName: string,
  updates: StageProgressUpdate
) => {
  const job = await IngestionJobModel.findById(jobId).exec();
  if (!job) {
    return null;
  }

  const stage = job.stages.find((item) => item.name === stageName);
  if (!stage) {
    job.stages.push({
      name: stageName,
      status: updates.status ?? "pending",
      progress: updates.progress ?? 0,
      error: updates.error ?? undefined
    });
  } else {
    if (updates.status) stage.status = updates.status;
    if (typeof updates.progress === "number") stage.progress = updates.progress;
    stage.error = updates.error ?? undefined;
  }

  job.progress = Math.min(
    1,
    job.stages.reduce((acc, item) => acc + item.progress, 0) / Math.max(job.stages.length, 1)
  );

  await job.save();
  return job;
};

export const markJobStatus = async (jobId: string, status: IngestionJobDocument["status"]) => {
  return IngestionJobModel.findByIdAndUpdate(
    jobId,
    { status },
    { new: true }
  ).exec();
};

export const persistDocuments = async (documents: DocumentUpsertInput[]) => {
  if (!documents.length) {
    return { inserted: 0, updated: 0 };
  }

  const operations = documents.map((doc) => ({
    updateOne: {
      filter: { textHash: doc.textHash },
      update: {
        $setOnInsert: {
          ticker: doc.ticker.trim().toUpperCase(),
          sourceType: doc.sourceType,
          textPath: doc.textPath
        },
        $set: {
          url: doc.url,
          formType: doc.formType,
          publishedAt: doc.publishedAt,
          bytes: doc.bytes
        }
      },
      upsert: true
    }
  }));

  const result = await DocumentModel.bulkWrite(operations, { ordered: false });

  return {
    inserted: result.upsertedCount ?? 0,
    updated: result.modifiedCount ?? 0
  };
};

export const upsertVectorManifest = async (input: {
  ticker: string;
  embeddingModel: string;
  chunkSize: number;
  overlap: number;
  vectorStore: VectorStoreType;
  docIds: string[];
}) => {
  const ticker = input.ticker.trim().toUpperCase();

  const manifest = await VectorManifestModel.findOneAndUpdate(
    { ticker },
    {
      embeddingModel: input.embeddingModel,
      chunkSize: input.chunkSize,
      overlap: input.overlap,
      vectorStore: input.vectorStore,
      docIds: input.docIds
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).exec();

  return manifest;
};

export const getVectorManifest = async (ticker: string) => {
  return VectorManifestModel.findOne({ ticker: ticker.trim().toUpperCase() }).exec();
};

export const getLatestJobForTicker = async (ticker: string) => {
  return IngestionJobModel.findOne({ ticker: ticker.trim().toUpperCase() })
    .sort({ createdAt: -1 })
    .exec();
};

export const withDatabaseRetry = <Args extends unknown[], Result>(
  operation: (...args: Args) => Promise<Result>
) => {
  return async (...args: Args) =>
    retry(() => operation(...args), {
      onRetry: (error, attempt) => {
        logger.warn({ err: error, attempt }, "Retrying MongoDB operation");
      }
    });
};

export type IngestionJob = IngestionJobDocument;
export type IngestionStage = IngestionStageDocument;
export type VectorManifest = VectorManifestDocument;
