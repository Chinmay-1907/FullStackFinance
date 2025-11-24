import {
  ConfigModelsResponseSchema,
  ConfigValidateRequestSchema,
  ConfigValidateResponseSchema,
  IngestionDocumentsResponseSchema,
  IngestionStartRequestSchema,
  IngestionStatusSchema,
  QueryRequestSchema,
} from "@fin-rag/shared";
import type { IngestionStatus } from "@fin-rag/shared";
import type { Citation, ConfigValidateRequest, IngestionStartRequest, QueryRequest } from "@fin-rag/shared";
import { z } from "zod";
import { API_BASE_URL, FALLBACK_API_BASE_URL, buildApiUrl } from "./env";

export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  status?: number;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: ErrorEnvelope,
  ) {
    super(message);
  }
}

type HttpMethod = "GET" | "POST";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
}

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const isAbortError = (error: unknown) =>
  typeof DOMException !== "undefined" &&
  error instanceof DOMException &&
  error.name === "AbortError";

const formatNetworkError = (error: unknown, baseUrl: string) => {
  if (error instanceof ApiError || isAbortError(error)) {
    return error;
  }

  if (error instanceof TypeError) {
    return new ApiError(
      `Unable to reach API at ${baseUrl}. ${error.message}. Verify the server is running and that VITE_API_BASE_URL points to it.`,
      503,
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
};

const fetchFromBase = async <T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  { method = "GET", body, signal }: RequestOptions,
  baseUrl: string,
) => {
  try {
    const response = await fetch(buildApiUrl(path, baseUrl), {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    const data = await parseResponse(response);
    if (!response.ok) {
      throw new ApiError(
        (data as ErrorEnvelope | null)?.message ?? "Request failed",
        response.status,
        data as ErrorEnvelope,
      );
    }

    return schema.parse(data);
  } catch (error) {
    throw formatNetworkError(error, baseUrl);
  }
};

const request = async <T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  options: RequestOptions = {},
): Promise<T> => {
  const attempted = new Set<string>();
  let lastError: unknown;

  for (const base of [API_BASE_URL, FALLBACK_API_BASE_URL]) {
    if (attempted.has(base)) {
      continue;
    }
    attempted.add(base);

    try {
      return await fetchFromBase(path, schema, options, base);
    } catch (error) {
      lastError = error;

      if (!(error instanceof ApiError) || error.status !== 503 || base === FALLBACK_API_BASE_URL) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unable to reach API");
};

export interface QueryStreamHandlers {
  onRetrieval?: (payload: { citations: Citation[]; chunkCount: number }) => void;
  onToken?: (token: string) => void;
  onDone?: (payload: { answer: string; citations: Citation[]; latencyMs?: number }) => void;
  onError?: (payload: ErrorEnvelope) => void;
}

const parseSseChunk = (chunk: string) => {
  const lines = chunk.split("\n").filter(Boolean);
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5));

  return {
    event: eventLine?.replace("event:", "").trim() ?? "",
    data: dataLines.join("\n"),
  };
};

export const streamQuery = async (
  payload: QueryRequest,
  handlers: QueryStreamHandlers,
  signal?: AbortSignal,
) => {
  const body = QueryRequestSchema.parse(payload);
  const response = await fetch(buildApiUrl("/rag/query"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const error = (await parseResponse(response)) as ErrorEnvelope | null;
    throw new ApiError(
      error?.message ?? "Unable to start streaming response",
      response.status,
      error ?? undefined,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const segments = buffer.split("\n\n");
    buffer = segments.pop() ?? "";

    for (const segment of segments) {
      const { event, data } = parseSseChunk(segment);
      if (!event) continue;

      if (event === "error") {
        handlers.onError?.(JSON.parse(data));
        continue;
      }

      if (event === "retrieval" && data) {
        handlers.onRetrieval?.(JSON.parse(data));
        continue;
      }

      if (event === "token" && data) {
        handlers.onToken?.(JSON.parse(data)?.token ?? "");
        continue;
      }

      if (event === "done" && data) {
        handlers.onDone?.(JSON.parse(data));
        continue;
      }
    }
  }
};

export const apiClient = {
  fetchConfigModels: () =>
    request("/config/models", ConfigModelsResponseSchema, { method: "GET" }),
  validateConfig: (payload: ConfigValidateRequest) =>
    request("/config/validate", ConfigValidateResponseSchema, {
      method: "POST",
      body: ConfigValidateRequestSchema.parse(payload),
    }),
  startIngestion: (payload: IngestionStartRequest) =>
    request("/ingestion/start", z.object({ jobId: z.string().min(1) }), {
      method: "POST",
      body: IngestionStartRequestSchema.parse(payload),
    }),
  fetchIngestionStatus: (jobId: string, signal?: AbortSignal) =>
    request(`/ingestion/status/${jobId}`, IngestionStatusSchema, {
      method: "GET",
      signal,
    }),
  retryIngestion: (jobId: string) =>
    request(`/ingestion/retry/${jobId}`, IngestionStatusSchema, { method: "POST" }),
  fetchIngestionDocuments: (params: { ticker: string; source?: string; jobId?: string }) => {
    const search = new URLSearchParams({ ticker: params.ticker });
    if (params.source) {
      search.set("source", params.source);
    }
    if (params.jobId) {
      search.set("jobId", params.jobId);
    }
    return request(`/ingestion/documents?${search.toString()}`, IngestionDocumentsResponseSchema, {
      method: "GET",
    });
  },
  buildDocumentDownloadUrl: (docId: string) =>
    buildApiUrl(`/ingestion/documents/${docId}/download`),
  approveIngestion: (jobId: string) =>
    request(`/ingestion/${jobId}/approve`, z.object({ jobId: z.string().min(1) }), {
      method: "POST",
    }),
};

export type { IngestionStatus } from "@fin-rag/shared";
