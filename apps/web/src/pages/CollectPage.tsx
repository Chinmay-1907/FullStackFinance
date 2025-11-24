import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { IngestionDocument, IngestionSource, IngestionStage } from "@fin-rag/shared";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";
import {
  useApproveIngestion,
  useIngestionDocuments,
  useIngestionStatus,
  useRetryIngestion,
  useStartIngestion,
} from "../hooks/useIngestion";
import { ApiError, apiClient } from "../lib/apiClient";

const SOURCES: IngestionSource[] = ["sec", "transcripts", "news"];
const SOURCE_LABELS: Record<IngestionSource, string> = {
  sec: "SEC Filings",
  transcripts: "Transcripts",
  news: "News",
};

const toneByStatus: Record<IngestionStage["status"], StatusTone> = {
  completed: "success",
  failed: "error",
  running: "warning",
  pending: "info",
};

const formatError = (error: unknown) => {
  if (!error) return "Unknown error";
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const CollectPage = () => {
  const [ticker, setTicker] = useState("AAPL");
  const [selectedSources, setSelectedSources] = useState<IngestionSource[]>(["sec", "transcripts"]);
  const [jobId, setJobId] = useState<string | null>(null);

  const startMutation = useStartIngestion();
  const retryMutation = useRetryIngestion();
  const approveMutation = useApproveIngestion();
  const statusQuery = useIngestionStatus(jobId ?? undefined, { refetchInterval: 4000 });
  const showDocuments =
    statusQuery.data?.status === "completed" || statusQuery.data?.status === "awaiting_approval";
  const documentsQuery = useIngestionDocuments(
    { ticker: statusQuery.data?.ticker, jobId: jobId ?? undefined },
    showDocuments,
  );

  const toggleSource = (source: IngestionSource) => {
    setSelectedSources((current) =>
      current.includes(source) ? current.filter((entry) => entry !== source) : [...current, source],
    );
  };

  const handleStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startMutation.mutate(
      {
        ticker,
        sources: selectedSources,
      },
      {
        onSuccess: (data) => {
          setJobId(data.jobId);
        },
      },
    );
  };

  const handleRetry = () => {
    if (!jobId) return;
    retryMutation.mutate(jobId);
  };

  const handleApprove = () => {
    if (!jobId) return;
    approveMutation.mutate(jobId);
  };

  const currentStages = statusQuery.data?.stages ?? [];
  const overallStatus = statusQuery.data?.status ?? "queued";
  const progressPercent = Math.round((statusQuery.data?.progress ?? 0) * 100);

  const stageOrder = useMemo(
    () =>
      currentStages.map((stage) => ({
        ...stage,
        tone: toneByStatus[stage.status],
      })),
    [currentStages],
  );

  const documentsBySource = useMemo(() => {
    const grouped = new Map<IngestionSource, IngestionDocument[]>();
    (documentsQuery.data?.documents ?? []).forEach((doc) => {
      const entries = grouped.get(doc.sourceType) ?? [];
      entries.push(doc as IngestionDocument);
      grouped.set(doc.sourceType, entries);
    });
    return Array.from(grouped.entries()).map(([source, docs]) => ({
      source,
      documents: docs,
    }));
  }, [documentsQuery.data?.documents]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        title="Start ingestion"
        description="Kick off the ingestion worker for a new ticker and monitor status in real time."
      >
        <form className="space-y-4" onSubmit={handleStart}>
          <label className="text-sm font-medium text-slate-700">
            Ticker
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              maxLength={8}
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
            />
          </label>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Sources</p>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => toggleSource(source)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${
                    selectedSources.includes(source)
                      ? "border-brand bg-brand text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {source}
                </button>
              ))}
            </div>
          </div>
          <Button
            type="submit"
            className="w-full px-4 py-2"
            disabled={startMutation.isPending || selectedSources.length === 0}
          >
            {startMutation.isPending ? "Enqueuing..." : "Start ingestion"}
          </Button>
          {startMutation.error ? (
            <p className="text-xs text-rose-500">{(startMutation.error as Error).message}</p>
          ) : null}
        </form>
      </Card>

      <Card
        title="Job status"
        description="Polls /ingestion/status/:jobId; retries are idempotent and rely on backend transactional updates."
        headerAction={
          <Button variant="secondary" onClick={handleRetry} disabled={!jobId}>
            Retry job
          </Button>
        }
      >
        {jobId ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">Job ID</p>
                <p className="font-mono text-sm text-slate-900">{jobId}</p>
              </div>
              <StatusBadge
                tone={
                  overallStatus === "failed"
                    ? "error"
                    : overallStatus === "completed"
                      ? "success"
                      : overallStatus === "awaiting_approval"
                        ? "info"
                        : "warning"
                }
              >
                {overallStatus.toUpperCase()}
              </StatusBadge>
            </div>
            {overallStatus === "awaiting_approval" ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="flex-1">
                  Review the OCR output below. Approving will resume cleaning, chunking, and
                  embedding.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!jobId || approveMutation.isPending}
                  loading={approveMutation.isPending}
                  onClick={handleApprove}
                >
                  Approve &amp; Continue
                </Button>
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase text-slate-500">Progress</p>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <span
                  className={`block h-2 rounded-full bg-brand transition-all`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{progressPercent}%</p>
            </div>

            <ul className="space-y-3">
              {stageOrder.map((stage) => (
                <li key={stage.name} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    <span>{stage.name}</span>
                    <StatusBadge tone={stage.tone}>{stage.status}</StatusBadge>
                  </div>
                  {stage.error ? (
                    <p className="mt-1 text-xs text-rose-500">{stage.error.message}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            {showDocuments ? (
              <div className="space-y-3 pt-4">
                <p className="text-xs uppercase text-slate-500">Collected content</p>
                {documentsQuery.isLoading ? (
                  <p className="text-xs text-slate-500">Loading stored documents...</p>
                ) : null}
                {documentsQuery.isError ? (
                  <p className="text-xs text-rose-500">
                    Unable to load collected content: {formatError(documentsQuery.error)}.
                  </p>
                ) : null}
                {documentsQuery.isSuccess && !documentsBySource.length ? (
                  <p className="text-xs text-slate-500">
                    No persisted documents were found for this ticker yet.
                  </p>
                ) : null}
                {documentsBySource.length ? (
                  <div className="space-y-4">
                    {documentsBySource.map((group) => (
                      <div
                        key={group.source}
                        className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-900">
                            {SOURCE_LABELS[group.source]}
                          </p>
                          <p className="text-xs text-slate-500">
                            {group.documents.length} file{group.documents.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="mt-3 space-y-3">
                          {group.documents.map((doc) => (
                            <article
                              key={doc.id}
                              className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs">
                                  <p className="font-semibold text-slate-800">
                                    {doc.formType ?? doc.url ?? doc.id}
                                  </p>
                                  <p className="text-slate-500">
                                    {doc.publishedAt
                                      ? new Date(doc.publishedAt).toLocaleString()
                                      : "Timestamp unknown"}
                                    {typeof doc.bytes === "number"
                                      ? ` (${(doc.bytes / 1024).toFixed(1)} KB)`
                                      : ""}
                                    {doc.approvalStatus ? ` - ${doc.approvalStatus}` : ""}
                                  </p>
                                </div>
                                <a
                                  className="text-xs font-semibold text-brand hover:text-brand-dark"
                                  href={apiClient.buildDocumentDownloadUrl(doc.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Download
                                </a>
                              </div>
                              <p className="mt-2 max-h-40 whitespace-pre-wrap overflow-y-auto text-xs text-slate-700">
                                {doc.contentPreview || "Preview unavailable."}
                              </p>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Start an ingestion job to see real-time progress.</p>
        )}
      </Card>
    </div>
  );
};






