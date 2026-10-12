import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ConversationModel } from '../models/Conversation';
import { MessageModel } from '../models/Message';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { assertObjectId } from '../utils/objectId';
import { paginationQuerySchema } from '../utils/pagination';
import { requireRouteParam } from '../utils/routeParam';

export const createConversation: RequestHandler = asyncHandler(async (req, res) => {
  const body = z.object({
    title: z.string().trim().min(1).max(120).optional(),
    language: z.enum(['auto', 'english', 'roman-urdu']).optional(),
  }).parse(req.body ?? {});
  const conversation = await ConversationModel.create({
    userId: new Types.ObjectId(req.user!.id),
    title: body.title || 'New chat',
    language: body.language || 'auto',
    lastMessageAt: new Date(),
  });
  res.status(201).json({ success: true, data: { conversation } });
});

export const listConversations: RequestHandler = asyncHandler(async (req, res) => {
  const { page, limit } = paginationQuerySchema.parse(req.query);
  const filter = { userId: req.user!.id };
  const [conversations, total] = await Promise.all([
    ConversationModel.find(filter).sort({ lastMessageAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ConversationModel.countDocuments(filter),
  ]);
  res.json({ success: true, data: { conversations, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
});

export const getConversationMessages: RequestHandler = asyncHandler(async (req, res) => {
  const id = requireRouteParam(req.params.id, 'conversation id');
  assertObjectId(id, 'conversation id');
  const conversation = await ConversationModel.findOne({ _id: id, userId: req.user!.id }).lean();
  if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found.');
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), before: z.string().optional() }).parse(req.query);
  if (query.before) assertObjectId(query.before, 'message cursor');
  const filter: { conversationId: Types.ObjectId; userId: Types.ObjectId; _id?: { $lt: Types.ObjectId } } = {
    conversationId: conversation._id,
    userId: new Types.ObjectId(req.user!.id),
  };
  if (query.before) filter._id = { $lt: new Types.ObjectId(query.before) };
  const rows = await MessageModel.find(filter).sort({ _id: -1 }).limit(query.limit + 1).lean();
  const hasMore = rows.length > query.limit;
  const pageRows = rows.slice(0, query.limit).reverse();
  const nextCursor = hasMore && pageRows.length ? String(pageRows[0]!._id) : null;
  res.json({ success: true, data: { conversation, messages: pageRows, pagination: { limit: query.limit, hasMore, nextCursor } } });
});

export const renameConversation: RequestHandler = asyncHandler(async (req, res) => {
  const id = requireRouteParam(req.params.id, 'conversation id');
  assertObjectId(id, 'conversation id');
  const body = z.object({ title: z.string().trim().min(1).max(120) }).parse(req.body);
  const conversation = await ConversationModel.findOneAndUpdate(
    { _id: id, userId: req.user!.id },
    { $set: { title: body.title } },
    { new: true, runValidators: true },
  );
  if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found.');
  res.json({ success: true, data: { conversation } });
});

export const deleteConversation: RequestHandler = asyncHandler(async (req, res) => {
  const id = requireRouteParam(req.params.id, 'conversation id');
  assertObjectId(id, 'conversation id');
  const conversation = await ConversationModel.findOneAndDelete({ _id: id, userId: req.user!.id });
  if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found.');
  await MessageModel.deleteMany({ conversationId: conversation._id, userId: req.user!.id });
  res.json({ success: true, data: { message: 'Conversation deleted successfully.' } });
});
