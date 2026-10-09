import type { SslMode } from "@/types/api";

/** Parses postgres://user:pass@host:port/db?sslmode=require into connection form fields. */
export function parseConnectionString(value: string): {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
} | null {
  try {
    const url = new URL(value.trim());
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;
    const ssl = url.searchParams.get("sslmode");
    return {
      host: url.hostname,
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      sslMode: ssl === "disable" ? "disable" : ssl === "verify-full" ? "verify-full" : "require",
    };
  } catch {
    return null;
  }
}
