const trim = (value: string | undefined) => (value ? value.trim().replace(/\/$/, "") : "");

export const appConfig = {
  apiBaseUrl: trim(import.meta.env.VITE_API_BASE_URL) || "http://localhost:4000",
  supabaseUrl: trim(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "",
  productName: "DBSynchro",
  tagline: "Bidirectional Google Sheets ↔ PostgreSQL Synchronization",
  developer: "Tapaswi Vemuru",
};

export const supabaseConfigured = Boolean(appConfig.supabaseUrl && appConfig.supabaseAnonKey);
