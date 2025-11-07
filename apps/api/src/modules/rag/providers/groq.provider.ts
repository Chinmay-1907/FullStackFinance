import { AppError } from "../../../utils/errors";
import type { IEmbeddingProvider } from "../embeddings.service";

export class GroqEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "groq";

  embed(texts: string[]): Promise<number[][]> {
    void texts;
    return Promise.reject(
      new AppError("Groq embedding provider is not yet implemented", {
        code: "UPSTREAM_ERROR",
        status: 501,
      }),
    );
  }
}
