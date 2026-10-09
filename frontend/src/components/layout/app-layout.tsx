import {
  Activity,
  ArrowLeftRight,
  Database,
  GitCompareArrows,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Settings,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useConflicts } from "@/hooks/use-sync";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/ui-store";
import { Button } from "../ui/button";
import { BrandName } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/connections", label: "Connections", Icon: Plug },
  { to: "/databases", label: "Databases", Icon: Database },
  { to: "/syncs", label: "Syncs", Icon: ArrowLeftRight },
  { to: "/history", label: "History", Icon: History },
  { to: "/conflicts", label: "Conflicts", Icon: GitCompareArrows },
  { to: "/activity", label: "Activity", Icon: Activity },
  { to: "/settings", label: "Settings", Icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut, isDevSession } = useAuth();
  const { data: openConflicts } = useConflicts({ status: "OPEN" });
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <BrandName />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
        {navigation.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive ? "bg-primary-soft font-medium text-primary-ink" : "text-muted hover:bg-surface-muted hover:text-text",
              )
            }
          >
            <Icon aria-hidden className="size-4" />
            <span className="flex-1">{label}</span>
            {to === "/conflicts" && openConflicts?.length ? (
              <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-secondary-ink" aria-label={`${openConflicts.length} open`}>
                {openConflicts.length}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t border-border p-4">
        <ThemeToggle />
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-8 rounded-full border border-border" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-[#0f2433]">
              {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name ?? "Signed in"}</p>
            <p className="truncate text-xs text-muted">{isDevSession ? "Local development" : user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>
            <LogOut aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const { isDevSession } = useAuth();
  const location = useLocation();

  useEffect(() => setSidebarOpen(false), [location.pathname, setSidebarOpen]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-surface lg:block">
        <SidebarContent />
      </aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-[#0b1218]/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-pop-in border-r border-border bg-surface">
            <Button variant="ghost" size="icon" className="absolute top-4 right-3" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}>
              <X aria-hidden className="size-4" />
            </Button>
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
            <Menu aria-hidden className="size-5" />
          </Button>
          <BrandName />
        </div>
        {isDevSession ? (
          <div className="border-b border-secondary bg-secondary-soft px-4 py-2 text-center text-xs text-secondary-ink">
            Local development mode: authentication is disabled and you are signed in as a local developer. Configure Supabase before deploying.
          </div>
        ) : null}
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
