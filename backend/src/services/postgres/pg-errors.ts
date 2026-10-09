import { AppError } from "../../utils/errors.js";

interface PgLikeError {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
  column?: string;
}

/** Translates driver/server errors from a *user's* PostgreSQL into actionable messages. */
export function translatePgError(error: unknown, context: "connect" | "query" = "query"): AppError {
  if (error instanceof AppError) return error;
  const err = (error ?? {}) as PgLikeError;
  const code = err.code ?? "";
  const message = err.message ?? "";
  const options = { cause: error };

  if (code === "28P01" || code === "28000") {
    return new AppError(400, "PG_AUTH_FAILED", "PostgreSQL rejected the username or password. Please check your credentials.", options);
  }
  if (code === "3D000") {
    return new AppError(400, "PG_CONNECTION_FAILED", "That database does not exist on the server. Check the database name.", options);
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new AppError(400, "PG_CONNECTION_FAILED", "The PostgreSQL host could not be found. Check the hostname.", options);
  }
  if (code === "ECONNREFUSED") {
    return new AppError(400, "PG_CONNECTION_FAILED", "The PostgreSQL server refused the connection. Check the host, port and that the server accepts remote connections.", options);
  }
  if (code === "ETIMEDOUT" || (/timeout/i.test(message) && context === "connect")) {
    return new AppError(504, "PG_TIMEOUT", "Timed out connecting to PostgreSQL. Check the host, port, firewall rules and network access.", options);
  }
  if (code === "57014") {
    return new AppError(504, "PG_TIMEOUT", "The query took too long and was cancelled. Try narrowing your filters.", options);
  }
  if (/does not support SSL/i.test(message)) {
    return new AppError(400, "PG_CONNECTION_FAILED", "The server does not support SSL. Set SSL mode to \"disable\" for this connection.", options);
  }
  if (context === "connect" && /self[- ]signed certificate|certificate|SSL/i.test(message)) {
    return new AppError(400, "PG_CONNECTION_FAILED", "The SSL handshake failed. Try SSL mode \"require\" (skips certificate verification) or check the server certificate.", options);
  }
  if (/no pg_hba.conf entry/i.test(message)) {
    return new AppError(400, "PG_CONNECTION_FAILED", "The server does not allow connections from DBSynchro. Allow this host in pg_hba.conf or enable SSL.", options);
  }
  if (code === "23505") {
    return new AppError(409, "PG_CONSTRAINT_VIOLATION", `Duplicate value: a row with this ${err.constraint ? `unique key (${err.constraint})` : "key"} already exists.`, options);
  }
  if (code === "23502") {
    return new AppError(400, "PG_CONSTRAINT_VIOLATION", `The column "${err.column ?? "unknown"}" cannot be empty.`, options);
  }
  if (code === "23503") {
    return new AppError(409, "PG_CONSTRAINT_VIOLATION", "This change would break a foreign key relationship with another table.", options);
  }
  if (code === "23514") {
    return new AppError(400, "PG_CONSTRAINT_VIOLATION", `A value does not satisfy the check constraint${err.constraint ? ` "${err.constraint}"` : ""}.`, options);
  }
  if (code === "22P02" || code === "22007" || code === "22008" || code === "22003" || code === "22001") {
    return new AppError(400, "PG_QUERY_FAILED", `A value has the wrong format for its column type: ${message}`, options);
  }
  if (code === "42P01" || code === "42703") {
    return new AppError(400, "SCHEMA_MISMATCH", `The table structure has changed: ${message}`, options);
  }
  if (code === "42501") {
    return new AppError(403, "PG_QUERY_FAILED", "The database user does not have permission for this operation.", options);
  }
  if (context === "connect") {
    return new AppError(400, "PG_CONNECTION_FAILED", "Unable to connect to PostgreSQL. Please verify your host, port, username, password, and SSL settings.", options);
  }
  return new AppError(400, "PG_QUERY_FAILED", message ? `PostgreSQL error: ${message}` : "The PostgreSQL query failed.", options);
}

/** Short, single-line message for per-row errors recorded in sync runs. */
export function rowErrorMessage(error: unknown): string {
  return translatePgError(error).message;
}
