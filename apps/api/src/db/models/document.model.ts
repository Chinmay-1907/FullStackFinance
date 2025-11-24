import { IngestionSourceSchema, type IngestionSource } from "@fin-rag/shared";
import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { createModuleLogger } from "../../utils/logger";

export interface DocumentMetadata {
  ticker: string;
  sourceType: IngestionSource;
  url?: string;
  formType?: string;
  publishedAt?: Date;
  textPath: string;
  textHash: string;
  bytes?: number;
  jobId?: string;
  approvalStatus?: "pending" | "approved" | "rejected" | "processed";
  rawTextPath?: string;
  rawTextHash?: string;
  metadata?: Record<string, unknown>;
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
      trim: true,
    },
    bytes: { type: Number, min: 0 },
    jobId: { type: String, trim: true, index: true },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "processed"],
      default: "pending",
    },
    rawTextPath: { type: String, trim: true },
    rawTextHash: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

documentSchema.index({ ticker: 1, sourceType: 1, publishedAt: -1 });
documentSchema.index({ textHash: 1, jobId: 1 }, { name: "textHash_jobId", unique: false });

documentSchema.static("findByHash", function findByHash(textHash: string) {
  return this.findOne({ textHash });
});

export const DocumentModel = model<DocumentMetadata, DocumentModelStatics>(
  "Document",
  documentSchema,
);

const documentLogger = createModuleLogger("db:document");

const dropLegacyTextHashIndex = async () => {
  try {
    await DocumentModel.collection.dropIndex("textHash_1");
    documentLogger.info("Dropped legacy unique textHash index");
  } catch (error) {
    const mongoError = error as { code?: number; message: string };
    if (
      mongoError.code === 27 ||
      /ns not found/i.test(mongoError.message) ||
      /index not found/i.test(mongoError.message)
    ) {
      return;
    }
    documentLogger.warn({ err: mongoError }, "Failed to drop legacy textHash index");
  }
};

if (DocumentModel.db.readyState === 1) {
  void dropLegacyTextHashIndex();
} else {
  DocumentModel.db.once("open", () => {
    void dropLegacyTextHashIndex();
  });
}
