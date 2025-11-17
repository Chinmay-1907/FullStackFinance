import { retry } from "./retry";

describe("retry", () => {
  it("retries the specified number of times before failing", async () => {
    let attempts = 0;
    const operation = jest.fn().mockImplementation(async () => {
      attempts += 1;
      throw new Error("boom");
    });

    await expect(
      retry(operation, {
        attempts: 3,
        baseDelayMs: 0
      })
    ).rejects.toThrow("boom");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(attempts).toBe(3);
  });

  it("resolves when the operation eventually succeeds", async () => {
    let attempts = 0;
    const operation = jest.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("transient");
      }
      return "success";
    });

    await expect(
      retry(operation, {
        attempts: 3,
        baseDelayMs: 0
      })
    ).resolves.toBe("success");

    expect(operation).toHaveBeenCalledTimes(2);
  });
});
