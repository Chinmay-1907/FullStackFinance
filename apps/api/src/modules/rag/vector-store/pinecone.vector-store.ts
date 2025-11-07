import { AppError } from "../../../utils/errors";
import { createModuleLogger } from "../../../utils/logger";
import type {
  IVectorStore,
  VectorChunkPayload,
  VectorDeleteOptions,
  VectorIndexSummary,
  VectorQueryOptions,
  VectorQueryResultItem,
  VectorUpsertOptions,
} from "./vector-store.types";

export interface PineconeVectorStoreOptions {
  apiKey?: string;
  indexName?: string;
  environment?: string;
}

const log = createModuleLogger("vector-store:pinecone");

const notImplemented = () =>
  new AppError("Pinecone vector store integration is not configured", {
    code: "UPSTREAM_ERROR",
    status: 501,
  });

/**
 * Placeholder pinecone adapter. This is intentionally skeletal until production
 * credentials and index metadata are finalized.
 * TODO: Wire up @pinecone-database/pinecone client once API keys + environment variables are provisioned.
 */
export class PineconeVectorStore implements IVectorStore {
  constructor(private readonly options: PineconeVectorStoreOptions = {}) {
    if (!options.apiKey) {
      log.warn(
        "PineconeVectorStore initialized without API key. Configure PINECONE_API_KEY and PINECONE_INDEX.",
      );
    }
  }

  async upsertChunks(
    _chunks: VectorChunkPayload[],
    _options: VectorUpsertOptions,
  ): Promise<VectorIndexSummary> {
    throw notImplemented();
  }

  async deleteByDocIds(_options: VectorDeleteOptions): Promise<number> {
    throw notImplemented();
  }

  async query(_options: VectorQueryOptions): Promise<VectorQueryResultItem[]> {
    throw notImplemented();
  }

  async flushTicker(_ticker: string): Promise<void> {
    throw notImplemented();
  }
}
