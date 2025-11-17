import { RetryDefaults } from "@fin-rag/shared";

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const retry = async <T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> => {
  const attempts = options.attempts ?? RetryDefaults.attempts;
  const baseDelayMs = options.baseDelayMs ?? RetryDefaults.baseDelayMs;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts) {
        break;
      }

      options.onRetry?.(error, attempt);

      const jitter = Math.random() * baseDelayMs;
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await sleep(delay);
    }
  }

  throw lastError;
};

export const withRetry = <Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options?: RetryOptions
) => {
  return async (...args: Args) => retry(() => fn(...args), options);
};
