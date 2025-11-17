/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import type { Express } from "express";
import request from "supertest";

import { resetEnvConfigCache } from "../config/config.service";

const streamQueryMock = jest.fn();

jest.mock("./rag.service", () => ({
  RagService: jest.fn().mockImplementation(() => ({
    streamQuery: streamQueryMock,
  })),
}));

const parseSse = (payload: string) =>
  payload
    .split("\n\n")
    .filter(Boolean)
    .map((segment) => {
      const lines = segment.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.replace("event:", "").trim();
      const dataLine = lines.find((line) => line.startsWith("data:"))?.replace("data:", "").trim();
      return {
        event,
        data: dataLine ? JSON.parse(dataLine) : null,
      };
    });

describe("rag routes", () => {
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
    streamQueryMock.mockReset();
  });

  it("streams SSE events from the rag service", async () => {
    const generatorEvents = [
      {
        type: "retrieval" as const,
        data: { ticker: "MSFT", chunkCount: 1, citations: [{ docId: "doc-1", snippet: "snippet" }] },
      },
      { type: "token" as const, data: { token: "Hello " } },
      { type: "token" as const, data: { token: "world" } },
      {
        type: "done" as const,
        data: {
          answer: "Hello world [1]",
          citations: [{ docId: "doc-1", snippet: "snippet" }],
          latencyMs: 42,
        },
      },
    ];

    streamQueryMock.mockImplementation(async function* () {
      for (const event of generatorEvents) {
        yield event;
      }
    });

    const response = await request(app)
      .post("/api/v1/rag/query")
      .send({ ticker: "msft", question: "How is revenue?", k: 2 })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => callback(null, data));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = parseSse(response.body as string);
    expect(streamQueryMock).toHaveBeenCalledWith(
      { ticker: "msft", question: "How is revenue?", k: 2 },
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    expect(events[0]).toMatchObject({ event: "retrieval", data: { chunkCount: 1 } });
    const tokens = events.filter((event) => event.event === "token");
    expect(tokens).toHaveLength(2);
    const completion = events.find((event) => event.event === "done");
    expect(completion?.data?.answer).toContain("[1]");
    expect(completion?.data?.latencyMs).toBe(42);
  });

  it("returns validation errors for malformed payloads", async () => {
    const response = await request(app).post("/api/v1/rag/query").send({}).expect(400);

    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(streamQueryMock).not.toHaveBeenCalled();
  });
});
