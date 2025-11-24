/* eslint-env jest */
/* eslint-disable import/order, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

import type { Express } from "express";
import { ConfigModelsResponseSchema, ConfigValidateResponseSchema } from "@fin-rag/shared";
import request from "supertest";

jest.mock("../ingestion/ingestion.service", () => ({
  IngestionService: jest.fn().mockImplementation(() => ({
    startIngestion: jest.fn(),
    getStatus: jest.fn(),
    retryJob: jest.fn(),
  })),
}));

import { resetEnvConfigCache } from "./config.service";

describe("config routes", () => {
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

  beforeEach(() => {
    process.env = { ...process.env };
    delete process.env["GROQ_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["TAVILY_API_KEY"];
    delete process.env["SEC_EMAIL"];
    resetEnvConfigCache();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetEnvConfigCache();
  });

  it("returns supported model metadata", async () => {
    const response = await request(app).get("/api/v1/config/models");

    expect(response.status).toBe(200);
    const parsed = ConfigModelsResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
  });

  it("reports missing credentials when not configured", async () => {
    const response = await request(app).post("/api/v1/config/validate").send({});

    expect(response.status).toBe(200);
    const parsed = ConfigValidateResponseSchema.parse(response.body);
    expect(parsed.ok).toBe(false);
    expect(parsed.missing).toEqual(
      expect.arrayContaining(["GROQ_API_KEY", "GEMINI_API_KEY", "TAVILY_API_KEY", "SEC_EMAIL"]),
    );
  });

  it("treats groq or gemini as optional alternatives", async () => {
    const response = await request(app)
      .post("/api/v1/config/validate")
      .send({
        groqKey: "abc",
        tavilyKey: "ghi",
        secEmail: "user@example.com",
      });

    expect(response.status).toBe(200);
    const parsed = ConfigValidateResponseSchema.parse(response.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.missing).not.toContain("GEMINI_API_KEY");
    expect(parsed.greeting).toMatch(/Test-mode hello/i);
    expect(parsed.greetingProvider).toBe("test");
  });

  it("accepts user-provided credentials to satisfy validation", async () => {
    process.env["GROQ_API_KEY"] = "";
    process.env["GEMINI_API_KEY"] = "";
    process.env["TAVILY_API_KEY"] = "";
    process.env["SEC_EMAIL"] = "";
    resetEnvConfigCache();

    const response = await request(app).post("/api/v1/config/validate").send({
      groqKey: "abc",
      geminiKey: "def",
      tavilyKey: "ghi",
      secEmail: "user@example.com",
    });

    expect(response.status).toBe(200);
    const parsed = ConfigValidateResponseSchema.parse(response.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.missing).toHaveLength(0);
    expect(parsed.greeting).toMatch(/Test-mode hello/i);
    expect(parsed.greetingProvider).toBe("test");
  });
});
