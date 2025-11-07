import { Card } from "../components/ui/Card";
import { StatusBadge } from "../components/ui/StatusBadge";

const placeholderMetrics = [
  { label: "Tickers tracked", value: 4 },
  { label: "Documents processed", value: 186 },
  { label: "Last ingestion", value: "2h ago" },
  { label: "Vector manifests", value: 4 },
];

export const InsightsPage = () => (
  <div className="space-y-6">
    <Card
      title="Operational snapshot"
      description="Placeholder data until Phase 6 integrates real metrics endpoints."
    >
      <div className="grid gap-4 md:grid-cols-4">
        {placeholderMetrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</p>
          </div>
        ))}
      </div>
    </Card>

    <Card
      title="Upcoming enhancements"
      description="Documented TODO items for Phase 6+ so the frontend contract stays aligned with the API roadmap."
    >
      <ul className="space-y-3 text-sm text-slate-600">
        <li>
          <StatusBadge tone="info">TODO</StatusBadge> Bind live metrics once `/metrics` exposes query
          latency percentiles.
        </li>
        <li>
          <StatusBadge tone="warning">TODO</StatusBadge> Add ingestion timeline visualization grouped
          by stage progress.
        </li>
        <li>
          <StatusBadge tone="info">TODO</StatusBadge> Surface vector manifest health (docIds count,
          embedding model) via new backend endpoint.
        </li>
      </ul>
    </Card>
  </div>
);
