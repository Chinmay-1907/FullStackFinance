import {
  IngestionSourceSchema,
  type IngestionSource,
  JobStageStatusSchema,
  type JobStageStatus,
} from "@fin-rag/shared";
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

export const INGESTION_STAGE_SEQUENCE = [
  "download",
  "ocr",
  "review",
  "clean",
  "chunk",
  "embed",
  "persist",
] as const;

export type IngestionStageName = (typeof INGESTION_STAGE_SEQUENCE)[number];

const STAGE_ORDER = new Map(INGESTION_STAGE_SEQUENCE.map((name, index) => [name, index]));

export type IngestionJobStatus = "queued" | "running" | "failed" | "completed" | "awaiting_approval";

export interface StageErrorMetadata {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface StageStatusTimestamps {
  pendingAt?: Date;
  runningAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  updatedAt: Date;
}

export interface IngestionStageMetadata {
  name: IngestionStageName;
  status: JobStageStatus;
  progress: number;
  error?: StageErrorMetadata;
  statusTimestamps: StageStatusTimestamps;
}

export interface JobStatusTimestamps {
  queuedAt?: Date;
  runningAt?: Date;
  failedAt?: Date;
  completedAt?: Date;
  awaitingApprovalAt?: Date;
  updatedAt: Date;
}

export interface IngestionJobMetadata {
  ticker: string;
  status: IngestionJobStatus;
  sources: IngestionSource[];
  stages: Types.DocumentArray<IngestionStageDocument>;
  progress: number;
  statusTimestamps: JobStatusTimestamps;
  createdAt: Date;
  updatedAt: Date;
}

export type IngestionStageDocument = Types.Subdocument & IngestionStageMetadata;
export type IngestionJobDocument = HydratedDocument<IngestionJobMetadata, IngestionJobMethods>;

export interface IngestionJobMethods {
  updateStage(
    stageName: IngestionStageName,
    updates: Partial<Omit<IngestionStageMetadata, "name">>,
  ): IngestionJobDocument;
  markStageRunning(stageName: IngestionStageName): IngestionJobDocument;
  markStageComplete(stageName: IngestionStageName): IngestionJobDocument;
  failStage(stageName: IngestionStageName, error: StageErrorMetadata): IngestionJobDocument;
  setStatus(status: IngestionJobStatus): IngestionJobDocument;
  recalculateProgress(): IngestionJobDocument;
  getStage(stageName: IngestionStageName): IngestionStageDocument | undefined;
  getNextPendingStage(): IngestionStageDocument | undefined;
  getPendingStages(): IngestionStageDocument[];
  getCompletedStages(): IngestionStageDocument[];
  prepareForRetry(): IngestionJobDocument;
}

export interface IngestionJobModelStatics
  extends Model<IngestionJobMetadata, unknown, IngestionJobMethods> {
  findLatestByTicker(ticker: string): Promise<IngestionJobDocument | null>;
}

const stageErrorSchema = new Schema<StageErrorMetadata>(
  {
    message: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const stageTimestampSchema = new Schema<StageStatusTimestamps>(
  {
    pendingAt: { type: Date, default: () => new Date() },
    runningAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const stageSchema = new Schema<IngestionStageMetadata>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      enum: INGESTION_STAGE_SEQUENCE,
    },
    status: {
      type: String,
      required: true,
      enum: JobStageStatusSchema.options,
      default: "pending",
    },
    progress: { type: Number, min: 0, max: 1, default: 0 },
    error: { type: stageErrorSchema },
    statusTimestamps: {
      type: stageTimestampSchema,
      default: () => ({
        pendingAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  },
  { _id: false },
);

const jobTimestampSchema = new Schema<JobStatusTimestamps>(
  {
    queuedAt: { type: Date, default: () => new Date() },
    runningAt: { type: Date },
    failedAt: { type: Date },
    completedAt: { type: Date },
    awaitingApprovalAt: { type: Date },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const ingestionJobSchema = new Schema<
  IngestionJobMetadata,
  IngestionJobModelStatics,
  IngestionJobMethods
>(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["queued", "running", "failed", "completed", "awaiting_approval"],
      default: "queued",
    },
    sources: {
      type: [String],
      enum: IngestionSourceSchema.options,
      default: [],
    },
    stages: { type: [stageSchema], default: [] },
    progress: { type: Number, min: 0, max: 1, default: 0 },
    statusTimestamps: {
      type: jobTimestampSchema,
      default: () => ({
        queuedAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  },
  { timestamps: true },
);

const stageStatusFieldMap: Record<JobStageStatus, keyof StageStatusTimestamps> = {
  pending: "pendingAt",
  running: "runningAt",
  completed: "completedAt",
  failed: "failedAt",
};

const jobStatusFieldMap: Record<IngestionJobStatus, keyof JobStatusTimestamps> = {
  queued: "queuedAt",
  running: "runningAt",
  failed: "failedAt",
  completed: "completedAt",
  awaiting_approval: "awaitingApprovalAt",
};

const touchStageTimestamp = (stage: IngestionStageDocument, status: JobStageStatus) => {
  const field = stageStatusFieldMap[status];
  if (!stage.statusTimestamps[field]) {
    stage.statusTimestamps[field] = new Date();
  }
  stage.statusTimestamps.updatedAt = new Date();
};

const touchJobTimestamp = (job: IngestionJobDocument, status: IngestionJobStatus) => {
  const field = jobStatusFieldMap[status];
  if (!job.statusTimestamps[field]) {
    job.statusTimestamps[field] = new Date();
  }
  job.statusTimestamps.updatedAt = new Date();
};

const recalculateProgress = (job: IngestionJobDocument) => {
  if (job.stages.length === 0) {
    job.progress = 0;
    return;
  }

  const total = job.stages.reduce((sum, stage) => sum + stage.progress, 0);
  job.progress = Math.min(1, Math.max(0, total / job.stages.length));
};

const sortStages = (job: IngestionJobDocument) => {
  job.stages.sort((a, b) => {
    const left = STAGE_ORDER.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const right = STAGE_ORDER.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
};

ingestionJobSchema.methods.updateStage = function updateStage(stageName, updates) {
  if (!STAGE_ORDER.has(stageName)) {
    throw new Error(`Unknown ingestion stage: ${stageName}`);
  }

  let stage = this.stages.find((item) => item.name === stageName);

  if (!stage) {
    const status = updates.status ?? "pending";
    const stagePayload: Partial<IngestionStageMetadata> = {
      name: stageName,
      status,
      progress: updates.progress ?? 0,
      error: updates.error,
    };
    if (updates.statusTimestamps) {
      stagePayload.statusTimestamps = updates.statusTimestamps;
    }
    stage = this.stages.create(stagePayload);
    touchStageTimestamp(stage, status);
    this.stages.push(stage);
    sortStages(this);
  } else {
    if (updates.status) {
      stage.status = updates.status;
      touchStageTimestamp(stage, updates.status);
    }
    if (typeof updates.progress === "number") {
      stage.progress = Math.min(1, Math.max(0, updates.progress));
    }
    if (updates.error !== undefined) {
      stage.error = updates.error;
    }
    stage.statusTimestamps.updatedAt = new Date();
  }
  sortStages(this);

  recalculateProgress(this);
  this.statusTimestamps.updatedAt = new Date();

  return this;
};

ingestionJobSchema.methods.markStageRunning = function markStageRunning(stageName) {
  this.updateStage(stageName, { status: "running" });
  this.setStatus("running");
  return this;
};

ingestionJobSchema.methods.markStageComplete = function markStageComplete(stageName) {
  this.updateStage(stageName, { status: "completed", progress: 1 });
  recalculateProgress(this);

  if (this.stages.every((stage) => stage.status === "completed")) {
    this.setStatus("completed");
  }

  return this;
};

ingestionJobSchema.methods.failStage = function failStage(stageName, error) {
  this.updateStage(stageName, { status: "failed", error });
  this.setStatus("failed");
  return this;
};

ingestionJobSchema.methods.setStatus = function setStatus(status) {
  this.status = status;
  touchJobTimestamp(this, status);
  return this;
};

ingestionJobSchema.methods.recalculateProgress = function recalculate() {
  recalculateProgress(this);
  return this;
};

ingestionJobSchema.methods.getStage = function getStage(stageName) {
  return this.stages.find((stage) => stage.name === stageName);
};

ingestionJobSchema.methods.getPendingStages = function getPendingStages() {
  return this.stages.filter((stage) => stage.status !== "completed");
};

ingestionJobSchema.methods.getCompletedStages = function getCompletedStages() {
  return this.stages.filter((stage) => stage.status === "completed");
};

ingestionJobSchema.methods.getNextPendingStage = function getNextPendingStage() {
  return this.stages.find((stage) => stage.status !== "completed");
};

ingestionJobSchema.methods.prepareForRetry = function prepareForRetry() {
  this.stages.forEach((stage) => {
    if (stage.status === "completed") {
      stage.progress = 1;
      stage.error = undefined;
      return;
    }

    stage.status = "pending";
    stage.progress = 0;
    stage.error = undefined;
    stage.statusTimestamps.runningAt = undefined;
    stage.statusTimestamps.failedAt = undefined;
    touchStageTimestamp(stage, "pending");
  });

  sortStages(this);
  this.setStatus("queued");
  this.recalculateProgress();
  return this;
};

ingestionJobSchema.static("findLatestByTicker", function findLatestByTicker(ticker: string) {
  return this.findOne({ ticker }).sort({ createdAt: -1 });
});

ingestionJobSchema.index({ ticker: 1, createdAt: -1 });
ingestionJobSchema.index({ status: 1 });
ingestionJobSchema.index(
  { "statusTimestamps.runningAt": 1 },
  { partialFilterExpression: { status: "running" } },
);

export const IngestionJobModel = model<IngestionJobMetadata, IngestionJobModelStatics>(
  "IngestionJob",
  ingestionJobSchema,
);
