import { z } from "zod";

export const ProviderModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["llm", "embedding"]),
});

export const ProviderSchema = z.object({
  provider: z.string().min(1),
  label: z.string().min(1),
  models: z.array(ProviderModelSchema).min(1),
});

export const ConfigModelsDefaultsSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  embeddingModel: z.string().min(1),
});

export type ConfigModelsDefaults = z.infer<typeof ConfigModelsDefaultsSchema>;

export const ConfigModelsResponseSchema = z.object({
  providers: z.array(ProviderSchema).min(1),
  defaults: ConfigModelsDefaultsSchema,
});

export type ConfigModelsResponse = z.infer<typeof ConfigModelsResponseSchema>;

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return value;
}, z.string().min(1).optional());

export const ConfigValidateRequestSchema = z.object({
  groqKey: optionalTrimmedString,
  geminiKey: optionalTrimmedString,
  tavilyKey: optionalTrimmedString,
  secEmail: z
    .preprocess((value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed;
      }
      return value;
    }, z.string().email().optional()),
});

export type ConfigValidateRequest = z.infer<typeof ConfigValidateRequestSchema>;

export const ConfigValidateResponseSchema = z.object({
  ok: z.boolean(),
  missing: z.array(z.string()).default([]),
  greeting: z.string().optional(),
  greetingProvider: z.enum(["groq", "gemini", "local", "test"]).optional(),
});

export type ConfigValidateResponse = z.infer<typeof ConfigValidateResponseSchema>;
