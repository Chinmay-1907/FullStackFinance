import { useCallback, useRef, useState } from "react";
import type { Citation, QueryRequest } from "@fin-rag/shared";
import { ApiError, streamQuery } from "../lib/apiClient";

export type QueryStatus = "idle" | "loading" | "streaming" | "complete" | "error";

interface QueryState {
  status: QueryStatus;
  answer: string;
  citations: Citation[];
  tokens: string[];
  chunkCount: number;
  error?: string | null;
  latencyMs?: number | null;
}

const initialState: QueryState = {
  status: "idle",
  answer: "",
  citations: [],
  tokens: [],
  chunkCount: 0,
  error: null,
  latencyMs: null,
};

export const useQueryAnswer = () => {
  const [state, setState] = useState<QueryState>(initialState);
  const controllerRef = useRef<AbortController | null>(null);

  const runQuery = useCallback(async (payload: QueryRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...initialState, status: "loading" });

    try {
      await streamQuery(
        payload,
        {
          onRetrieval: ({ citations, chunkCount }) =>
            setState((prev) => ({
              ...prev,
              status: "streaming",
              citations,
              chunkCount,
            })),
          onToken: (token) =>
            setState((prev) => ({
              ...prev,
              status: "streaming",
              tokens: [...prev.tokens, token],
            })),
          onDone: ({ answer, citations, latencyMs }) =>
            setState({
              status: "complete",
              answer,
              citations,
              tokens: [],
              chunkCount: citations.length,
              error: null,
              latencyMs,
            }),
          onError: (payload) =>
            setState({
              ...initialState,
              status: "error",
              error: payload.message,
            }),
        },
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof ApiError ? error.message : "Failed to run query";
      setState({ ...initialState, status: "error", error: message });
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setState(initialState);
  }, []);

  return {
    ...state,
    runQuery,
    cancel,
  };
};
