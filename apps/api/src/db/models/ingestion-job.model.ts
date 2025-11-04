import { Schema, model } from "mongoose";

import { JobStageStatus, JobStageStatusSchema } from "@fin-rag/shared";

export interface IngestionStageDocument {
  name: string;
  status: JobStageStatus;
  progress: number;
  error?: string;
}

export interface IngestionJobDocument {
  ticker: string;
  status: "queued" | "running" | "failed" | "completed";
  stages: IngestionStageDocument[];
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

const stageSchema = new Schema<IngestionStageDocument>(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: JobStageStatusSchema.options
    },
    progress: { type: Number, min: 0, max: 1, default: 0 },
    error: { type: String }
  },
  { _id: false }
);

const ingestionJobSchema = new Schema<IngestionJobDocument>(
  {
    ticker: { type: String, required: true, index: true, uppercase: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["queued", "running", "failed", "completed"],
      default: "queued"
    },
    stages: { type: [stageSchema], default: [] },
    progress: { type: Number, min: 0, max: 1, default: 0 }
  },
  { timestamps: true }
);

ingestionJobSchema.index({ ticker: 1, createdAt: -1 });

ingestionJobSchema.index({ status: 1 });

export const IngestionJobModel = model<IngestionJobDocument>("IngestionJob", ingestionJobSchema);
