import { VectorStoreTypeSchema, type VectorStoreType } from "@fin-rag/shared";
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

export interface VectorManifestMetadata {
  ticker: string;
  embeddingModel: string;
  chunkSize: number;
  overlap: number;
  vectorStore: VectorStoreType;
  docIds: string[];
}

export type VectorManifestDocument = HydratedDocument<VectorManifestMetadata>;

export interface VectorManifestUpsertOptions {
  replaceDocIds?: boolean;
}

export interface VectorManifestModelStatics extends Model<VectorManifestMetadata> {
  upsertManifest(
    manifest: VectorManifestMetadata,
    options?: VectorManifestUpsertOptions,
  ): Promise<VectorManifestDocument>;
}

const vectorManifestSchema = new Schema<VectorManifestMetadata, VectorManifestModelStatics>(
  {
    ticker: { type: String, required: true, unique: true, uppercase: true, trim: true },
    embeddingModel: { type: String, required: true, trim: true },
    chunkSize: { type: Number, required: true, min: 1 },
    overlap: { type: Number, required: true, min: 0 },
    vectorStore: {
      type: String,
      required: true,
      enum: VectorStoreTypeSchema.options,
    },
    docIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

vectorManifestSchema.static(
  "upsertManifest",
  async function upsertManifest(
    manifest: VectorManifestMetadata,
    options: VectorManifestUpsertOptions = {},
  ) {
    const existing = options.replaceDocIds ? null : await this.findOne({ ticker: manifest.ticker });

    const mergedIds = options.replaceDocIds
      ? manifest.docIds
      : [...(existing?.docIds ?? []), ...(manifest.docIds ?? [])];

    const docIds = Array.from(new Set(mergedIds.map((id) => id.trim()).filter(Boolean)));

    return this.findOneAndUpdate(
      { ticker: manifest.ticker },
      {
        $set: {
          embeddingModel: manifest.embeddingModel,
          chunkSize: manifest.chunkSize,
          overlap: manifest.overlap,
          vectorStore: manifest.vectorStore,
          docIds,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  },
);

export const VectorManifestModel = model<VectorManifestMetadata, VectorManifestModelStatics>(
  "VectorManifest",
  vectorManifestSchema,
);
