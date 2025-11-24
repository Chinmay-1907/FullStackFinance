import type { Tensor } from "@xenova/transformers";
import { pipeline } from "@xenova/transformers";

import type { IEmbeddingProvider } from "../embeddings.service";

type FeatureExtractor = (input: string, options?: Record<string, unknown>) => Promise<Tensor>;

export interface LocalEmbeddingProviderOptions {
  model?: string;
}

const DEFAULT_MODEL = process.env["EMBED_MODEL_NAME"] ?? "Xenova/all-MiniLM-L6-v2";

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "local-transformers";
  private readonly model: string;
  private pipelinePromise: Promise<FeatureExtractor> | null = null;

  constructor(options: LocalEmbeddingProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
  }

  private async getPipeline(): Promise<FeatureExtractor> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = pipeline("feature-extraction", this.model, {
        quantized: true,
      }) as Promise<FeatureExtractor>;
    }
    return this.pipelinePromise;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.getPipeline();
    const vectors: number[][] = [];
    for (const text of texts) {
      const output = await extractor(text, { pooling: "mean", normalize: true });
      const data = Array.from(output.data as Float32Array);
      vectors.push(data);
    }
    return vectors;
  }
}
