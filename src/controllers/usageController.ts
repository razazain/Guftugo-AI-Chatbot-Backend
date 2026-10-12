import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UsageLogModel } from '../models/UsageLog';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { getPublicProviderConfiguration } from '../llm/providerRegistry';

export const getUsageSummary: RequestHandler = asyncHandler(async (req, res) => {
  const query = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(req.query);
  const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
  const match = { userId: new Types.ObjectId(req.user!.id), createdAt: { $gte: since } };
  const [overall, byProvider, daily] = await Promise.all([
    UsageLogModel.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        requests: { $sum: 1 },
        successfulRequests: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        failedAttempts: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        totalTokens: { $sum: '$totalTokens' },
        averageLatencyMs: { $avg: '$latencyMs' },
      } },
    ]),
    UsageLogModel.aggregate([
      { $match: match },
      { $group: { _id: '$provider', requests: { $sum: 1 }, totalTokens: { $sum: '$totalTokens' }, errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } } } },
      { $sort: { requests: -1 } },
    ]),
    UsageLogModel.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, requests: { $sum: 1 }, totalTokens: { $sum: '$totalTokens' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({ success: true, data: { periodDays: query.days, overall: overall[0] ?? { requests: 0, successfulRequests: 0, failedAttempts: 0, totalTokens: 0, averageLatencyMs: 0 }, byProvider, daily } });
});

export const getProviders: RequestHandler = (_req, res) => {
  res.json({ success: true, data: getPublicProviderConfiguration() });
};
