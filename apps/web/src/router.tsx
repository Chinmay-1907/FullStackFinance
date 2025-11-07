import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { SetupPage } from "./pages/SetupPage";
import { CollectPage } from "./pages/CollectPage";
import { QueryPage } from "./pages/QueryPage";
import { InsightsPage } from "./pages/InsightsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/setup" replace /> },
      { path: "setup", element: <SetupPage /> },
      { path: "collect", element: <CollectPage /> },
      { path: "query", element: <QueryPage /> },
      { path: "insights", element: <InsightsPage /> },
    ],
  },
]);
