import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `Route ${req.method} ${req.path} was not found.` },
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred. Please try again.';
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.expose ? err.message : message;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Please check the submitted data.';
    details = err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    code = 'DATABASE_VALIDATION_ERROR';
    message = 'Some submitted data is invalid.';
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'A provided identifier is invalid.';
  } else if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    code = 'FILE_TOO_LARGE';
    message = 'Maximum upload size is 5 MB.';
  } else if ((err as { name?: string }).name === 'MulterError') {
    statusCode = 400;
    code = 'UPLOAD_ERROR';
    message = 'The upload could not be processed. Check the file field and size.';
  } else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON_BODY';
    message = 'Request body contains invalid JSON.';
  } else if ((err as { code?: number }).code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'An account with these details already exists.';
  }

  logger.error({ err, requestId: req.headers['x-request-id'], method: req.method, path: req.path, statusCode }, 'Request failed');
  const payload: Record<string, unknown> = { success: false, error: { code, message } };
  if (details && env.NODE_ENV !== 'production') (payload.error as Record<string, unknown>).details = details;
  if (env.NODE_ENV !== 'production' && statusCode === 500 && err instanceof Error) {
    (payload.error as Record<string, unknown>).debugMessage = err.message;
  }
  res.status(statusCode).json(payload);
};
