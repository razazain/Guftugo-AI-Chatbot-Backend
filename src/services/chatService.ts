import mongoose, { Types } from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ConversationModel } from '../models/Conversation';
import { MessageModel } from '../models/Message';
import { ProviderHealthLogModel } from '../models/ProviderHealthLog';
import { UsageLogModel } from '../models/UsageLog';
import { UserModel } from '../models/User';
import { getDocumentContext } from './documentService';
import { searchWeb, type WebSearchSource } from './webSearchService';
import { generateCompletion, generateStreamingCompletion } from '../llm/orchestrator';
import { LlmServiceError, type ChatMessage, type LlmResult, type ProviderAttempt, type ProviderName } from '../llm/types';
import { buildModelMessages, createConversationTitle } from './chatPrompt';
import { AppError } from '../utils/AppError';
import type { LanguagePreference } from './authService';

export interface SendChatInput {
  userId: string;
  message: string;
  conversationId?: string;
  language?: LanguagePreference;
  documentIds?: string[];
  webSearch?: boolean;
}

async function getOrCreateConversation(input: SendChatInput) {
  if (input.conversationId) {
    if (!mongoose.isValidObjectId(input.conversationId)) throw new AppError(400, 'INVALID_CONVERSATION_ID', 'Conversation ID is invalid.');
    const conversation = await ConversationModel.findOne({ _id: input.conversationId, userId: input.userId });
    if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found.');
    return { conversation, created: false };
  }

  const conversation = await ConversationModel.create({
    userId: new Types.ObjectId(input.userId),
    title: createConversationTitle(input.message),
    language: input.language ?? 'auto',
    lastMessageAt: new Date(),
  });
  return { conversation, created: true };
}

async function getLanguagePreference(userId: string, supplied?: LanguagePreference): Promise<LanguagePreference> {
  if (supplied) return supplied;
  const user = await UserModel.findById(userId).select('preferredLanguage').lean();
  return (user?.preferredLanguage as LanguagePreference | undefined) ?? 'auto';
}

async function prepareInput(input: SendChatInput, searchContext = '', sources: WebSearchSource[] = []) {
  const documentContext = await getDocumentContext(input.userId, input.documentIds ?? []);
  const referenceContext = [documentContext, searchContext].filter(Boolean).join('\n\n---\n\n');
  const { conversation, created } = await getOrCreateConversation(input);
  const userMessage = await MessageModel.create({
    userId: new Types.ObjectId(input.userId),
    conversationId: conversation._id,
    role: 'user',
    content: input.message,
    status: 'complete',
    documentIds: (input.documentIds ?? []).map((id) => new Types.ObjectId(id)),
  });
  await ConversationModel.updateOne(
    { _id: conversation._id, userId: input.userId },
    { $set: { lastMessageAt: new Date(), ...(created ? { title: createConversationTitle(input.message) } : {}) }, $inc: { messageCount: 1 } },
  );

  const historyDocs = await MessageModel.find({
    conversationId: conversation._id,
    userId: input.userId,
    _id: { $ne: userMessage._id },
    $or: [{ role: 'user' }, { status: 'complete' }],
  }).sort({ createdAt: -1, _id: -1 }).limit(env.LLM_MAX_HISTORY_MESSAGES).select('role content').lean();
  const history = historyDocs.reverse().map((doc) => ({ role: doc.role as 'user' | 'assistant', content: doc.content }));
  const conversationLanguage = conversation.language as LanguagePreference;
  const language = await getLanguagePreference(input.userId, input.language ?? (conversationLanguage !== 'auto' ? conversationLanguage : undefined));
  const modelMessages = buildModelMessages(history, input.message, language, referenceContext);
  const assistantMessage = await MessageModel.create({
    userId: new Types.ObjectId(input.userId),
    conversationId: conversation._id,
    role: 'assistant',
    content: '',
    status: 'pending',
    documentIds: (input.documentIds ?? []).map((id) => new Types.ObjectId(id)),
    sources,
  });
  return { conversation, userMessage, assistantMessage, modelMessages, language, sources };
}

async function persistAttempts(
  attempts: ProviderAttempt[],
  input: { userId: string; conversationId: string; messageId?: string },
  fallbackUsed: boolean,
): Promise<void> {
  if (attempts.length === 0) return;
  const usage = attempts.map((attempt) => ({
    userId: new Types.ObjectId(input.userId),
    conversationId: new Types.ObjectId(input.conversationId),
    ...(input.messageId && attempt.status === 'success' ? { messageId: new Types.ObjectId(input.messageId) } : {}),
    provider: attempt.provider,
    model: attempt.model,
    promptTokens: attempt.promptTokens ?? 0,
    completionTokens: attempt.completionTokens ?? 0,
    totalTokens: attempt.totalTokens ?? 0,
    estimatedTokens: attempt.estimatedTokens ?? false,
    latencyMs: attempt.latencyMs,
    status: attempt.status,
    errorCode: attempt.errorCode,
    fallbackUsed: fallbackUsed && attempt.status === 'success',
  }));
  const health: Array<{ provider: ProviderName; event: 'attempt_succeeded' | 'attempt_failed' | 'fallback_triggered'; errorCode?: string; latencyMs: number }> = attempts.map((attempt) => ({
    provider: attempt.provider,
    event: attempt.status === 'success' ? 'attempt_succeeded' : 'attempt_failed',
    errorCode: attempt.errorCode,
    latencyMs: attempt.latencyMs,
  }));
  if (fallbackUsed) {
    const successful = attempts.find((attempt) => attempt.status === 'success');
    if (successful) health.push({ provider: successful.provider, event: 'fallback_triggered', latencyMs: successful.latencyMs });
  }
  await Promise.allSettled([
    UsageLogModel.insertMany(usage),
    ProviderHealthLogModel.insertMany(health),
  ]).then((results) => {
    for (const result of results) if (result.status === 'rejected') logger.warn({ error: result.reason }, 'Could not persist provider telemetry');
  });
}

function applyResult(assistantMessage: { save: () => Promise<unknown>; content: string; status: string; provider?: string | null; model?: string | null; tokenUsage?: unknown; latencyMs?: number | null; fallbackUsed?: boolean; errorCode?: string | null; sources?: unknown[]; documentIds?: unknown[] }, result: LlmResult, extras: { sources: WebSearchSource[]; documentIds: string[] }) {
  assistantMessage.content = result.content;
  assistantMessage.status = 'complete';
  assistantMessage.provider = result.provider;
  assistantMessage.model = result.model;
  assistantMessage.tokenUsage = {
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    estimated: result.estimatedTokens,
  };
  assistantMessage.latencyMs = result.latencyMs;
  assistantMessage.fallbackUsed = result.fallbackUsed;
  assistantMessage.sources = extras.sources;
  assistantMessage.documentIds = extras.documentIds;
  return assistantMessage.save();
}

export async function sendChatMessage(input: SendChatInput) {
  const webContext = input.webSearch ? await searchWeb(input.message) : { sources: [], context: '' };
  const prepared = await prepareInput(input, webContext.context, webContext.sources);
  const startedAt = Date.now();
  try {
    const result = await generateCompletion(prepared.modelMessages);
    await applyResult(prepared.assistantMessage, result, { sources: prepared.sources, documentIds: input.documentIds ?? [] });
    await ConversationModel.updateOne({ _id: prepared.conversation._id }, { $inc: { messageCount: 1 }, $set: { lastMessageAt: new Date() } });
    await persistAttempts(result.attempts, { userId: input.userId, conversationId: prepared.conversation.id, messageId: prepared.assistantMessage.id }, result.fallbackUsed);
    return {
      conversation: { id: prepared.conversation.id, title: (await ConversationModel.findById(prepared.conversation._id).select('title').lean())?.title ?? prepared.conversation.title },
      userMessage: { id: prepared.userMessage.id, role: 'user', content: prepared.userMessage.content, documentIds: input.documentIds ?? [], createdAt: prepared.userMessage.createdAt },
      assistantMessage: {
        id: prepared.assistantMessage.id,
        role: 'assistant',
        content: result.content,
        provider: result.provider,
        model: result.model,
        tokenUsage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens, totalTokens: result.totalTokens, estimated: result.estimatedTokens },
        latencyMs: result.latencyMs,
        fallbackUsed: result.fallbackUsed,
        sources: prepared.sources,
        documentIds: input.documentIds ?? [],
        createdAt: prepared.assistantMessage.createdAt,
      },
    };
  } catch (error) {
    const attempts = error instanceof LlmServiceError ? error.attempts : [];
    const errorCode = error instanceof LlmServiceError ? error.code : 'CHAT_GENERATION_FAILED';
    prepared.assistantMessage.status = 'failed';
    prepared.assistantMessage.errorCode = errorCode;
    prepared.assistantMessage.latencyMs = Date.now() - startedAt;
    await prepared.assistantMessage.save();
    await persistAttempts(attempts, { userId: input.userId, conversationId: prepared.conversation.id }, false);
    if (error instanceof LlmServiceError) throw new AppError(503, 'AI_PROVIDER_UNAVAILABLE', error.message);
    throw error;
  }
}

export async function streamChatMessage(
  input: SendChatInput,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  onReady?: (meta: { conversationId: string; title: string; userMessageId: string; assistantMessageId: string; sources: WebSearchSource[]; documentIds: string[] }) => void,
) {
  const webContext = input.webSearch ? await searchWeb(input.message) : { sources: [], context: '' };
  const prepared = await prepareInput(input, webContext.context, webContext.sources);
  const startedAt = Date.now();
  try {
    onReady?.({ conversationId: prepared.conversation.id, title: prepared.conversation.title, userMessageId: prepared.userMessage.id, assistantMessageId: prepared.assistantMessage.id, sources: prepared.sources, documentIds: input.documentIds ?? [] });
    const result = await generateStreamingCompletion(prepared.modelMessages, onToken, signal);
    await applyResult(prepared.assistantMessage, result, { sources: prepared.sources, documentIds: input.documentIds ?? [] });
    await ConversationModel.updateOne({ _id: prepared.conversation._id }, { $inc: { messageCount: 1 }, $set: { lastMessageAt: new Date() } });
    await persistAttempts(result.attempts, { userId: input.userId, conversationId: prepared.conversation.id, messageId: prepared.assistantMessage.id }, result.fallbackUsed);
    return {
      conversation: { id: prepared.conversation.id, title: (await ConversationModel.findById(prepared.conversation._id).select('title').lean())?.title ?? prepared.conversation.title },
      userMessageId: prepared.userMessage.id,
      assistantMessageId: prepared.assistantMessage.id,
      provider: result.provider,
      model: result.model,
      tokenUsage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens, totalTokens: result.totalTokens, estimated: result.estimatedTokens },
      latencyMs: result.latencyMs,
      fallbackUsed: result.fallbackUsed,
      sources: prepared.sources,
      documentIds: input.documentIds ?? [],
    };
  } catch (error) {
    const attempts = error instanceof LlmServiceError ? error.attempts : [];
    const errorCode = error instanceof LlmServiceError ? error.code : 'CHAT_GENERATION_FAILED';
    if (error instanceof LlmServiceError && error.partialContent) prepared.assistantMessage.content = error.partialContent;
    prepared.assistantMessage.status = 'failed';
    prepared.assistantMessage.errorCode = errorCode;
    prepared.assistantMessage.latencyMs = Date.now() - startedAt;
    await prepared.assistantMessage.save();
    await persistAttempts(attempts, { userId: input.userId, conversationId: prepared.conversation.id }, false);
    if (error instanceof LlmServiceError) throw new AppError(503, 'AI_PROVIDER_UNAVAILABLE', error.message);
    throw error;
  }
}
