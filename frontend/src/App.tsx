import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppLayout } from "./components/layout/app-layout";
import { ProtectedRoute } from "./components/layout/protected-route";
import { LoadingBlock } from "./components/ui/spinner";
import { AuthProvider } from "./hooks/use-auth";
import { useThemeEffect } from "./hooks/use-theme";
import { queryClient } from "./lib/query-client";
import { resolveTheme, useUiStore } from "./stores/ui-store";
import DashboardPage from "./pages/dashboard-page";
import LoginPage from "./pages/login-page";

// Heavier pages load on demand.
const ConnectionsPage = lazy(() => import("./pages/connections-page"));
const DatabasesPage = lazy(() => import("./pages/databases-page"));
const SyncsPage = lazy(() => import("./pages/syncs-page"));
const SyncNewPage = lazy(() => import("./pages/sync-new-page"));
const SyncDetailPage = lazy(() => import("./pages/sync-detail-page"));
const HistoryPage = lazy(() => import("./pages/history-page"));
const ConflictsPage = lazy(() => import("./pages/conflicts-page"));
const ActivityPage = lazy(() => import("./pages/activity-page"));
const SettingsPage = lazy(() => import("./pages/settings-page"));
const NotFoundPage = lazy(() => import("./pages/not-found-page"));

function ThemedToaster() {
  const theme = useUiStore((state) => state.theme);
  return <Toaster position="bottom-right" theme={resolveTheme(theme)} richColors closeButton />;
}

export default function App() {
  useThemeEffect();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingBlock label="Loading…" />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/connections" element={<ConnectionsPage />} />
                  <Route path="/databases" element={<DatabasesPage />} />
                  <Route path="/syncs" element={<SyncsPage />} />
                  <Route path="/syncs/new" element={<SyncNewPage />} />
                  <Route path="/syncs/:id" element={<SyncDetailPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/conflicts" element={<ConflictsPage />} />
                  <Route path="/activity" element={<ActivityPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <ThemedToaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
