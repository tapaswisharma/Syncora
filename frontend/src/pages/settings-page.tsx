import { CircleAlert, CircleCheck, FileSpreadsheet, Key, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState, InlineNotice } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RelativeTime } from "@/components/ui/relative-time";
import { SkeletonRows } from "@/components/ui/skeleton";
import { HealthBadge } from "@/components/ui/status";
import { appConfig, supabaseConfigured } from "@/config/env";
import { useAuth } from "@/hooks/use-auth";
import { useConnectGoogle, useDisconnectGoogle, useGoogleHealthCheck, useGoogleStatus } from "@/hooks/use-google";
import { usePublicConfig } from "@/hooks/use-system";
import { errorText } from "@/lib/api";
import { useState } from "react";

function ConfigRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      {ok ? <CircleCheck aria-hidden className="mt-0.5 size-4 text-success-strong" /> : <CircleAlert aria-hidden className="mt-0.5 size-4 text-secondary-strong" />}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const { user, isDevSession } = useAuth();
  const config = usePublicConfig();
  const google = useGoogleStatus();
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();
  const healthCheck = useGoogleHealthCheck();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // The OAuth callback redirects back here with the outcome.
  useEffect(() => {
    const status = params.get("google");
    if (!status) return;
    if (status === "connected") toast.success("Google account connected");
    else toast.error(params.get("reason") ?? "Google connection failed");
    const next = new URLSearchParams(params);
    next.delete("google");
    next.delete("reason");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const integration = google.data?.integration;

  return (
    <>
      <PageHeader title="Settings" description="Your account, the Google connection and this installation's configuration." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Google Sheets" description="The Google account whose spreadsheets DBSynchro reads and writes." icon={<FileSpreadsheet aria-hidden className="size-5 text-success-strong" />} />
          <div className="space-y-4 px-5 py-4">
            {google.isLoading ? (
              <SkeletonRows rows={2} />
            ) : google.isError ? (
              <ErrorState error={google.error} onRetry={() => void google.refetch()} />
            ) : !google.data?.configured ? (
              <InlineNotice tone="warning">
                Google integration is not configured on the server. Set <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code>,{" "}
                <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> and <code className="font-mono text-xs">GOOGLE_REDIRECT_URI</code> in{" "}
                <code className="font-mono text-xs">backend/.env</code>, then restart the API. The README has the Google Cloud steps.
              </InlineNotice>
            ) : integration ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{integration.googleEmail ?? "Google account"}</p>
                    <p className="text-xs text-muted">
                      Connected <RelativeTime value={integration.connectedAt} /> · checked <RelativeTime value={integration.lastCheckedAt} fallback="not yet" />
                    </p>
                  </div>
                  <HealthBadge status={integration.healthStatus} />
                </div>
                {integration.lastError ? <InlineNotice tone="warning">{integration.lastError}</InlineNotice> : null}
                {!integration.hasRefreshToken ? (
                  <InlineNotice tone="warning">No refresh token was stored, so access will expire. Reconnect and approve offline access.</InlineNotice>
                ) : null}
                {healthCheck.data?.checks.length ? (
                  <ul className="space-y-1">
                    {healthCheck.data.checks.map((check) => (
                      <li key={check.name} className="flex items-center gap-2 text-xs">
                        {check.ok ? <CircleCheck aria-hidden className="size-3.5 text-success-strong" /> : <CircleAlert aria-hidden className="size-3.5 text-danger" />}
                        <span className="font-medium">{check.name}:</span>
                        <span className="text-muted">{check.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    loading={healthCheck.isPending}
                    loadingText="Checking…"
                    onClick={() =>
                      healthCheck.mutate(undefined, {
                        onSuccess: (result) =>
                          result.status === "CONNECTED" ? toast.success("Google connection verified") : toast.warning(result.checks.find((check) => !check.ok)?.message ?? "Google connection is degraded"),
                        onError: (error) => toast.error(errorText(error)),
                      })
                    }
                  >
                    <RefreshCw aria-hidden className="size-3.5" /> Verify connection
                  </Button>
                  <Button variant="ghost" onClick={() => connect.mutate()} loading={connect.isPending}>
                    Reconnect
                  </Button>
                  <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmDisconnect(true)}>
                    <Unplug aria-hidden className="size-3.5" /> Disconnect
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Connect a Google account to list your spreadsheets and sync data to and from them.</p>
                <Button variant="sheets" loading={connect.isPending} loadingText="Opening Google…" onClick={() => connect.mutate()}>
                  Connect Google account
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Account" description="Signed in through Supabase authentication." icon={<Key aria-hidden className="size-5 text-primary-strong" />} />
          <div className="space-y-4 px-5 py-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Name</dt>
                <dd className="truncate font-medium">{user?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Email</dt>
                <dd className="truncate font-medium">{user?.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Mode</dt>
                <dd className="font-medium">{isDevSession ? "Local development" : "Supabase + Google OAuth"}</dd>
              </div>
            </dl>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Theme</p>
              <ThemeToggle showLabels />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Installation" description="What this DBSynchro installation has configured." icon={<ShieldCheck aria-hidden className="size-5 text-success-strong" />} />
          {config.isLoading ? (
            <div className="p-5">
              <SkeletonRows rows={4} />
            </div>
          ) : config.isError ? (
            <div className="p-5">
              <ErrorState error={config.error} onRetry={() => void config.refetch()} title="Could not reach the API" />
            </div>
          ) : config.data ? (
            <div className="divide-y divide-border">
              <ConfigRow label="API" ok detail={`${appConfig.apiBaseUrl} · ${config.data.environment}`} />
              <ConfigRow
                label="Metadata database"
                ok={config.data.databaseConfigured}
                detail={config.data.databaseConfigured ? "DATABASE_URL is set and migrations have been applied." : "Set DATABASE_URL in backend/.env and run npm run db:migrate."}
              />
              <ConfigRow
                label="Authentication"
                ok={config.data.authMode === "supabase" && supabaseConfigured}
                detail={
                  config.data.authMode === "supabase"
                    ? supabaseConfigured
                      ? "Supabase authentication with Google OAuth."
                      : "The API expects Supabase, but the frontend has no VITE_SUPABASE_URL."
                    : "Local development mode: anyone who can reach the API is the same local user. Not for production."
                }
              />
              <ConfigRow
                label="Google integration"
                ok={config.data.googleConfigured}
                detail={config.data.googleConfigured ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set." : "Google Sheets features are disabled until the OAuth client is configured."}
              />
              <ConfigRow
                label="Secret encryption"
                ok={config.data.encryptionKeyConfigured}
                detail={
                  config.data.encryptionKeyConfigured
                    ? "Database passwords and Google tokens are encrypted with ENCRYPTION_KEY."
                    : "ENCRYPTION_KEY is not set, so a development key is used. Set it before storing real credentials."
                }
              />
            </div>
          ) : null}
        </Card>
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        {appConfig.productName} · {appConfig.tagline} · built by {appConfig.developer}
      </p>

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        destructive
        title="Disconnect Google account?"
        description="DBSynchro will revoke its access token. Syncs that use Google Sheets will fail until you reconnect."
        confirmLabel="Disconnect"
        loading={disconnect.isPending}
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: () => {
              toast.success("Google account disconnected");
              setConfirmDisconnect(false);
            },
            onError: (error) => toast.error(errorText(error)),
          })
        }
      />
    </>
  );
}
