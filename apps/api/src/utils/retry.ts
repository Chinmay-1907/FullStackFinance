const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  jitterRatio?: number;
}

export const executeWithRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  const jitterRatio = options.jitterRatio ?? 0.2;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < options.attempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= options.attempts) {
        break;
      }

      const delay = options.baseDelayMs * 2 ** (attempt - 1);
      const jitter = delay * jitterRatio * Math.random();
      await wait(delay + jitter);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry attempts exhausted");
};
