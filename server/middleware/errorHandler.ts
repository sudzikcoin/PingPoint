import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { isProduction, isTest } from "../config";
import { logger } from "../utils/logger";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, "BAD_REQUEST", details);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, "Too many requests, please try again later", "RATE_LIMITED");
  }
}

function formatZodError(error: ZodError): string {
  return error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
}

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (!isTest()) {
    logger.error(`${req.method} ${req.path} failed`, {
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack,
      code: err instanceof AppError ? err.code : undefined,
      statusCode: err instanceof AppError ? err.statusCode : 500,
    });
  }
  
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details && !isProduction() ? { details: err.details } : {}),
    });
    return;
  }
  
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      code: "VALIDATION_ERROR",
      details: isProduction() ? undefined : formatZodError(err),
    });
    return;
  }
  
  res.status(500).json({
    error: isProduction() ? "Internal server error" : err.message,
    code: "INTERNAL_ERROR",
  });
};

export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
