import { AppError } from "../../../utils/errors";
import type { IEmbeddingProvider } from "../embeddings.service";

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "gemini";

  embed(texts: string[]): Promise<number[][]> {
    void texts;
    return Promise.reject(
      new AppError("Gemini embedding provider is not yet implemented", {
        code: "UPSTREAM_ERROR",
        status: 501,
      }),
    );
  }
}
