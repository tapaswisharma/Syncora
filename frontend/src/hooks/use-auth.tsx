import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseConfigured } from "@/config/env";
import { setTokenProvider, setUnauthorizedHandler } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { supabase } from "@/lib/supabase";

const DEV_TOKEN = "dev-local-token";
const DEV_SESSION_KEY = "dbsynchro-dev-session";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface AuthContextValue {
  status: "loading" | "signed-in" | "signed-out";
  user: AuthUser | null;
  isDevSession: boolean;
  signInWithGoogle: () => Promise<void>;
  signInDev: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromSession(session: Session | null): AuthUser | null {
  if (!session) return null;
  const meta = session.user.user_metadata as Record<string, string | undefined>;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: meta.full_name ?? meta.name ?? null,
    avatarUrl: meta.avatar_url ?? meta.picture ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [devSession, setDevSession] = useState(() => !supabaseConfigured && sessionStorage.getItem(DEV_SESSION_KEY) === "1");
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setTokenProvider(async () => {
      if (supabase) return (await supabase.auth.getSession()).data.session?.access_token ?? null;
      return sessionStorage.getItem(DEV_SESSION_KEY) === "1" ? DEV_TOKEN : null;
    });
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    sessionStorage.removeItem(DEV_SESSION_KEY);
    setDevSession(false);
    setSession(null);
    queryClient.clear();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
  }, [signOut]);

  const value = useMemo<AuthContextValue>(() => {
    const devUser: AuthUser = { id: "dev", email: "developer@localhost", name: "Local Developer", avatarUrl: null };
    const user = supabase ? userFromSession(session) : devSession ? devUser : null;
    return {
      status: loading ? "loading" : user ? "signed-in" : "signed-out",
      user,
      isDevSession: !supabase && devSession,
      signInWithGoogle: async () => {
        if (!supabase) throw new Error("Supabase is not configured.");
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
      },
      signInDev: () => {
        sessionStorage.setItem(DEV_SESSION_KEY, "1");
        setDevSession(true);
      },
      signOut,
    };
  }, [session, devSession, loading, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
