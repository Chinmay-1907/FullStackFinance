/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment */

import { DocumentProcessor } from "../document.processor";

describe("DocumentProcessor", () => {
  it("chunks text with metadata applied", async () => {
    const processor = new DocumentProcessor({ chunkSize: 40, chunkOverlap: 10 });

    const result = await processor.process({
      id: "doc-1",
      ticker: "aapl",
      sourceType: "sec",
      text: "First paragraph line.\n\nSecond paragraph line.",
    });

    expect(result).toHaveLength(2);
    const first = result[0]!;
    const second = result[1]!;
    expect(first.meta.ticker).toBe("AAPL");
    expect(first.meta.sequence).toBe(0);
    expect(second.meta.sequence).toBe(1);
    expect(first.textHash).toHaveLength(64);
  });

  it("deduplicates identical chunks", async () => {
    const processor = new DocumentProcessor({ chunkSize: 20, chunkOverlap: 0 });

    const result = await processor.process({
      id: "doc-2",
      ticker: "msft",
      sourceType: "news",
      text: "Duplicate paragraph.\n\nDuplicate paragraph.\n\nUnique paragraph.",
    });

    const texts = result.map<string>((chunk) => chunk.text);
    expect(texts).toEqual(["Duplicate paragraph.", "Unique paragraph."]);
  });
});
