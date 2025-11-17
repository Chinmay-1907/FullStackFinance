import type { QueryRequest } from "@fin-rag/shared";
import { act, renderHook } from "@testing-library/react";

import { ApiError } from "../lib/apiClient";
import { useQueryAnswer } from "./useRag";

const streamQueryMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/apiClient", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient")>("../lib/apiClient");
  return {
    ...actual,
    streamQuery: streamQueryMock,
  };
});

describe("useQueryAnswer", () => {
  const payload: QueryRequest = {
    ticker: "TSLA",
    question: "How is revenue trending?",
    k: 2,
  };

  beforeEach(() => {
    streamQueryMock.mockReset();
  });

  it("tracks streaming tokens and completion payloads", async () => {
    const citations = [{ docId: "doc-1", snippet: "Revenue up", sourceType: "sec" as const }];
    streamQueryMock.mockImplementation(async (_payload, handlers) => {
      handlers.onRetrieval?.({ citations, chunkCount: 1 });
      handlers.onToken?.("Hello ");
      handlers.onToken?.("world");
      handlers.onDone?.({ answer: "Hello world [1]", citations, latencyMs: 120 });
    });

    const { result } = renderHook(() => useQueryAnswer());

    await act(async () => {
      await result.current.runQuery(payload);
    });

    expect(streamQueryMock).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ onDone: expect.any(Function) }),
      expect.any(AbortSignal),
    );
    expect(result.current.status).toBe("complete");
    expect(result.current.answer).toContain("[1]");
    expect(result.current.citations).toHaveLength(1);
    expect(result.current.tokens).toHaveLength(0);
    expect(result.current.latencyMs).toBe(120);
  });

  it("surfaces upstream errors", async () => {
    streamQueryMock.mockRejectedValue(new ApiError("LLM failed", 500));
    const { result } = renderHook(() => useQueryAnswer());

    await act(async () => {
      await result.current.runQuery(payload);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("LLM failed");
  });
});
