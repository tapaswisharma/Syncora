import { ArrowLeftRight, Database, GitCompareArrows, History, ShieldCheck, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { BrandMark } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineNotice } from "@/components/ui/error-state";
import { appConfig, supabaseConfigured } from "@/config/env";
import { useAuth } from "@/hooks/use-auth";
import { usePublicConfig } from "@/hooks/use-system";
import { errorText } from "@/lib/api";

const features = [
  { Icon: Database, title: "Explore PostgreSQL", text: "Browse schemas and tables, then edit rows inline with server-side paging." },
  { Icon: ArrowLeftRight, title: "Sync both ways", text: "Push table changes to Google Sheets and pull sheet edits back, keyed by a real identifier." },
  { Icon: GitCompareArrows, title: "Handle conflicts", text: "Concurrent edits are detected, recorded, and resolved by the strategy you choose." },
  { Icon: History, title: "Full history", text: "Every run, row count, conflict and error is logged so nothing changes silently." },
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

export default function LoginPage() {
  const { status, signInWithGoogle, signInDev } = useAuth();
  const config = usePublicConfig();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "signed-in") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/dashboard"} replace />;
  }

  const backendDevMode = config.data?.authMode === "dev";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-primary/35 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-20 bottom-10 size-80 rounded-full bg-secondary/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-1/3 left-1/3 size-64 rounded-full bg-success/35 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="text-lg font-semibold tracking-tight">DBSynchro</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Your PostgreSQL tables and Google Sheets, <span className="rounded-md bg-secondary/70 px-1.5">in sync</span>.
          </h1>
          <p className="mt-4 text-base text-muted">{appConfig.tagline}</p>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {features.map(({ Icon, title, text }) => (
              <li key={title} className="rounded-xl border border-border bg-surface/80 p-4 backdrop-blur">
                <Icon aria-hidden className="mb-2 size-4 text-primary-strong" />
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted">Designed and built by {appConfig.developer}.</p>
      </section>

      <section className="flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:invisible">
            <BrandMark />
            <span className="font-semibold">DBSynchro</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-8 flex items-center gap-2 text-primary-strong">
            <Database aria-hidden className="size-5" />
            <ArrowLeftRight aria-hidden className="size-4 text-secondary-strong" />
            <FileSpreadsheet aria-hidden className="size-5 text-success-strong" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in to DBSynchro</h2>
          <p className="mt-2 text-sm text-muted">Use your Google account. You can connect the Google account that owns your spreadsheets separately in Settings.</p>

          <div className="mt-8 space-y-3">
            {config.isError ? <ErrorState error={config.error} onRetry={() => void config.refetch()} title="API unavailable" /> : null}
            {error ? <ErrorState error={new Error(error)} title="Sign-in failed" /> : null}

            {supabaseConfigured ? (
              <Button
                variant="outline"
                size="lg"
                className="w-full justify-center"
                loading={pending}
                loadingText="Redirecting to Google…"
                onClick={async () => {
                  setError(null);
                  setPending(true);
                  try {
                    await signInWithGoogle();
                  } catch (caught) {
                    setError(errorText(caught));
                    setPending(false);
                  }
                }}
              >
                <GoogleIcon /> Continue with Google
              </Button>
            ) : (
              <>
                <InlineNotice tone="warning">
                  Supabase is not configured, so Google sign-in is unavailable. Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{" "}
                  <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> in <code className="font-mono text-xs">frontend/.env</code>.
                </InlineNotice>
                {backendDevMode ? (
                  <Button variant="primary" size="lg" className="w-full justify-center" onClick={signInDev}>
                    Continue in local development mode
                  </Button>
                ) : config.data ? (
                  <p className="text-sm text-muted">The API requires Supabase authentication, so configure Supabase in the frontend to sign in.</p>
                ) : null}
              </>
            )}
          </div>
          <p className="mt-8 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck aria-hidden className="size-3.5 text-success-strong" />
            Database passwords and Google tokens are encrypted at rest and never sent to the browser.
          </p>
        </div>
      </section>
    </div>
  );
}
