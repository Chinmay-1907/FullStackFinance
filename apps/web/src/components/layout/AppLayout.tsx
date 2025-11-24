import { NavLink, Outlet, useLocation } from "react-router-dom";
import { API_BASE_URL } from "../../lib/env";

const routes = [
  { path: "/setup", label: "Setup" },
  { path: "/collect", label: "Collect" },
  { path: "/query", label: "Query" },
  { path: "/insights", label: "Insights" },
];

export const AppLayout = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white p-6 md:flex">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FIN-RAG</p>
            <p className="text-lg font-semibold text-slate-900">Control Center</p>
          </div>
          <nav className="space-y-1">
            {routes.map((route) => (
              <NavLink
                key={route.path}
                to={route.path}
                className={({ isActive }) =>
                  [
                    "flex items-center rounded-md px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-slate-900 text-white shadow"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  ].join(" ")
                }
              >
                {route.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-800">Environment</p>
            <p className="mt-1">API: {API_BASE_URL}</p>
          </div>
        </aside>

        <main className="flex-1">
          <header className="flex flex-col gap-2 border-b border-slate-200 bg-white px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Phase 6 &mdash; Frontend Application
              </p>
              <h1 className="text-lg font-semibold text-slate-900">
                {routes.find((route) => route.path === location.pathname)?.label ?? "Workspace"}
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-600">
                • live preview ready
              </span>
              <span>Vite + React Query + Tailwind</span>
            </div>
          </header>
          <section className="page-shell">
            <Outlet />
          </section>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
