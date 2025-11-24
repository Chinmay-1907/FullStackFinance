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
  type VectorManifestUpsertOptions,
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
    sources: job.sources ?? [],
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

  async createDocument(metadata: DocumentMetadata) {
    return DocumentModel.create({
      ...metadata,
      ticker: normalizeTicker(metadata.ticker),
    });
  }

  async updateDocument(documentId: ObjectIdLike, updates: Partial<DocumentMetadata>) {
    return DocumentModel.findByIdAndUpdate(
      documentId,
      {
        $set: {
          ...updates,
          ...(updates.ticker ? { ticker: normalizeTicker(updates.ticker) } : {}),
        },
      },
      { new: true },
    ).exec();
  }

  async findDocumentsByJob(jobId: ObjectIdLike) {
    return DocumentModel.find({ jobId: jobId.toString() }).sort({ createdAt: 1 }).exec();
  }

  async setDocumentApprovalStatus(documentId: ObjectIdLike, status: DocumentMetadata["approvalStatus"]) {
    return DocumentModel.findByIdAndUpdate(
      documentId,
      { $set: { approvalStatus: status } },
      { new: true },
    ).exec();
  }

  async approveDocumentsForJob(jobId: ObjectIdLike) {
    const result = await DocumentModel.updateMany(
      { jobId: jobId.toString(), approvalStatus: { $ne: "approved" } },
      { $set: { approvalStatus: "approved" } },
    ).exec();
    return result.modifiedCount ?? 0;
  }

  async seedJobStages(job: IngestionJobDocument, stages: IngestionStageName[]) {
    stages.forEach((stageName) => {
      job.updateStage(stageName, { status: "pending", progress: 0 });
    });
    return job.save();
  }

  async createJob(
    ticker: string,
    options: { stages?: IngestionStageName[]; sources?: IngestionSource[] } = {},
  ) {
    const stages = options.stages ?? [...INGESTION_STAGE_SEQUENCE];
    const sources = options.sources ?? [];
    const job = await IngestionJobModel.create({
      ticker: normalizeTicker(ticker),
      status: stages.length ? "queued" : "queued",
      sources,
    });

    if (stages.length) {
      await this.seedJobStages(job, stages);
    }

    return job;
  }

  async getJob(jobId: ObjectIdLike) {
    return IngestionJobModel.findById(jobId).exec();
  }

  async getDocumentById(documentId: ObjectIdLike) {
    return DocumentModel.findById(documentId).exec();
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

  async markJobAwaitingApproval(jobId: ObjectIdLike) {
    return this.setJobStatus(jobId, "awaiting_approval");
  }

  async upsertVectorManifest(
    manifest: VectorManifestMetadata,
    options: VectorManifestUpsertOptions = {},
  ) {
    return VectorManifestModel.upsertManifest(
      {
        ...manifest,
        ticker: normalizeTicker(manifest.ticker),
        docIds: manifest.docIds.map(String),
      },
      options,
    );
  }

  async findDocumentsForTicker(ticker: string, source?: IngestionSource, jobId?: string) {
    const query: Record<string, unknown> = {
      ticker: normalizeTicker(ticker),
    };
    if (source) {
      query["sourceType"] = source;
    }
    if (jobId) {
      query["jobId"] = jobId;
    }
    return DocumentModel.find(query).sort({ publishedAt: -1, createdAt: -1 }).exec();
  }
}
