import { clsx } from "clsx";
import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "error" | "info";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-slate-100 text-slate-700 ring-slate-200",
};

interface StatusBadgeProps {
  tone?: StatusTone;
  children: ReactNode;
}

export const StatusBadge = ({ tone = "info", children }: StatusBadgeProps) => (
  <span
    className={clsx(
      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1",
      toneClasses[tone],
    )}
  >
    <span className="text-base leading-none">•</span>
    {children}
  </span>
);
