import { getRetryConfig } from "../../modules/config/feature-flags";
import { createModuleLogger } from "../../utils/logger";
import { executeWithRetry } from "../../utils/retry";
import { persistBuffer } from "../../utils/storage";
import { getEnvConfig } from "../config/config.service";

import type { NormalizedSourceDocument, SourceFetchParams } from "./types";

type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
};

interface TavilyResponse {
  results?: TavilySearchResult[];
}

const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";

export class TranscriptService {
  private readonly logger = createModuleLogger("sources:transcripts");
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  private getApiKey() {
    const { credentials } = getEnvConfig();
    return credentials.tavily;
  }

  async fetchTranscripts(
    ticker: string,
    params: SourceFetchParams = {},
  ): Promise<NormalizedSourceDocument[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn("Tavily API key not configured; skipping transcript fetch");
      return [];
    }

    const retry = getRetryConfig();
    const limit = params.limit ?? 5;
    const query = `earnings transcript ${ticker}`;

    const response = await executeWithRetry<Response>(
      async () => {
        const result = await this.fetchFn(TAVILY_SEARCH_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tavily-Key": apiKey,
          },
          body: JSON.stringify({
            query,
            max_results: limit,
            search_depth: "advanced",
          }),
        });

        if (!result.ok) {
          throw new Error(`Tavily request failed: ${result.status} ${result.statusText}`);
        }

        return result;
      },
      {
        attempts: retry.maxAttempts,
        baseDelayMs: retry.initialDelayMs,
        jitterRatio: retry.jitterRatio,
      },
    );

    const payload = (await response.json()) as TavilyResponse;
    const results = payload.results ?? [];

    const documents: NormalizedSourceDocument[] = [];

    for (const item of results) {
      if (!item.content) {
        continue;
      }

      const persisted = await persistBuffer(
        Buffer.from(item.content, "utf8"),
        `transcripts/${ticker.toUpperCase()}`,
      );

      documents.push({
        sourceType: "transcripts",
        ticker: ticker.toUpperCase(),
        title: item.title,
        url: item.url,
        contentType: "text/plain; charset=utf-8",
        textPath: persisted.path,
        textHash: persisted.hash,
        bytes: persisted.bytes,
        publishedAt: item.publishedDate ? new Date(item.publishedDate) : undefined,
        metadata: {
          provider: "tavily",
          query,
        },
      });
    }

    return documents;
  }
}
