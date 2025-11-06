import { DocumentModel, VectorManifestModel } from "../../db/models";
import { clearTestMongo, setupTestMongo, teardownTestMongo } from "../../test-utils/mongo-memory";

import { IngestionRepository } from "./ingestion.repository";

describe("IngestionRepository", () => {
  const repository = new IngestionRepository();

  beforeAll(async () => {
    await setupTestMongo();
  });

  afterAll(async () => {
    await teardownTestMongo();
  });

  afterEach(async () => {
    await clearTestMongo();
  });

  it("ensures ticker documents are upserted in uppercase", async () => {
    const ticker = await repository.ensureTicker("tsla", "Tesla");
    expect(ticker?.symbol).toBe("TSLA");

    const updated = await repository.ensureTicker("TSLA", "Tesla Inc.");
    expect(updated?.name).toBe("Tesla Inc.");
  });

  it("deduplicates documents by text hash", async () => {
    const basePayload = {
      ticker: "aapl",
      sourceType: "sec" as const,
      textPath: "/tmp/aapl-10k.txt",
      textHash: "hash-123",
    };

    const first = await repository.upsertDocument(basePayload);
    const second = await repository.upsertDocument({
      ...basePayload,
      url: "https://example.com/aapl-10k",
    });

    expect(first?.id).toEqual(second?.id);
    await expect(DocumentModel.countDocuments()).resolves.toBe(1);
  });

  it("updates stage lifecycle state and exposes status DTO", async () => {
    const job = await repository.createJob("msft", ["download", "parse"]);

    const running = await repository.markStageRunning(job.id, "download");
    expect(running).not.toBeNull();
    expect(running?.status).toBe("running");
    expect(running?.currentStage).toBe("download");

    const completed = await repository.markStageComplete(job.id, "download");
    expect(completed?.stages.find((stage) => stage.name === "download")?.status).toBe("completed");

    const failed = await repository.failStage(job.id, "parse", {
      message: "Parsing failed",
    });

    expect(failed?.status).toBe("failed");
    expect(failed?.stages.find((stage) => stage.name === "parse")?.error?.message).toBe(
      "Parsing failed",
    );

    const latest = await repository.getJobStatus(job.id);
    expect(latest?.status).toBe("failed");
    expect(latest?.currentStage).toBe("parse");
  });

  it("merges vector manifest document ids without duplication", async () => {
    await repository.upsertVectorManifest({
      ticker: "goog",
      embeddingModel: "text-embedding-3-large",
      chunkSize: 600,
      overlap: 100,
      vectorStore: "faiss",
      docIds: ["doc-1"],
    });

    await repository.upsertVectorManifest({
      ticker: "goog",
      embeddingModel: "text-embedding-3-large",
      chunkSize: 600,
      overlap: 100,
      vectorStore: "faiss",
      docIds: ["doc-1", "doc-2"],
    });

    const manifest = await VectorManifestModel.findOne({ ticker: "GOOG" }).lean();
    expect(manifest).not.toBeNull();
    expect(manifest?.docIds.sort()).toEqual(["doc-1", "doc-2"]);
  });
});
