import { Router } from "express";
import {
  ConfigModelsResponseSchema,
  ConfigValidateRequestSchema,
  ConfigValidateResponseSchema,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  SupportedModels
} from "@fin-rag/shared";

import { getEnvConfig } from "./config.service";

export const configRouter = Router();

configRouter.get("/models", (_req, res, next) => {
  try {
    const providers = Object.values(SupportedModels).map((provider) => ({
      provider: provider.provider,
      label: provider.label,
      models: provider.models
    }));

    const response = ConfigModelsResponseSchema.parse({
      providers,
      defaults: {
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        embeddingModel: DEFAULT_EMBEDDING_MODEL
      }
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

configRouter.post("/validate", (req, res, next) => {
  try {
    const payload = ConfigValidateRequestSchema.parse(req.body ?? {});
    const envConfig = getEnvConfig();

    const envLookup: Record<string, string | undefined> = {
      GROQ_API_KEY: envConfig.credentials.groq,
      GEMINI_API_KEY: envConfig.credentials.gemini,
      TAVILY_API_KEY: envConfig.credentials.tavily,
      SEC_EMAIL: envConfig.credentials.secEmail
    };

    const requiredKeys: Array<{ envKey: keyof typeof envLookup; provided?: string }> = [
      { envKey: "GROQ_API_KEY", provided: payload.groqKey },
      { envKey: "GEMINI_API_KEY", provided: payload.geminiKey },
      { envKey: "TAVILY_API_KEY", provided: payload.tavilyKey },
      { envKey: "SEC_EMAIL", provided: payload.secEmail }
    ];

    const isEmpty = (value?: string | null) => !value || value.trim().length === 0;

    const missing = requiredKeys
      .filter(({ envKey, provided }) => {
        const resolved = provided ?? envLookup[envKey];
        return isEmpty(resolved ?? undefined);
      })
      .map(({ envKey }) => envKey);

    const response = ConfigValidateResponseSchema.parse({
      ok: missing.length === 0,
      missing
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});
