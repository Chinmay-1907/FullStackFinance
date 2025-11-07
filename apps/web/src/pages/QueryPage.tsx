import type { FormEvent } from "react";
import { useState } from "react";
import type { QueryRequest } from "@fin-rag/shared";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { QueryResultPanel } from "../components/query/QueryResultPanel";
import { useQueryAnswer } from "../hooks/useRag";

const defaultQuery: QueryRequest = {
  ticker: "AAPL",
  question: "Summarize the latest earnings call insights.",
  k: 6,
};

export const QueryPage = () => {
  const [form, setForm] = useState<QueryRequest>(defaultQuery);
  const query = useQueryAnswer();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    query.runQuery(form);
  };

  return (
    <div className="space-y-6">
      <Card title="Ask a question" description="This form mirrors the /rag/query endpoint including streaming SSE output.">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-slate-700">
            Ticker
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              value={form.ticker}
              onChange={(event) => setForm((prev) => ({ ...prev, ticker: event.target.value.toUpperCase() }))}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Model (optional)
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              value={form.model ?? ""}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, model: event.target.value || undefined }))
              }
              placeholder="llama3-70b-8192"
            />
          </label>
          <label className="md:col-span-2 text-sm font-medium text-slate-700">
            Question
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              value={form.question}
              rows={3}
              onChange={(event) => setForm((prev) => ({ ...prev, question: event.target.value }))}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Top-K
            <input
              type="number"
              min={1}
              max={20}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              value={form.k ?? 6}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, k: Number.parseInt(event.target.value, 10) || 6 }))
              }
            />
          </label>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" className="px-4 py-2" disabled={query.status === "loading" || query.status === "streaming"}>
              {query.status === "streaming" || query.status === "loading" ? "Streaming..." : "Run query"}
            </Button>
            {query.status === "streaming" ? (
              <Button variant="ghost" type="button" onClick={query.cancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <QueryResultPanel
        answer={query.answer}
        citations={query.citations}
        tokens={query.tokens}
        status={query.status}
        error={query.error ?? undefined}
        latencyMs={query.latencyMs}
      />
    </div>
  );
};
