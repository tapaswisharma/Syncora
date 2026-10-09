import { AppError } from "../../utils/errors.js";

interface GaxiosLike {
  status?: number;
  code?: number | string;
  message?: string;
  response?: { status?: number; data?: { error?: string | { message?: string; status?: string } } };
}

export function googleStatus(error: unknown): number | undefined {
  const err = (error ?? {}) as GaxiosLike;
  if (typeof err.status === "number") return err.status;
  if (typeof err.response?.status === "number") return err.response.status;
  if (typeof err.code === "number") return err.code;
  return undefined;
}

/** Turns Google API failures into clear, actionable messages. */
export function translateGoogleError(error: unknown, subject = "Google Sheets"): AppError {
  if (error instanceof AppError) return error;
  const err = (error ?? {}) as GaxiosLike;
  const status = googleStatus(error);
  const data = err.response?.data?.error;
  const detail = typeof data === "string" ? data : data?.message ?? err.message ?? "";
  const options = { cause: error };

  if (detail === "invalid_grant" || /invalid_grant|Token has been expired or revoked/i.test(err.message ?? "") || status === 401) {
    return new AppError(401, "GOOGLE_AUTH_EXPIRED", "Your Google authorization has expired or was revoked. Reconnect your Google account in Settings.", options);
  }
  if (status === 403) {
    if (/has not been used|is disabled|API has not been/i.test(detail)) {
      return new AppError(502, "GOOGLE_API_ERROR", "The Google Sheets or Drive API is not enabled for this Google Cloud project. Enable both APIs in the Google Cloud console.", options);
    }
    if (/insufficient/i.test(detail)) {
      return new AppError(403, "GOOGLE_PERMISSION_DENIED", "DBSynchro is missing a Google permission. Reconnect your Google account and approve all requested access.", options);
    }
    if (/rate|quota/i.test(detail)) {
      return new AppError(429, "GOOGLE_RATE_LIMITED", "Google API quota exceeded. Wait a minute and try again.", options);
    }
    return new AppError(403, "GOOGLE_PERMISSION_DENIED", `Your Google account does not have access to this ${subject === "Google Sheets" ? "spreadsheet" : subject}.`, options);
  }
  if (status === 404) {
    return new AppError(404, "GOOGLE_NOT_FOUND", "The spreadsheet or worksheet was not found. It may have been deleted, renamed or unshared.", options);
  }
  if (status === 429) {
    return new AppError(429, "GOOGLE_RATE_LIMITED", "Google is rate limiting requests. Wait a minute and try again.", options);
  }
  if (status === 400 && /Unable to parse range/i.test(detail)) {
    return new AppError(404, "GOOGLE_NOT_FOUND", "The worksheet was not found. It may have been renamed or deleted.", options);
  }
  if (status && status >= 500) {
    return new AppError(502, "GOOGLE_API_ERROR", "Google's servers returned an error. Please try again shortly.", options);
  }
  if (["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(String(err.code))) {
    return new AppError(502, "GOOGLE_API_ERROR", "Could not reach Google's servers. Check the server's network connection.", options);
  }
  return new AppError(502, "GOOGLE_API_ERROR", detail ? `${subject} error: ${detail}` : `${subject} request failed.`, options);
}

/** Retries rate-limited and transient Google calls with exponential backoff. */
export async function withGoogleRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const status = googleStatus(error);
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 250));
      delay *= 2;
    }
  }
}
