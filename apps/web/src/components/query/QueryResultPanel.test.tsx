import type { Citation } from "@fin-rag/shared";
import { render, screen } from "@testing-library/react";

import { QueryResultPanel } from "./QueryResultPanel";

describe("QueryResultPanel", () => {
  const citations: Citation[] = [
    { docId: "doc-1", snippet: "Context snippet", sourceType: "sec", score: 0.9 },
  ];

  it("renders streaming tokens while waiting for completion", () => {
    render(
      <QueryResultPanel
        answer=""
        citations={[]}
        tokens={["Hel", "lo"]}
        status="streaming"
        error={null}
      />,
    );

    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(screen.getByText(/Citations pending/i)).toBeInTheDocument();
  });

  it("shows final answer with citations and latency", () => {
    render(
      <QueryResultPanel
        answer="Final answer [1]"
        citations={citations}
        tokens={[]}
        status="complete"
        latencyMs={87}
      />,
    );

    expect(screen.getByText("Final answer [1]")).toBeInTheDocument();
    expect(screen.getByText("[1] doc-1")).toBeInTheDocument();
    expect(screen.getByText(/Latency: 87ms/)).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(
      <QueryResultPanel
        answer=""
        citations={[]}
        tokens={[]}
        status="error"
        error="Something went wrong"
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
