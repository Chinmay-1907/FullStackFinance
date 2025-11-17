import { executeWithRetry } from "./retry";

describe("executeWithRetry", () => {
  beforeEach(() => {
    jest.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("retries with exponential backoff before succeeding", async () => {
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error("first"))
      .mockResolvedValueOnce("ok");

    const timeoutSpy = jest.spyOn(global, "setTimeout");

    await expect(
      executeWithRetry(operation, {
        attempts: 2,
        baseDelayMs: 2,
        jitterRatio: 0,
      }),
    ).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    const delays = timeoutSpy.mock.calls.map(([, delay]) => delay);
    expect(delays).toEqual([2]);
  });

  it("applies jitter and throws when attempts are exhausted", async () => {
    jest.spyOn(Math, "random").mockReturnValue(1);
    const operation = jest.fn<Promise<void>, []>().mockRejectedValue(new Error("fail"));
    const timeoutSpy = jest.spyOn(global, "setTimeout");

    await expect(
      executeWithRetry(operation, {
        attempts: 3,
        baseDelayMs: 2,
        jitterRatio: 0.5,
      }),
    ).rejects.toThrow("fail");

    const delays = timeoutSpy.mock.calls.map(([, delay]) => delay);
    expect(delays).toEqual([3, 6]);
  });
});
