import { AppError } from "../../../utils/errors";

export interface LlmPrompt {
  ticker: string;
  question: string;
  context: string;
  systemInstructions: string;
  instructions: string;
  model: string;
}

export interface AnswerStreamOptions {
  signal?: AbortSignal;
}

export interface IAnswerProvider {
  readonly name: string;
  streamAnswer(prompt: LlmPrompt, options?: AnswerStreamOptions): AsyncGenerator<string>;
}

const splitTokens = (text: string) => text.split(/(\s+)/).filter((part) => part.trim().length > 0);

class LocalLLMProvider implements IAnswerProvider {
  readonly name = "local-mock";

  private buildAnswer(prompt: LlmPrompt) {
    const segments = prompt.context
      .split(/\n---\n/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (!segments.length) {
      return `Insufficient context to answer ${prompt.question} for ${prompt.ticker}.`;
    }

    const bulletSummary = segments
      .slice(0, 3)
      .map((segment, index) => `(${index + 1}) ${segment.split("\n")[0] ?? segment}`)
      .join("; ");

    const references = segments.map((_segment, index) => `[${index + 1}]`).join(" ");
    return `Summary for ${prompt.ticker}: ${bulletSummary}. ${references}`.trim();
  }

  async *streamAnswer(prompt: LlmPrompt, options?: AnswerStreamOptions): AsyncGenerator<string> {
    const answer = this.buildAnswer(prompt);
    for (const token of splitTokens(answer)) {
      if (options?.signal?.aborted) {
        return;
      }
      yield token;
    }
  }
}

class GroqAnswerProvider implements IAnswerProvider {
  readonly name = "groq";

  async *streamAnswer(): AsyncGenerator<string> {
    throw new AppError("Groq LLM provider is not yet wired up", {
      code: "UPSTREAM_ERROR",
      status: 501,
      details: {
        todo: "Inject GROQ_API_KEY and implement streaming completion handler",
      },
    });
  }
}

class GeminiAnswerProvider implements IAnswerProvider {
  readonly name = "gemini";

  async *streamAnswer(): AsyncGenerator<string> {
    throw new AppError("Gemini LLM provider is not yet wired up", {
      code: "UPSTREAM_ERROR",
      status: 501,
      details: {
        todo: "Inject GEMINI_API_KEY and implement streaming completion handler",
      },
    });
  }
}

export const resolveAnswerProvider = (modelId?: string): IAnswerProvider => {
  if (modelId?.toLowerCase().includes("gemini")) {
    return new GeminiAnswerProvider();
  }

  if (modelId?.toLowerCase().includes("groq")) {
    return new GroqAnswerProvider();
  }

  return new LocalLLMProvider();
};
