import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { UserModel } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new AppError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'guftugo-api', audience: 'guftugo-client' });
  } catch {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Your session is invalid or expired. Please sign in again.');
  }

  if (typeof payload === 'string' || payload.typ !== 'access' || typeof payload.sub !== 'string') {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Your session is invalid or expired. Please sign in again.');
  }

  const user = await UserModel.findById(payload.sub).select('_id email isActive').lean();
  if (!user || !user.isActive) throw new AppError(401, 'ACCOUNT_UNAVAILABLE', 'This account is not available.');
  req.user = { id: user._id.toString(), email: user.email };
  next();
});
