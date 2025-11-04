import { Schema, model } from "mongoose";

import { VectorStoreType, VectorStoreTypeSchema } from "@fin-rag/shared";

export interface VectorManifestDocument {
  ticker: string;
  embeddingModel: string;
  chunkSize: number;
  overlap: number;
  vectorStore: VectorStoreType;
  docIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const vectorManifestSchema = new Schema<VectorManifestDocument>(
  {
    ticker: { type: String, required: true, unique: true, uppercase: true, trim: true },
    embeddingModel: { type: String, required: true },
    chunkSize: { type: Number, required: true },
    overlap: { type: Number, required: true },
    vectorStore: {
      type: String,
      required: true,
      enum: VectorStoreTypeSchema.options
    },
    docIds: { type: [String], default: [] }
  },
  { timestamps: true }
);

vectorManifestSchema.index({ ticker: 1 }, { unique: true });

export const VectorManifestModel = model<VectorManifestDocument>(
  "VectorManifest",
  vectorManifestSchema
);
