import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { VectorStoreType } from "@fin-rag/shared";

import { VectorManifestModel } from "../../../db/models";
import { clearTestMongo, setupTestMongo, teardownTestMongo } from "../../../test-utils/mongo-memory";
import { FaissVectorStore } from "../vector-store/faiss.vector-store";
import type { VectorChunkPayload } from "../vector-store/vector-store.types";
import { VectorStoreService } from "../vectorstore.service";

const VECTOR_STORE_TYPE: VectorStoreType = "faiss";

const createVectorPayload = (
  id: string,
  text: string,
  embedding: number[],
  docId = `doc-${id}`,
): VectorChunkPayload => ({
  id,
  text,
  embedding,
  meta: {
    docId,
    ticker: "TEST",
    sourceType: "sec",
    sequence: Number.parseInt(id.replace(/\D+/g, ""), 10) || 0,
    stage: "chunked",
  },
});

const createService = async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "faiss-test-"));
  const vectorStore = new FaissVectorStore({ basePath: tempDir });
  const service = new VectorStoreService(vectorStore, VectorManifestModel, VECTOR_STORE_TYPE);

  const cleanup = async () => {
    await rm(tempDir, { recursive: true, force: true });
  };

  return { service, cleanup, tempDir };
};

describe("VectorStoreService", () => {
  beforeAll(async () => {
    await setupTestMongo();
  });

  afterAll(async () => {
    await teardownTestMongo();
  });

  afterEach(async () => {
    await clearTestMongo();
  });

  it("persists manifests with doc ids on upsert", async () => {
    const resources = await createService();
    try {
      const vectors = [
        createVectorPayload("chunk-1", "Revenue increased 20%", [0.1, 0.2, 0.3]),
        createVectorPayload("chunk-2", "Margins expanded", [0.4, 0.5, 0.6]),
      ];

      await resources.service.upsertVectors({
        ticker: "test",
        embeddingModel: "text-embedding-3-large",
        chunkSize: 600,
        overlap: 80,
        vectors,
      });

      const manifest = await VectorManifestModel.findOne({ ticker: "TEST" }).lean();
      expect(manifest).not.toBeNull();
      expect(manifest?.docIds.sort()).toEqual(["doc-chunk-1", "doc-chunk-2"].sort());
    } finally {
      await resources.cleanup();
    }
  });

  it("replaces manifests when rebuild flag is provided", async () => {
    const resources = await createService();
    try {
      await resources.service.upsertVectors({
        ticker: "test",
        embeddingModel: "text-embedding-3-large",
        chunkSize: 600,
        overlap: 80,
        vectors: [
          createVectorPayload("chunk-1", "Revenue increased 20%", [0.1, 0.2, 0.3], "doc-a"),
          createVectorPayload("chunk-2", "Margins expanded", [0.4, 0.5, 0.6], "doc-b"),
        ],
      });

      await resources.service.upsertVectors({
        ticker: "test",
        embeddingModel: "text-embedding-3-large",
        chunkSize: 600,
        overlap: 80,
        rebuild: true,
        vectors: [createVectorPayload("chunk-3", "Cash flow improved", [0.7, 0.1, 0.1], "doc-c")],
      });

      const manifest = await VectorManifestModel.findOne({ ticker: "TEST" }).lean();
      expect(manifest?.docIds).toEqual(["doc-c"]);

      const indexPath = path.join(resources.tempDir, "TEST", "index.json");
      const raw = await readFile(indexPath, "utf8");
      const index = JSON.parse(raw) as { vectors: Array<unknown> };
      expect(index.vectors).toHaveLength(1);
    } finally {
      await resources.cleanup();
    }
  });

  it("queries top chunks ordered by cosine similarity", async () => {
    const resources = await createService();
    try {
      await resources.service.upsertVectors({
        ticker: "test",
        embeddingModel: "text-embedding-3-large",
        chunkSize: 600,
        overlap: 80,
        vectors: [
          createVectorPayload("chunk-1", "Alpha chunk", [0.99, 0.01]),
          createVectorPayload("chunk-2", "Beta chunk", [0.1, 0.9]),
        ],
      });

      const results = await resources.service.query({
        ticker: "test",
        embedding: [0.98, 0.02],
        k: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.docId).toBe("doc-chunk-1");
      expect(results[0]?.snippet).toContain("Alpha");
    } finally {
      await resources.cleanup();
    }
  });
});
