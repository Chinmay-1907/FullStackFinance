import { IngestionSourceSchema, type IngestionSource } from "@fin-rag/shared";
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

export interface DocumentMetadata {
  ticker: string;
  sourceType: IngestionSource;
  url?: string;
  formType?: string;
  publishedAt?: Date;
  textPath: string;
  textHash: string;
  bytes?: number;
}

export type StoredDocument = HydratedDocument<DocumentMetadata>;

export interface DocumentModelStatics extends Model<DocumentMetadata> {
  findByHash(textHash: string): Promise<StoredDocument | null>;
}

const documentSchema = new Schema<DocumentMetadata, DocumentModelStatics>(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true },
    sourceType: {
      type: String,
      required: true,
      enum: IngestionSourceSchema.options,
    },
    url: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    formType: { type: String, trim: true },
    publishedAt: { type: Date },
    textPath: { type: String, required: true, trim: true },
    textHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    bytes: { type: Number, min: 0 },
  },
  { timestamps: true },
);

documentSchema.index({ ticker: 1, sourceType: 1, publishedAt: -1 });
documentSchema.index({ textHash: "hashed" });

documentSchema.static("findByHash", function findByHash(textHash: string) {
  return this.findOne({ textHash });
});

export const DocumentModel = model<DocumentMetadata, DocumentModelStatics>(
  "Document",
  documentSchema,
);
