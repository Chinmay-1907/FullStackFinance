import type { QueryRequest } from "@fin-rag/shared";

import type { IAnswerProvider, LlmPrompt } from "../providers/answer.provider";
import { RagService } from "../rag.service";
import type { VectorQueryResultItem } from "../vector-store/vector-store.types";
import type { VectorStoreService } from "../vectorstore.service";
import type { EmbeddingsService } from "../embeddings.service";

const baseMatch: VectorQueryResultItem = {
  chunkId: "chunk-1",
  docId: "doc-1",
  snippet: "Revenue grew 12% year over year.",
  score: 0.91,
  sourceType: "sec",
  metadata: {
    docId: "doc-1",
    ticker: "TEST",
    sourceType: "sec",
    sequence: 0,
    stage: "chunked",
  },
};

const createService = (
  matches: VectorQueryResultItem[],
  provider: IAnswerProvider,
  embeddingsVector: number[] = [0.1, 0.2, 0.3],
) => {
  const embeddings = {
    embedQuery: jest.fn().mockResolvedValue(embeddingsVector),
  } as unknown as EmbeddingsService;

  const vectorStore = {
    query: jest.fn().mockResolvedValue(matches),
  } as unknown as VectorStoreService;

  const answerProviderResolver = () => provider;

  return {
    service: new RagService({ embeddings, vectorStore, answerProviderResolver }),
    embeddings,
    vectorStore,
  };
};

class StubAnswerProvider implements IAnswerProvider {
  readonly name = "stub";
  constructor(private readonly tokens: string[]) {}
  async *streamAnswer(_prompt: LlmPrompt): AsyncGenerator<string> {
    for (const token of this.tokens) {
      yield token;
    }
  }
}

describe("RagService", () => {
  const baseRequest: QueryRequest = {
    ticker: "TEST",
    question: "How is revenue trending?",
    k: 3,
  };

  it("streams retrieval metadata, tokens, and completion payload", async () => {
    const provider = new StubAnswerProvider(["Revenues ", "are ", "rising. "]);
    const { service } = createService([baseMatch], provider);

    const events: Array<{ type: string; data: unknown }> = [];
    for await (const event of service.streamQuery(baseRequest)) {
      events.push(event);
    }

    expect(events[0]?.type).toBe("retrieval");
    expect((events[0]?.data as { chunkCount: number }).chunkCount).toBe(1);
    expect(events.filter((event) => event.type === "token")).toHaveLength(3);
    const completion = events.find((event) => event.type === "done");
    expect(completion).toBeTruthy();
    const response = completion?.data as { answer: string; citations: Array<{ docId: string }> };
    expect(response.citations).toHaveLength(1);
    expect(response.answer).toContain("[1]");
  });

  it("returns insufficient context response when no matches", async () => {
    const provider = new StubAnswerProvider([]);
    const { service } = createService([], provider);
    const events: Array<{ type: string; data: any }> = [];
    for await (const event of service.streamQuery(baseRequest)) {
      events.push(event);
    }
    const completion = events.find((event) => event.type === "done");
    expect(completion?.data.answer).toMatch(/Insufficient data/i);
    expect(completion?.data.citations).toHaveLength(1);
  });

  it("surfaces provider failures", async () => {
    class ErrorProvider implements IAnswerProvider {
      readonly name = "error-provider";
      async *streamAnswer(): AsyncGenerator<string> {
        throw new Error("LLM failed");
      }
    }

    const { service } = createService([baseMatch], new ErrorProvider());

    const iterator = service.streamQuery(baseRequest);
    await iterator.next(); // retrieval event
    await expect(iterator.next()).rejects.toThrow("LLM failed");
  });
});
