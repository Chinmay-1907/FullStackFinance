import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { IngestionSource, IngestionStage } from "@fin-rag/shared";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";
import { useIngestionStatus, useRetryIngestion, useStartIngestion } from "../hooks/useIngestion";

const SOURCES: IngestionSource[] = ["sec", "transcripts", "news"];
const toneByStatus: Record<IngestionStage["status"], StatusTone> = {
  completed: "success",
  failed: "error",
  running: "warning",
  pending: "info",
};

export const CollectPage = () => {
  const [ticker, setTicker] = useState("AAPL");
  const [selectedSources, setSelectedSources] = useState<IngestionSource[]>(["sec", "transcripts"]);
  const [jobId, setJobId] = useState<string | null>(null);

  const startMutation = useStartIngestion();
  const retryMutation = useRetryIngestion();
  const statusQuery = useIngestionStatus(jobId ?? undefined, { refetchInterval: 4000 });

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
                      : "warning"
                }
              >
                {overallStatus.toUpperCase()}
              </StatusBadge>
            </div>
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
          </div>
        ) : (
          <p className="text-sm text-slate-500">Start an ingestion job to see real-time progress.</p>
        )}
      </Card>
    </div>
  );
};
