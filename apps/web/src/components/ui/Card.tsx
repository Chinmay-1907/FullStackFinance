import { clsx } from "clsx";
import type { PropsWithChildren, ReactNode } from "react";

interface CardProps extends PropsWithChildren {
  title?: string;
  description?: string;
  className?: string;
  headerAction?: ReactNode;
}

export const Card = ({ title, description, className, headerAction, children }: CardProps) => (
  <section className={clsx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
    {(title || description) && (
      <header className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
        <div>
          {title ? <h2 className="text-base font-semibold text-slate-900">{title}</h2> : null}
          {description ? (
            <p className="text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {headerAction}
      </header>
    )}
    <div className="px-6 py-5">{children}</div>
  </section>
);
