/* eslint-disable import/order, @typescript-eslint/no-unsafe-assignment */

import { Types } from "mongoose";

import type { IngestionJobDocument } from "../../db/models";
import { IngestionRepository } from "./ingestion.repository";
import { IngestionService } from "./ingestion.service";

describe("IngestionService", () => {
  const addMock = jest.fn();
  const queue = { add: addMock } as { add: typeof addMock };

  const repositoryMockInstance: jest.Mocked<IngestionRepository> = {
    ensureTicker: jest.fn(),
    createJob: jest.fn(),
    getJobStatus: jest.fn(),
    prepareJobForRetry: jest.fn(),
  } as unknown as jest.Mocked<IngestionRepository>;

  beforeEach(() => {
    addMock.mockResolvedValue(undefined);
    repositoryMockInstance.ensureTicker.mockReset();
    repositoryMockInstance.createJob.mockReset();
    repositoryMockInstance.getJobStatus.mockReset();
    repositoryMockInstance.prepareJobForRetry.mockReset();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  it("creates job and enqueues ingestion task", async () => {
    const jobDoc = {
      _id: new Types.ObjectId("507f191e810c19729de860ea"),
      id: "507f191e810c19729de860ea",
      ticker: "AAPL",
    } as unknown as IngestionJobDocument;
    repositoryMockInstance.createJob.mockResolvedValue(jobDoc);

    const service = new IngestionService(repositoryMockInstance, queue);
    const result = await service.startIngestion({ ticker: "AAPL", sources: ["sec"] });

    expect(result.jobId).toBe("507f191e810c19729de860ea");
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock.mock.calls[0][1]).toMatchObject({
      ticker: "AAPL",
      jobId: "507f191e810c19729de860ea",
      sources: ["sec"],
    });
  });

  it("returns status when job exists", async () => {
    repositoryMockInstance.getJobStatus.mockResolvedValue({
      jobId: "123",
      ticker: "AAPL",
      status: "queued",
      sources: ["sec"],
      progress: 0,
      currentStage: null,
      stages: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const service = new IngestionService(repositoryMockInstance, queue);
    const status = await service.getStatus("123");

    expect(status.jobId).toBe("123");
  });

  it("throws when retrying unknown job", async () => {
    repositoryMockInstance.prepareJobForRetry.mockResolvedValue(null);

    const service = new IngestionService(repositoryMockInstance, queue);

    await expect(service.retryJob("missing")).rejects.toThrow("not found");
  });
});
