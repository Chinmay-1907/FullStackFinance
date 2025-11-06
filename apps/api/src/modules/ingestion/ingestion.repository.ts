import {
  IngestionStageSchema,
  IngestionStatusSchema,
  type IngestionSource,
  type IngestionStage,
  type IngestionStatus,
} from "@fin-rag/shared";
import { Types } from "mongoose";

import {
  DocumentModel,
  type DocumentMetadata,
  INGESTION_STAGE_SEQUENCE,
  IngestionJobModel,
  type IngestionJobDocument,
  type IngestionJobStatus,
  type IngestionStageName,
  type StageErrorMetadata,
  type VectorManifestMetadata,
  VectorManifestModel,
  TickerModel,
} from "../../db/models";

type ObjectIdLike = Types.ObjectId | string;

const normalizeTicker = (ticker: string) => ticker.trim().toUpperCase();

const toIngestionStage = (stage: IngestionJobDocument["stages"][number]): IngestionStage => {
  const payload: IngestionStage = {
    name: stage.name,
    status: stage.status,
    progress: stage.progress,
    error: stage.error
      ? {
          message: stage.error.message,
          code: stage.error.code,
          details: stage.error.details,
        }
      : undefined,
  };

  return IngestionStageSchema.parse(payload);
};

const getCurrentStageName = (job: IngestionJobDocument) => {
  const running = job.stages.find((stage) => stage.status === "running");
  if (running) {
    return running.name;
  }

  const failed = job.stages.find((stage) => stage.status === "failed");
  if (failed) {
    return failed.name;
  }

  const pending = job.stages.find((stage) => stage.status === "pending");
  return pending?.name ?? null;
};

const toIngestionStatus = (job: IngestionJobDocument): IngestionStatus => {
  const payload = {
    jobId: job._id.toString(),
    ticker: job.ticker,
    status: job.status,
    progress: job.progress,
    currentStage: getCurrentStageName(job),
    stages: job.stages.map(toIngestionStage),
    startedAt: (job.statusTimestamps.runningAt ?? job.createdAt).toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.statusTimestamps.completedAt
      ? job.statusTimestamps.completedAt.toISOString()
      : null,
  };

  return IngestionStatusSchema.parse(payload);
};

export class IngestionRepository {
  async ensureTicker(symbol: string, name?: string) {
    return TickerModel.findOneAndUpdate(
      { symbol: normalizeTicker(symbol) },
      {
        $setOnInsert: { symbol: normalizeTicker(symbol) },
        ...(name ? { $set: { name } } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async upsertDocument(metadata: DocumentMetadata) {
    const payload = {
      ...metadata,
      ticker: normalizeTicker(metadata.ticker),
    };

    return DocumentModel.findOneAndUpdate(
      { textHash: payload.textHash },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async findDocumentByHash(textHash: string) {
    return DocumentModel.findByHash(textHash);
  }

  async seedJobStages(job: IngestionJobDocument, stages: IngestionStageName[]) {
    stages.forEach((stageName) => {
      job.updateStage(stageName, { status: "pending", progress: 0 });
    });
    return job.save();
  }

  async createJob(ticker: string, stages: IngestionStageName[] = [...INGESTION_STAGE_SEQUENCE]) {
    const job = await IngestionJobModel.create({
      ticker: normalizeTicker(ticker),
      status: stages.length ? "queued" : "queued",
    });

    if (stages.length) {
      await this.seedJobStages(job, stages);
    }

    return job;
  }

  async getJob(jobId: ObjectIdLike) {
    return IngestionJobModel.findById(jobId).exec();
  }

  async getLatestJobForTicker(ticker: string) {
    return IngestionJobModel.findLatestByTicker(normalizeTicker(ticker));
  }

  private async mutateJob(
    jobId: ObjectIdLike,
    mutator: (job: IngestionJobDocument) => IngestionJobDocument,
  ) {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }

    mutator(job);
    await job.save();
    return job;
  }

  async markStageRunning(jobId: ObjectIdLike, stageName: IngestionStageName) {
    const job = await this.mutateJob(jobId, (doc) => doc.markStageRunning(stageName));
    return job ? toIngestionStatus(job) : null;
  }

  async markStageComplete(jobId: ObjectIdLike, stageName: IngestionStageName) {
    const job = await this.mutateJob(jobId, (doc) => doc.markStageComplete(stageName));
    return job ? toIngestionStatus(job) : null;
  }

  async failStage(jobId: ObjectIdLike, stageName: IngestionStageName, error: StageErrorMetadata) {
    const job = await this.mutateJob(jobId, (doc) => doc.failStage(stageName, error));
    return job ? toIngestionStatus(job) : null;
  }

  async setJobStatus(jobId: ObjectIdLike, status: IngestionJobStatus) {
    const job = await this.mutateJob(jobId, (doc) => doc.setStatus(status));
    return job ? toIngestionStatus(job) : null;
  }

  async getJobStatus(jobId: ObjectIdLike) {
    const job = await this.getJob(jobId);
    return job ? toIngestionStatus(job) : null;
  }

  async getLatestStatus(ticker: string) {
    const job = await this.getLatestJobForTicker(ticker);
    return job ? toIngestionStatus(job) : null;
  }

  async prepareJobForRetry(jobId: ObjectIdLike) {
    const job = await this.mutateJob(jobId, (doc) => doc.prepareForRetry());
    return job ? toIngestionStatus(job) : null;
  }

  async upsertVectorManifest(manifest: VectorManifestMetadata) {
    return VectorManifestModel.upsertManifest({
      ...manifest,
      ticker: normalizeTicker(manifest.ticker),
      docIds: manifest.docIds.map(String),
    });
  }

  async findDocumentsForTicker(ticker: string, source?: IngestionSource) {
    const query: Record<string, unknown> = {
      ticker: normalizeTicker(ticker),
    };
    if (source) {
      query["sourceType"] = source;
    }
    return DocumentModel.find(query).sort({ publishedAt: -1, createdAt: -1 }).exec();
  }
}
