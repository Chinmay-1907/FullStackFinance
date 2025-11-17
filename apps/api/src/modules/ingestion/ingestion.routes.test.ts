/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import type { Express } from "express";
import request from "supertest";

import { resetEnvConfigCache } from "../config/config.service";

jest.mock("./ingestion.service", () => {
  const startIngestion = jest.fn();
  const getStatus = jest.fn();
  const retryJob = jest.fn();

  return {
    IngestionService: jest.fn().mockImplementation(() => ({
      startIngestion,
      getStatus,
      retryJob,
    })),
    __mocks: { startIngestion, getStatus, retryJob },
  };
});

const {
  startIngestion: startIngestionMock,
  getStatus: getStatusMock,
  retryJob: retryJobMock,
} = (
  jest.requireMock("./ingestion.service") as {
    __mocks: {
      startIngestion: jest.Mock;
      getStatus: jest.Mock;
      retryJob: jest.Mock;
    };
  }
).__mocks;

describe("Ingestion routes", () => {
  const originalEnv = process.env;
  let app: Express;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      PORT: "3001",
      MONGO_URI: "mongodb://localhost:27017/test",
      REDIS_URL: "redis://localhost:6379",
      VECTOR_STORE: "faiss",
    };
    resetEnvConfigCache();
    app = (await import("../../app")).app;
  });

  afterAll(() => {
    process.env = originalEnv;
    resetEnvConfigCache();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts ingestion and returns job id", async () => {
    startIngestionMock.mockResolvedValue({ jobId: "abc123" });

    const response = await request(app)
      .post("/api/v1/ingestion/start")
      .send({ ticker: "AAPL", sources: ["sec"] })
      .expect(202);

    expect(response.body).toEqual({ jobId: "abc123" });
    expect(startIngestionMock).toHaveBeenCalledWith({ ticker: "AAPL", sources: ["sec"] });
  });

  it("returns status for job", async () => {
    const statusPayload = {
      jobId: "abc",
      ticker: "AAPL",
      status: "queued",
      progress: 0,
      currentStage: null,
      stages: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    getStatusMock.mockResolvedValue(statusPayload);

    const response = await request(app).get("/api/v1/ingestion/status/abc").expect(200);

    expect(response.body).toEqual(statusPayload);
    expect(getStatusMock).toHaveBeenCalledWith("abc");
  });

  it("retries ingestion job", async () => {
    const statusPayload = {
      jobId: "abc",
      ticker: "AAPL",
      status: "queued",
      progress: 0,
      currentStage: null,
      stages: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    retryJobMock.mockResolvedValue(statusPayload);

    const response = await request(app).post("/api/v1/ingestion/retry/abc").expect(202);

    expect(response.body).toEqual(statusPayload);
    expect(retryJobMock).toHaveBeenCalledWith("abc");
  });

  it("validates payloads and returns 400 on invalid request", async () => {
    const response = await request(app).post("/api/v1/ingestion/start").send({}).expect(400);

    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(startIngestionMock).not.toHaveBeenCalled();
  });
});
