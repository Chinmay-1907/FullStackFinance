import {
  ConfigModelsResponseSchema,
  ConfigValidateRequestSchema,
  ConfigValidateResponseSchema,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  SupportedModels,
} from "@fin-rag/shared";
import type { ConfigModelsResponse } from "@fin-rag/shared";
import { Router } from "express";
import type { Router as ExpressRouter } from "express";

type ProviderDescriptor = (typeof SupportedModels)[keyof typeof SupportedModels];
type ProviderModel = ProviderDescriptor["models"][number];

const mapProviders = (): ConfigModelsResponse["providers"] =>
  (Object.values(SupportedModels) as ProviderDescriptor[]).map(({ provider, label, models }) => ({
    provider,
    label,
    models: models.map((model: ProviderModel) => ({
      id: model.id,
      name: model.name,
      type: model.type,
    })),
  }));

export const configRouter: ExpressRouter = Router();

configRouter.get("/models", (_req, res, next) => {
  try {
    const response = ConfigModelsResponseSchema.parse({
      providers: mapProviders(),
      defaults: {
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
      },
    });

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

configRouter.post("/validate", (req, res, next) => {
  try {
    const payload = ConfigValidateRequestSchema.parse(req.body ?? {});

    const requiredKeys: Array<{ envKey: string; provided?: string }> = [
      { envKey: "GROQ_API_KEY", provided: payload.groqKey },
      { envKey: "GEMINI_API_KEY", provided: payload.geminiKey },
      { envKey: "TAVILY_API_KEY", provided: payload.tavilyKey },
      { envKey: "SEC_EMAIL", provided: payload.secEmail },
    ];

    const missing = requiredKeys
      .filter(({ envKey, provided }) => {
        const value = provided ?? process.env[envKey];
        return value === undefined || value === null || `${value}`.trim().length === 0;
      })
      .map(({ envKey }) => envKey);

    const response = ConfigValidateResponseSchema.parse({
      ok: missing.length === 0,
      missing,
    });

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});
