import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { formatZodIssues } from "../utils/validation.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "NOT_FOUND", `No API route matches ${req.method} ${req.path}.`));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = String(req.id ?? "");
  if (error instanceof AppError) {
    if (error.status >= 500) logger.error({ err: error, cause: error.cause, requestId }, error.message);
    else logger.debug({ code: error.code, requestId }, error.message);
    return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details, requestId } });
  }
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", details: formatZodIssues(error), requestId },
    });
  }
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "The request body is not valid JSON.", requestId } });
  }
  logger.error({ err: error, requestId }, "Unhandled error");
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again.", requestId },
  });
}
