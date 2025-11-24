import {
  ConfigModelsResponseSchema,
  ConfigValidateRequestSchema,
  ConfigValidateResponseSchema,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  SupportedModels,
} from "@fin-rag/shared";
import { Router, type Router as ExpressRouter } from "express";

import { getEnvConfig, resetEnvConfigCache } from "./config.service";
import { generateGreeting } from "./greeting.service";
import { saveRuntimeCredentials, type CredentialEnvKey } from "./runtime-credentials";

export const configRouter: ExpressRouter = Router();

configRouter.get("/models", (_req, res, next) => {
  try {
    const response = ConfigModelsResponseSchema.parse({
      providers: Object.values(SupportedModels).map((provider) => ({
        provider: provider.provider,
        label: provider.label,
        models: provider.models,
      })),
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

configRouter.post("/validate", async (req, res, next) => {
  try {
    const payload = ConfigValidateRequestSchema.parse(req.body ?? {});

    const envConfig = getEnvConfig();
    const envLookup: Record<
      "GROQ_API_KEY" | "GEMINI_API_KEY" | "TAVILY_API_KEY" | "SEC_EMAIL",
      string | undefined
    > = {
      GROQ_API_KEY: envConfig.credentials.groq,
      GEMINI_API_KEY: envConfig.credentials.gemini,
      TAVILY_API_KEY: envConfig.credentials.tavily,
      SEC_EMAIL: envConfig.credentials.secEmail,
    };

    const resolvedValues: typeof envLookup = {
      GROQ_API_KEY: payload.groqKey ?? envLookup.GROQ_API_KEY,
      GEMINI_API_KEY: payload.geminiKey ?? envLookup.GEMINI_API_KEY,
      TAVILY_API_KEY: payload.tavilyKey ?? envLookup.TAVILY_API_KEY,
      SEC_EMAIL: payload.secEmail ?? envLookup.SEC_EMAIL,
    };

    const isEmpty = (value?: string | null) => !value || value.trim().length === 0;

    const llmSatisfied =
      !isEmpty(resolvedValues.GROQ_API_KEY) || !isEmpty(resolvedValues.GEMINI_API_KEY);

    const missing = (Object.keys(resolvedValues) as Array<keyof typeof resolvedValues>)
      .filter((envKey) => {
        if ((envKey === "GROQ_API_KEY" || envKey === "GEMINI_API_KEY") && llmSatisfied) {
          return false;
        }
        return isEmpty(resolvedValues[envKey]);
      })
      .map((envKey) => envKey);

    let greeting: string | undefined;
    let greetingProvider: string | undefined;
    if (missing.length === 0) {
      const greetingResult = await generateGreeting({
        groqKey: resolvedValues.GROQ_API_KEY,
        geminiKey: resolvedValues.GEMINI_API_KEY,
        secEmail: resolvedValues.SEC_EMAIL,
      });
      greeting = greetingResult?.message;
      greetingProvider = greetingResult?.provider;
    }

    const payloadEnvValues: Partial<Record<CredentialEnvKey, string | undefined>> = {
      GROQ_API_KEY: payload.groqKey,
      GEMINI_API_KEY: payload.geminiKey,
      TAVILY_API_KEY: payload.tavilyKey,
      SEC_EMAIL: payload.secEmail,
    };

    await saveRuntimeCredentials(payloadEnvValues);
    resetEnvConfigCache();

    const response = ConfigValidateResponseSchema.parse({
      ok: missing.length === 0,
      missing,
      greeting,
      greetingProvider,
    });

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});
