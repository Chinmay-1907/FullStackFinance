import type { Citation } from "@fin-rag/shared";

interface QueryResultPanelProps {
  answer: string;
  citations: Citation[];
  tokens: string[];
  status: "idle" | "loading" | "streaming" | "error" | "complete";
  error?: string | null;
  latencyMs?: number | null;
}

export const QueryResultPanel = ({
  answer,
  citations,
  tokens,
  status,
  error,
  latencyMs,
}: QueryResultPanelProps) => {
  if (status === "idle") {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        Results will appear here once you send a question.
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {error ?? "An unexpected error occurred while generating the answer."}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Generated Answer
        </p>
        <article className="prose prose-slate max-w-none text-slate-900">
          {status === "streaming" ? (
            <p className="animate-pulse text-slate-500">
              {tokens.join("") || "Collecting context..."}
            </p>
          ) : (
            <p>{answer}</p>
          )}
        </article>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Citations</p>
        {latencyMs ? (
          <span className="text-xs text-slate-400">Latency: {latencyMs}ms</span>
        ) : null}
      </div>
      <div>
        {citations.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Citations pending...</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {citations.map((citation, index) => (
              <li key={`${citation.docId}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="font-semibold">
                  [{index + 1}] {citation.docId}
                </p>
                <p className="text-xs text-slate-500">{citation.snippet}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
