/* eslint-env jest */
/* eslint-disable import/order, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { ConfigModelsResponseSchema, ConfigValidateResponseSchema } from "@fin-rag/shared";
import request from "supertest";
import { app } from "../../app";
import { resetEnvConfigCache } from "./config.service";

describe("config routes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env["NODE_ENV"] = "test";
    process.env["PORT"] = "3001";
    process.env["MONGO_URI"] = "mongodb://localhost:27017/test";
    process.env["REDIS_URL"] = "redis://localhost:6379";
    process.env["VECTOR_STORE"] = "faiss";
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
  });
});
