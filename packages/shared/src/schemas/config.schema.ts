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

export const ConfigValidateRequestSchema = z.object({
  groqKey: z.string().trim().min(1).optional(),
  geminiKey: z.string().trim().min(1).optional(),
  tavilyKey: z.string().trim().min(1).optional(),
  secEmail: z.string().email().optional(),
});

export type ConfigValidateRequest = z.infer<typeof ConfigValidateRequestSchema>;

export const ConfigValidateResponseSchema = z.object({
  ok: z.boolean(),
  missing: z.array(z.string()).default([]),
});

export type ConfigValidateResponse = z.infer<typeof ConfigValidateResponseSchema>;
