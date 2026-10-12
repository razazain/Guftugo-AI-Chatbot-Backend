import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';

const standard = { standardHeaders: 'draft-8' as const, legacyHeaders: false };

export const globalLimiter = rateLimit({
  ...standard,
  windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MS,
  limit: env.GLOBAL_RATE_LIMIT_MAX,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } },
});

export const authLimiter = rateLimit({
  ...standard,
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many sign-in attempts. Please wait before trying again.' } },
});

export const chatLimiter = rateLimit({
  ...standard,
  windowMs: 60 * 1000,
  limit: env.CHAT_RATE_LIMIT_MAX,
  keyGenerator: (req) => req.user?.id ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  message: { success: false, error: { code: 'CHAT_RATE_LIMITED', message: 'You are sending messages too quickly. Please wait a moment.' } },
});
