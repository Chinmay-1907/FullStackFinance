import { Schema, model } from "mongoose";

import { IngestionSource, IngestionSourceSchema } from "@fin-rag/shared";

export interface StoredDocument {
  ticker: string;
  sourceType: IngestionSource;
  url?: string;
  formType?: string;
  publishedAt?: Date;
  textPath: string;
  textHash: string;
  bytes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<StoredDocument>(
  {
    ticker: { type: String, required: true, index: true, uppercase: true, trim: true },
    sourceType: {
      type: String,
      required: true,
      enum: IngestionSourceSchema.options
    },
    url: {
      type: String,
      unique: true,
      sparse: true
    },
    formType: {
      type: String,
      trim: true
    },
    publishedAt: {
      type: Date
    },
    textPath: {
      type: String,
      required: true
    },
    textHash: {
      type: String,
      required: true,
      unique: true
    },
    bytes: {
      type: Number
    }
  },
  { timestamps: true }
);

documentSchema.index({ ticker: 1, sourceType: 1, publishedAt: -1 });
documentSchema.index({ textHash: 1 }, { unique: true });

export const DocumentModel = model<StoredDocument>("Document", documentSchema);
