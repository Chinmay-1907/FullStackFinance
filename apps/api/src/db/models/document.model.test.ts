import { DocumentModel } from "./document.model";

describe("DocumentModel schema validation", () => {
  it("requires mandatory metadata fields", async () => {
    const document = new DocumentModel({
      ticker: "AAPL",
      sourceType: "sec",
    });

    await expect(document.validate()).rejects.toThrow(/textPath/);

    document.set({
      textPath: "/tmp/aapl.txt",
    });

    await expect(document.validate()).rejects.toThrow(/textHash/);
  });

  it("normalizes ticker casing to uppercase", async () => {
    const document = new DocumentModel({
      ticker: "msft",
      sourceType: "news",
      textPath: "/tmp/msft.txt",
      textHash: "sha256:abc123",
    });

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.ticker).toBe("MSFT");
  });
});
