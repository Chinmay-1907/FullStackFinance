import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  createIngestionJob,
  ensureTicker,
  getLatestJobForTicker,
  getVectorManifest,
  markJobStatus,
  persistDocuments,
  updateJobStage,
  upsertVectorManifest
} from "./ingestion.repository";
import { IngestionJobModel, TickerModel } from "../../db/models";

describe("ingestion.repository", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("ensures ticker documents are created idempotently", async () => {
    await ensureTicker("AAPL", "Apple Inc.");
    await ensureTicker("aapl", "Apple Inc");

    const tickers = await TickerModel.find().lean();
    expect(tickers).toHaveLength(1);
    expect(tickers[0]?.symbol).toBe("AAPL");
  });

  it("persists documents without duplicating hashes", async () => {
    const firstResult = await persistDocuments([
      {
        ticker: "AAPL",
        sourceType: "sec",
        textPath: "/tmp/aapl.txt",
        textHash: "hash-1"
      },
      {
        ticker: "AAPL",
        sourceType: "news",
        textPath: "/tmp/aapl-news.txt",
        textHash: "hash-2",
        url: "https://example.com"
      }
    ]);

    expect(firstResult.inserted).toBe(2);

    const secondResult = await persistDocuments([
      {
        ticker: "AAPL",
        sourceType: "sec",
        textPath: "/tmp/aapl-new.txt",
        textHash: "hash-1",
        formType: "10-K"
      }
    ]);

    expect(secondResult.inserted).toBe(0);

    const documents = await mongoose.connection.collection("documents").find().toArray();
    expect(documents).toHaveLength(2);
  });

  it("updates job stages and status", async () => {
    const job = await createIngestionJob("MSFT");

    await updateJobStage(job.id, "download", { status: "running", progress: 0.5 });
    await updateJobStage(job.id, "download", { status: "completed", progress: 1 });
    await markJobStatus(job.id, "completed");

    const stored = await IngestionJobModel.findById(job.id).lean();
    expect(stored?.status).toBe("completed");
    expect(stored?.stages[0]?.status).toBe("completed");
    expect(stored?.progress).toBeGreaterThan(0);
  });

  it("upserts vector manifests and retrieves the latest job", async () => {
    await createIngestionJob("TSLA");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const newerJob = await createIngestionJob("TSLA");

    await upsertVectorManifest({
      ticker: "TSLA",
      embeddingModel: "text-embedding-3-large",
      chunkSize: 800,
      overlap: 100,
      vectorStore: "faiss",
      docIds: ["doc-1", "doc-2"]
    });

    const manifest = await getVectorManifest("tsla");
    expect(manifest?.docIds).toEqual(["doc-1", "doc-2"]);

    const latestJob = await getLatestJobForTicker("TSLA");
    expect(latestJob?.id).toBe(newerJob.id);
  });
});
