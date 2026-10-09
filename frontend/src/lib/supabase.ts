import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appConfig, supabaseConfigured } from "@/config/env";

/** Null when Supabase isn't configured (local development mode). */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    })
  : null;
