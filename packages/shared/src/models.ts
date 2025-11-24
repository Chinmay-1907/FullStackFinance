export const SupportedModels = {
  groq: {
    provider: "groq",
    label: "Groq",
    models: [
      {
        id: "mixtral-8x7b-32768",
        name: "Mixtral 8x7B 32k",
        type: "llm",
      },
      {
        id: "llama3-70b-8192",
        name: "LLaMA 3 70B",
        type: "llm",
      },
      {
        id: "text-embedding-3-large",
        name: "Text Embedding 3 Large",
        type: "embedding",
      },
    ],
  },
  gemini: {
    provider: "gemini",
    label: "Google Gemini",
    models: [
      {
        id: "gemini-1.5-pro-latest",
        name: "Gemini 1.5 Pro",
        type: "llm",
      },
      {
        id: "gemini-1.5-flash-latest",
        name: "Gemini 1.5 Flash",
        type: "llm",
      },
      {
        id: "text-embedding-004",
        name: "Text Embedding 004",
        type: "embedding",
      },
    ],
  },
} as const;

export type ProviderKey = keyof typeof SupportedModels;

export const DEFAULT_PROVIDER: ProviderKey = "groq";

type ProviderModel = (typeof SupportedModels)[ProviderKey]["models"][number];

const findModelByType = (models: ReadonlyArray<ProviderModel>, type: ProviderModel["type"]) =>
  models.find((model) => model.type === type)?.id;

export const DEFAULT_MODEL =
  findModelByType(SupportedModels[DEFAULT_PROVIDER].models, "llm") ??
  SupportedModels[DEFAULT_PROVIDER].models[0].id;

export const DEFAULT_EMBEDDING_MODEL =
  findModelByType(SupportedModels[DEFAULT_PROVIDER].models, "embedding") ??
  "sentence-transformers/all-MiniLM-L6-v2";

export const RAGDefaults = {
  chunkSize: 1200,
  chunkOverlap: 150,
  topK: 6,
} as const;

export const RetryDefaults = {
  attempts: 5,
  baseDelayMs: 500,
} as const;
