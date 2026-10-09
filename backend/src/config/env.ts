import "dotenv/config";
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const booleanFlag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === "" ? fallback : ["1", "true", "yes", "on"].includes(value.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  /** Comma separated list of extra origins allowed by CORS (e.g. Vercel preview URLs). */
  CORS_ORIGINS: optionalString,

  DATABASE_URL: optionalString,
  DATABASE_SSL: booleanFlag(false),

  AUTH_MODE: z.enum(["supabase", "dev"]).optional(),
  SUPABASE_URL: optionalString,
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_JWT_SECRET: optionalString,

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalString,

  ENCRYPTION_KEY: optionalString,

  ALLOW_PRIVATE_DB_HOSTS: optionalString,
  ENABLE_SCHEDULER: booleanFlag(true),
  MAX_SYNC_ROWS: z.coerce.number().int().positive().default(20000),
  DEGRADED_LATENCY_MS: z.coerce.number().int().positive().default(750),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === "production";

const authMode: "supabase" | "dev" = raw.AUTH_MODE ?? (raw.SUPABASE_URL ? "supabase" : "dev");

if (isProduction && authMode === "dev") {
  console.error("AUTH_MODE=dev is not allowed in production. Configure SUPABASE_URL to enable Supabase authentication.");
  process.exit(1);
}
if (authMode === "supabase" && !raw.SUPABASE_URL) {
  console.error("AUTH_MODE=supabase requires SUPABASE_URL.");
  process.exit(1);
}
if (isProduction && !raw.ENCRYPTION_KEY) {
  console.error("ENCRYPTION_KEY is required in production (32 random bytes, base64 or hex encoded).");
  process.exit(1);
}

export const env = {
  ...raw,
  isProduction,
  isTest: raw.NODE_ENV === "test",
  authMode,
  allowPrivateDbHosts: raw.ALLOW_PRIVATE_DB_HOSTS
    ? ["1", "true", "yes"].includes(raw.ALLOW_PRIVATE_DB_HOSTS.toLowerCase())
    : !isProduction,
  googleRedirectUri: raw.GOOGLE_REDIRECT_URI ?? `${raw.API_BASE_URL.replace(/\/$/, "")}/api/google/callback`,
  googleConfigured: Boolean(raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET),
  databaseConfigured: Boolean(raw.DATABASE_URL),
  corsOrigins: [
    raw.FRONTEND_URL.replace(/\/$/, ""),
    ...(raw.CORS_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  ],
};

export type Env = typeof env;
