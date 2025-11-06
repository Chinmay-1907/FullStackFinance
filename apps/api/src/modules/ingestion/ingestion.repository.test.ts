import { DocumentModel, INGESTION_STAGE_SEQUENCE, VectorManifestModel } from "../../db/models";
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
    const pipeline = [INGESTION_STAGE_SEQUENCE[0], INGESTION_STAGE_SEQUENCE[1]];
    const job = await repository.createJob("msft", pipeline);

    const running = await repository.markStageRunning(job.id, INGESTION_STAGE_SEQUENCE[0]);
    expect(running).not.toBeNull();
    expect(running?.status).toBe("running");
    expect(running?.currentStage).toBe(INGESTION_STAGE_SEQUENCE[0]);

    const completed = await repository.markStageComplete(job.id, INGESTION_STAGE_SEQUENCE[0]);
    expect(
      completed?.stages.find((stage) => stage.name === INGESTION_STAGE_SEQUENCE[0])?.status,
    ).toBe("completed");

    const failed = await repository.failStage(job.id, INGESTION_STAGE_SEQUENCE[1], {
      message: "Stage failed",
    });

    expect(failed?.status).toBe("failed");
    expect(
      failed?.stages.find((stage) => stage.name === INGESTION_STAGE_SEQUENCE[1])?.error?.message,
    ).toBe("Stage failed");

    const latest = await repository.getJobStatus(job.id);
    expect(latest?.status).toBe("failed");
    expect(latest?.currentStage).toBe(INGESTION_STAGE_SEQUENCE[1]);
  });

  it("prepares failed jobs for retry while preserving completed stages", async () => {
    const job = await repository.createJob("nvda", INGESTION_STAGE_SEQUENCE.slice(0, 3));

    await repository.markStageRunning(job.id, INGESTION_STAGE_SEQUENCE[0]);
    await repository.markStageComplete(job.id, INGESTION_STAGE_SEQUENCE[0]);
    await repository.markStageRunning(job.id, INGESTION_STAGE_SEQUENCE[1]);
    await repository.failStage(job.id, INGESTION_STAGE_SEQUENCE[1], {
      message: "OCR failed",
    });

    const prepared = await repository.prepareJobForRetry(job.id);
    expect(prepared?.status).toBe("queued");
    const stages = prepared?.stages ?? [];

    const downloadStage = stages.find((stage) => stage.name === INGESTION_STAGE_SEQUENCE[0]);
    expect(downloadStage?.status).toBe("completed");
    expect(downloadStage?.progress).toBe(1);

    const ocrStage = stages.find((stage) => stage.name === INGESTION_STAGE_SEQUENCE[1]);
    expect(ocrStage?.status).toBe("pending");
    expect(ocrStage?.progress).toBe(0);
    expect(ocrStage?.error).toBeUndefined();
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
