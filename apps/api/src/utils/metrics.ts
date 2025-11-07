import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const chunkCounter = new client.Counter({
  name: "rag_chunks_processed_total",
  help: "Number of content chunks processed during ingestion",
  labelNames: ["ticker", "source"],
  registers: [register],
});

const embeddingBatchCounter = new client.Counter({
  name: "rag_embedding_batches_total",
  help: "Number of embedding batches submitted to the provider",
  labelNames: ["provider"],
  registers: [register],
});

const queryLatencyHistogram = new client.Histogram({
  name: "rag_query_latency_ms",
  help: "End-to-end RAG query latency in milliseconds",
  labelNames: ["ticker", "model"],
  buckets: [50, 100, 250, 500, 1000, 2000, 5000, 10000],
  registers: [register],
});

export const metrics = {
  register,
  chunkCounter,
  embeddingBatchCounter,
  queryLatencyHistogram,
  recordChunks(ticker: string, source: string, count: number) {
    if (count > 0) {
      chunkCounter.inc({ ticker: ticker.toUpperCase(), source }, count);
    }
  },
  recordEmbeddingBatch(provider: string) {
    embeddingBatchCounter.inc({ provider });
  },
  observeQueryLatency(ticker: string, model: string, latencyMs: number) {
    if (latencyMs >= 0) {
      queryLatencyHistogram.observe(
        { ticker: ticker.toUpperCase(), model: model.toLowerCase() },
        latencyMs,
      );
    }
  },
};
