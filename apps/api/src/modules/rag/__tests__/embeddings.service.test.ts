/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import type { ChunkRecord } from "@fin-rag/shared";

import { EmbeddingsService, type IEmbeddingProvider } from "../embeddings.service";

const createChunk = (id: string, text: string): ChunkRecord => ({
  id,
  text,
  textHash: `hash-${id}`,
  meta: {
    docId: "doc-1",
    ticker: "TEST",
    sourceType: "sec",
    sequence: Number.parseInt(id, 10) || 0,
    stage: "chunked",
  },
});

class MockProvider implements IEmbeddingProvider {
  readonly name = "mock";
  constructor(private readonly implementation: (texts: string[]) => Promise<number[][]>) {}
  embed(texts: string[]): Promise<number[][]> {
    return this.implementation(texts);
  }
}

describe("EmbeddingsService", () => {
  it("batches chunks before embedding", async () => {
    const embedMock = jest.fn((texts: string[]) =>
      Promise.resolve(texts.map((text) => [text.length])),
    );
    const provider = new MockProvider(embedMock);
    const service = new EmbeddingsService(provider, { batchSize: 2 });

    const chunks = [
      createChunk("0", "chunk-a"),
      createChunk("1", "chunk-b"),
      createChunk("2", "chunk-c"),
      createChunk("3", "chunk-d"),
      createChunk("4", "chunk-e"),
    ];

    const vectors = await service.embedChunks(chunks);

    expect(embedMock).toHaveBeenCalledTimes(3);
    const firstCall = embedMock.mock.calls[0]!;
    const thirdCall = embedMock.mock.calls[2]!;
    expect(firstCall[0]).toEqual(["chunk-a", "chunk-b"]);
    expect(thirdCall[0]).toEqual(["chunk-e"]);
    expect(vectors).toHaveLength(5);
    expect(vectors[0]?.meta.ticker).toBe("TEST");
    expect(vectors[0]?.text).toBe("chunk-a");
  });

  it("retries failed batches using backoff configuration", async () => {
    let attempt = 0;
    const embedMock = jest.fn((texts: string[]) => {
      attempt += 1;
      if (attempt < 2) {
        throw new Error("rate limited");
      }
      return Promise.resolve(texts.map(() => [attempt]));
    });

    const provider = new MockProvider(embedMock);
    const service = new EmbeddingsService(provider, { batchSize: 3 });

    const chunks = [createChunk("0", "chunk-a"), createChunk("1", "chunk-b")];

    const vectors = await service.embedChunks(chunks);

    expect(embedMock).toHaveBeenCalledTimes(2);
    expect(vectors.map((vector) => vector.embedding[0])).toEqual([2, 2]);
    expect(vectors[1]?.text).toBe("chunk-b");
  });

  it("uses cache when available to skip duplicate embeddings", async () => {
    const cache = new Map<string, number[]>();
    const embedMock = jest.fn((texts: string[]) => Promise.resolve(texts.map(() => [1, 2, 3])));
    const provider = new MockProvider(embedMock);
    const service = new EmbeddingsService(provider, { cache });

    const chunks = [createChunk("0", "chunk-a")];

    const first = await service.embedChunks(chunks);
    cache.set(chunks[0]!.textHash, first[0]!.embedding);
    await service.embedChunks(chunks, { cache });

    expect(embedMock).toHaveBeenCalledTimes(1);
  });

  it("embeds ad-hoc queries for retrieval", async () => {
    const provider = new MockProvider((texts: string[]) =>
      Promise.resolve(texts.map((text) => [text.length])),
    );
    const service = new EmbeddingsService(provider);
    const vector = await service.embedQuery("financial outlook");
    expect(vector).toEqual([17]);
  });
});
