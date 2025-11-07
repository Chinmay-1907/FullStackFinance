import { promises as fs } from "node:fs";
import path from "node:path";

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

interface StoredVector {
  id: string;
  embedding: number[];
  magnitude: number;
  docId: string;
  snippet: string;
  sourceType: VectorChunkPayload["meta"]["sourceType"];
  metadata: VectorChunkPayload["meta"];
}

interface PersistedIndex {
  ticker: string;
  vectors: StoredVector[];
  embeddingModel?: string;
  chunkSize?: number;
  overlap?: number;
  updatedAt: string;
}

export interface FaissVectorStoreOptions {
  basePath?: string;
  snippetLength?: number;
}

const DEFAULT_BASE_PATH = path.resolve(process.cwd(), "data", "vector");
const DEFAULT_SNIPPET_LENGTH = 320;

const log = createModuleLogger("vector-store:faiss");

const normalizeTicker = (ticker: string) => ticker.trim().toUpperCase();

const ensureDirectory = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

export class FaissVectorStore implements IVectorStore {
  private readonly basePath: string;
  private readonly snippetLength: number;

  constructor(options: FaissVectorStoreOptions = {}) {
    this.basePath = options.basePath ?? DEFAULT_BASE_PATH;
    this.snippetLength = options.snippetLength ?? DEFAULT_SNIPPET_LENGTH;
  }

  private getTickerDir(ticker: string) {
    return path.join(this.basePath, normalizeTicker(ticker));
  }

  private getIndexPath(ticker: string) {
    return path.join(this.getTickerDir(ticker), "index.json");
  }

  private getManifestPath(ticker: string) {
    return path.join(this.getTickerDir(ticker), "manifest.json");
  }

  private async readIndex(ticker: string): Promise<PersistedIndex> {
    const indexPath = this.getIndexPath(ticker);
    try {
      const raw = await fs.readFile(indexPath, "utf8");
      const parsed = JSON.parse(raw) as PersistedIndex;
      return {
        ticker: normalizeTicker(ticker),
        vectors: parsed.vectors ?? [],
        embeddingModel: parsed.embeddingModel,
        chunkSize: parsed.chunkSize,
        overlap: parsed.overlap,
        updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          ticker: normalizeTicker(ticker),
          vectors: [],
          updatedAt: new Date(0).toISOString(),
        };
      }

      log.error({ err: error, ticker }, "Failed to read FAISS index");
      throw new AppError("Failed to load FAISS vector index", {
        code: "UPSTREAM_ERROR",
        status: 500,
        cause: error,
      });
    }
  }

  private async persistIndex(ticker: string, index: PersistedIndex) {
    const dir = this.getTickerDir(ticker);
    await ensureDirectory(dir);
    const payload = JSON.stringify(index, null, 2);
    await fs.writeFile(this.getIndexPath(ticker), payload, "utf8");
    const docIds = Array.from(new Set(index.vectors.map((vector) => vector.docId)));
    await fs.writeFile(
      this.getManifestPath(ticker),
      JSON.stringify(
        {
          ticker: normalizeTicker(ticker),
          embeddingModel: index.embeddingModel,
          chunkSize: index.chunkSize,
          overlap: index.overlap,
          vectorCount: index.vectors.length,
          docIds,
          updatedAt: index.updatedAt,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  private buildSnippet(text: string) {
    return text.replace(/\s+/g, " ").trim().slice(0, this.snippetLength);
  }

  private static vectorMagnitude(vector: number[]) {
    return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  }

  private static cosineSimilarity(a: number[], b: number[]) {
    const length = Math.min(a.length, b.length);
    if (length === 0) {
      return 0;
    }
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < length; i += 1) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dotProduct += valA * valB;
      magA += valA * valA;
      magB += valB * valB;
    }
    if (magA === 0 || magB === 0) {
      return 0;
    }
    return dotProduct / Math.sqrt(magA * magB);
  }

  async upsertChunks(
    chunks: VectorChunkPayload[],
    options: VectorUpsertOptions,
  ): Promise<VectorIndexSummary> {
    const ticker = normalizeTicker(options.ticker);
    const timestamp = new Date().toISOString();
    if (options.rebuild) {
      await this.flushTicker(ticker).catch((error) => {
        log.warn({ err: error, ticker }, "Failed to flush ticker prior to rebuild");
      });
    }
    let index = options.rebuild ? null : await this.readIndex(ticker);

    if (!index) {
      index = {
        ticker,
        vectors: [],
        updatedAt: timestamp,
        embeddingModel: options.embeddingModel,
        chunkSize: options.chunkSize,
        overlap: options.overlap,
      };
    }

    const vectorMap = new Map<string, StoredVector>(
      (options.rebuild ? [] : index.vectors).map((vector) => [vector.id, vector]),
    );

    chunks.forEach((chunk) => {
      const magnitude = FaissVectorStore.vectorMagnitude(chunk.embedding);
      const stored: StoredVector = {
        id: chunk.id,
        embedding: chunk.embedding,
        magnitude,
        docId: chunk.meta.docId,
        snippet: this.buildSnippet(chunk.text),
        sourceType: chunk.meta.sourceType,
        metadata: chunk.meta,
      };
      vectorMap.set(chunk.id, stored);
    });

    const vectors = Array.from(vectorMap.values());
    const summary: PersistedIndex = {
      ticker,
      vectors,
      updatedAt: timestamp,
      embeddingModel: options.embeddingModel,
      chunkSize: options.chunkSize,
      overlap: options.overlap,
    };

    await this.persistIndex(ticker, summary);

    log.info({ ticker, count: chunks.length }, "Persisted FAISS chunk vectors");

    const docIds = Array.from(
      new Set(vectors.map((vector) => vector.docId).filter((docId) => !!docId)),
    );

    return {
      ticker,
      vectorCount: vectors.length,
      docIds,
      updatedAt: timestamp,
    };
  }

  async deleteByDocIds(options: VectorDeleteOptions): Promise<number> {
    const ticker = normalizeTicker(options.ticker);
    const index = await this.readIndex(ticker);

    const docIdSet = new Set(options.docIds.map((id) => id.trim()));
    const filtered = index.vectors.filter((vector) => !docIdSet.has(vector.docId));
    const removed = index.vectors.length - filtered.length;
    if (removed === 0) {
      return 0;
    }

    const updated: PersistedIndex = {
      ...index,
      vectors: filtered,
      updatedAt: new Date().toISOString(),
    };

    await this.persistIndex(ticker, updated);
    log.info({ ticker, removed }, "Deleted FAISS vectors by doc ids");
    return removed;
  }

  async query(options: VectorQueryOptions): Promise<VectorQueryResultItem[]> {
    const ticker = normalizeTicker(options.ticker);
    const index = await this.readIndex(ticker);
    if (!index.vectors.length) {
      return [];
    }

    const filterDocIds = options.filterDocIds
      ? new Set(options.filterDocIds.map((id) => id.trim()))
      : null;

    const scored = index.vectors
      .filter((vector) => {
        if (!filterDocIds) {
          return true;
        }
        return filterDocIds.has(vector.docId);
      })
      .map<VectorQueryResultItem>((vector) => ({
        chunkId: vector.id,
        docId: vector.docId,
        snippet: vector.snippet,
        sourceType: vector.sourceType,
        score: FaissVectorStore.cosineSimilarity(options.embedding, vector.embedding),
        metadata: vector.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.k);

    return scored;
  }

  async flushTicker(ticker: string): Promise<void> {
    const target = this.getTickerDir(ticker);
    try {
      await fs.rm(target, { recursive: true, force: true });
      log.info({ ticker: normalizeTicker(ticker) }, "Cleared FAISS vector directory");
    } catch (error) {
      log.error({ err: error, ticker }, "Failed to delete FAISS ticker directory");
      throw new AppError("Failed to clear vector index", {
        code: "UPSTREAM_ERROR",
        status: 500,
        cause: error,
      });
    }
  }
}
