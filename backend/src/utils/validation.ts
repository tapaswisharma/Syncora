import type { ZodError, ZodType } from "zod";
import { AppError } from "./errors.js";

export function formatZodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/** Parses input with a Zod schema, throwing a friendly 400 on failure. */
export function parse<T>(schema: ZodType<T>, input: unknown, what = "request"): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = formatZodIssues(result.error);
    const first = issues[0];
    const message = first ? `Invalid ${what}: ${first.path ? `${first.path}: ` : ""}${first.message}` : `Invalid ${what}.`;
    throw new AppError(400, "VALIDATION_FAILED", message, { details: issues });
  }
  return result.data;
}
