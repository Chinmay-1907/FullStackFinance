import { normalizeText } from "./normalize";

describe("normalizeText", () => {
  it("removes boilerplate and normalizes whitespace", () => {
    const result = normalizeText({
      rawText: "Forward-looking statements\n\nLine A\t\tvalue\n\nLine B  value\n",
      ticker: "aapl",
      sourceType: "sec",
    });

    expect(result.text).toBe("Line A value\n\nLine B value");
    expect(result.ticker).toBe("AAPL");
    expect(result.bytes).toBe(Buffer.byteLength(result.text, "utf8"));
  });

  it("deduplicates repeated sections by hash", () => {
    const result = normalizeText({
      rawText: "Item 1\n\nItem 2\n\nItem 1\n\nItem 2",
      ticker: "msft",
      sourceType: "news",
    });

    expect(result.text.split("\n\n")).toEqual(["Item 1", "Item 2"]);
  });
});
