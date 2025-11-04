/* eslint-env jest */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { EnvSchema } from "./env.schema";

describe("EnvSchema", () => {
  const baseEnv = {
    NODE_ENV: "test",
    PORT: "4000",
    MONGO_URI: "mongodb://localhost:27017/test",
    REDIS_URL: "redis://localhost:6379",
    VECTOR_STORE: "faiss",
    OTEL_ENABLED: "false",
  } as const;

  it("parses valid environment variables", () => {
    const parsed = EnvSchema.parse(baseEnv);

    expect(parsed.mongoUri).toBe(baseEnv.MONGO_URI);
    expect(parsed.redisUrl).toBe(baseEnv.REDIS_URL);
    expect(parsed.port).toBe(4000);
    expect(parsed.vectorStore).toBe("faiss");
    expect(parsed.otel.enabled).toBe(false);
  });

  it("reports issues when required variables are missing", () => {
    const result = EnvSchema.safeParse({
      ...baseEnv,
      MONGO_URI: undefined as unknown as string,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["MONGO_URI"]);
    }
  });

  it("coerces boolean-like telemetry flag", () => {
    const parsed = EnvSchema.parse({
      ...baseEnv,
      OTEL_ENABLED: "true",
    });

    expect(parsed.otel.enabled).toBe(true);
  });
});
