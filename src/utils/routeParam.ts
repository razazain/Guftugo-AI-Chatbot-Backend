import { AppError } from './AppError';

/**
 * Express 5 types route params as string | string[] | undefined.
 * These API routes expect exactly one non-empty path parameter.
 */
export function requireRouteParam(
  value: string | string[] | undefined,
  label: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, 'INVALID_ROUTE_PARAM', `The ${label} parameter is missing or invalid.`);
  }
  return value;
}
