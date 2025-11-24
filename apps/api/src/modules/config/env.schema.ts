import { VectorStoreTypeSchema } from "@fin-rag/shared";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  VECTOR_STORE: VectorStoreTypeSchema.optional().default("faiss"),
  OCR_LANGUAGE: z.string().trim().min(2).default("eng"),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  SEC_EMAIL: z.string().optional(),
  OTEL_ENABLED: booleanFromEnv.default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
});

export const EnvSchema = RawEnvSchema.transform((value) => ({
  nodeEnv: value.NODE_ENV,
  port: value.PORT,
  mongoUri: value.MONGO_URI,
  redisUrl: value.REDIS_URL,
  vectorStore: value.VECTOR_STORE,
  credentials: {
    groq: value.GROQ_API_KEY,
    gemini: value.GEMINI_API_KEY,
    tavily: value.TAVILY_API_KEY,
    secEmail: value.SEC_EMAIL,
  },
  ocr: {
    language: value.OCR_LANGUAGE,
  },
  otel: {
    enabled: value.OTEL_ENABLED ?? false,
    endpoint: value.OTEL_EXPORTER_OTLP_ENDPOINT,
    headers: value.OTEL_EXPORTER_OTLP_HEADERS,
  },
}));

export type EnvConfig = z.infer<typeof EnvSchema>;
