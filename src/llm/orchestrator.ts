import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { createProviderClient, getConfiguredProviders } from './providerRegistry';
import { LlmServiceError, type ChatMessage, type LlmResult, type ProviderAttempt, type ProviderName } from './types';

function apiStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof (error as { status?: unknown }).status === 'number') {
    return (error as { status: number }).status;
  }
  return undefined;
}

export function getProviderErrorCode(error: unknown): string {
  const status = apiStatus(error);
  if (status === 401 || status === 403) return 'PROVIDER_AUTH_ERROR';
  if (status === 408 || status === 504) return 'PROVIDER_TIMEOUT';
  if (status === 429) return 'PROVIDER_RATE_LIMITED';
  if (status === 404) return 'PROVIDER_MODEL_NOT_FOUND';
  if (status === 400) return 'PROVIDER_BAD_REQUEST';
  if (status && status >= 500) return 'PROVIDER_SERVER_ERROR';
  if (error instanceof Error && /timeout|timed out|aborted/i.test(error.message)) return 'PROVIDER_TIMEOUT';
  return 'PROVIDER_CONNECTION_ERROR';
}

export function shouldFallback(error: unknown): boolean {
  const status = apiStatus(error);
  if (status === 400) return false; // Usually indicates a request/schema issue, not provider capacity.
  if (status === 401 || status === 403 || status === 404 || status === 408 || status === 409 || status === 429) return true;
  if (status && status >= 500) return true;
  return status === undefined; // Network/DNS/timeout errors also qualify.
}

function approxTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / 4));
}

function tokenCount(messages: ChatMessage[]): number {
  return approxTokens(messages.map((message) => message.content).join('\n'));
}

const providerCooldowns = new Map<ProviderName, { until: number; reason: string }>();

function isCoolingDown(provider: ProviderName): boolean {
  const entry = providerCooldowns.get(provider);
  if (!entry) return false;
  if (entry.until <= Date.now()) {
    providerCooldowns.delete(provider);
    return false;
  }
  return true;
}

function markProviderFailure(provider: ProviderName, error: unknown): void {
  const status = apiStatus(error);
  if (status === 400) return;
  let cooldownMs = 0;
  let reason = getProviderErrorCode(error);
  if (status === 429) {
    const headers = typeof error === 'object' && error !== null && 'headers' in error
      ? (error as { headers?: { get?: (name: string) => string | null } }).headers
      : undefined;
    const retryAfter = headers?.get?.('retry-after');
    const retrySeconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
    const message = error instanceof Error ? error.message : '';
    const dailyQuota = /daily|per day|quota.*exhaust|tokens per day/i.test(message);
    cooldownMs = dailyQuota
      ? Math.max(Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : 0, 6 * 60 * 60 * 1000)
      : Number.isFinite(retrySeconds) && retrySeconds > 0
        ? Math.min(retrySeconds * 1000, 24 * 60 * 60 * 1000)
        : 60 * 1000;
    reason = 'RATE_LIMITED';
  } else if (status === 401 || status === 403 || status === 404) {
    cooldownMs = 5 * 60 * 1000;
  } else if ((status !== undefined && status >= 500) || status === 408 || (error instanceof Error && /timeout|timed out|network|fetch failed/i.test(error.message))) {
    cooldownMs = 30 * 1000;
  }
  if (cooldownMs > 0) providerCooldowns.set(provider, { until: Date.now() + cooldownMs, reason });
}

function clearProviderFailure(provider: ProviderName): void {
  providerCooldowns.delete(provider);
}

function chatParams(messages: ChatMessage[], model: string) {
  // Groq documents max_completion_tokens as the current parameter; max_tokens is deprecated.
  // GPT-OSS is a reasoning model, so a low reasoning effort keeps interactive streaming
  // responsive. Hide internal reasoning and send only the user-facing answer downstream.
  const params = {
    model,
    messages: messages.map((message) => ({ role: message.role, content: message.content })) as ChatCompletionMessageParam[],
    max_completion_tokens: env.LLM_MAX_OUTPUT_TOKENS,
    temperature: env.LLM_TEMPERATURE,
  };
  if (/^openai\/gpt-oss-(?:20b|120b)$/i.test(model)) {
    return { ...params, reasoning_effort: 'low', reasoning_format: 'hidden' };
  }
  return params;
}

export async function generateCompletion(messages: ChatMessage[], signal?: AbortSignal): Promise<LlmResult> {
  const configuredProviders = getConfiguredProviders();
  if (!configuredProviders.length) throw new LlmServiceError('No configured LLM provider is available.', [], 'NO_CONFIGURED_PROVIDERS');
  const providers = configuredProviders.filter((provider) => !isCoolingDown(provider.name));
  if (!providers.length) {
    throw new LlmServiceError('All configured AI providers are temporarily cooling down. Please try again shortly.', [], 'ALL_PROVIDERS_COOLING_DOWN');
  }

  const attempts: ProviderAttempt[] = [];
  for (const provider of providers) {
    const startedAt = Date.now();
    const client = createProviderClient(provider);
    try {
      const response = await client.chat.completions.create(chatParams(messages, provider.model), { signal });
      const latencyMs = Date.now() - startedAt;
      const content = response.choices[0]?.message?.content;
      const text = typeof content === 'string' ? content : '';
      const promptTokens = response.usage?.prompt_tokens ?? tokenCount(messages);
      const completionTokens = response.usage?.completion_tokens ?? approxTokens(text);
      const estimatedTokens = !response.usage;
      clearProviderFailure(provider.name);
      attempts.push({
        provider: provider.name,
        model: provider.model,
        status: 'success',
        latencyMs,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedTokens,
      });
      if (provider.name !== env.LLM_PROVIDER) logger.info({ provider: provider.name, attempts: attempts.length }, 'LLM fallback succeeded');
      return {
        provider: provider.name,
        model: provider.model,
        content: text,
        promptTokens,
        completionTokens,
        totalTokens: response.usage?.total_tokens ?? promptTokens + completionTokens,
        estimatedTokens,
        latencyMs,
        fallbackUsed: provider.name !== env.LLM_PROVIDER,
        attempts,
      };
    } catch (error) {
      const code = getProviderErrorCode(error);
      if (!signal?.aborted) markProviderFailure(provider.name, error);
      attempts.push({ provider: provider.name, model: provider.model, status: 'error', errorCode: code, latencyMs: Date.now() - startedAt });
      logger.warn({ provider: provider.name, model: provider.model, code, status: apiStatus(error), message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) }, 'LLM provider attempt failed');
      if (signal?.aborted || !shouldFallback(error)) break;
    }
  }

  const finalCode = attempts.at(-1)?.errorCode ?? 'ALL_PROVIDERS_FAILED';
  logger.error({ attempts: attempts.map(({ provider, status, errorCode }) => ({ provider, status, errorCode })) }, 'All configured LLM providers failed');
  throw new LlmServiceError('The AI assistant is temporarily unavailable. Please try again shortly.', attempts, finalCode);
}

export async function generateStreamingCompletion(
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<LlmResult> {
  const configuredProviders = getConfiguredProviders();
  if (!configuredProviders.length) throw new LlmServiceError('No configured LLM provider is available.', [], 'NO_CONFIGURED_PROVIDERS');
  const providers = configuredProviders.filter((provider) => !isCoolingDown(provider.name));
  if (!providers.length) {
    throw new LlmServiceError('All configured AI providers are temporarily cooling down. Please try again shortly.', [], 'ALL_PROVIDERS_COOLING_DOWN');
  }

  const attempts: ProviderAttempt[] = [];
  for (const provider of providers) {
    const startedAt = Date.now();
    const client: OpenAI = createProviderClient(provider);
    let content = '';
    try {
      const stream = await client.chat.completions.create({ ...chatParams(messages, provider.model), stream: true }, { signal });
      for await (const chunk of stream) {
        const part = chunk.choices[0]?.delta?.content;
        if (typeof part === 'string' && part.length > 0) {
          content += part;
          onToken(part);
        }
      }
      const latencyMs = Date.now() - startedAt;
      clearProviderFailure(provider.name);
      const promptTokens = tokenCount(messages);
      const completionTokens = approxTokens(content);
      attempts.push({ provider: provider.name, model: provider.model, status: 'success', latencyMs, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, estimatedTokens: true });
      if (provider.name !== env.LLM_PROVIDER) logger.info({ provider: provider.name, attempts: attempts.length }, 'Streaming fallback succeeded');
      return {
        provider: provider.name,
        model: provider.model,
        content,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedTokens: true,
        latencyMs,
        fallbackUsed: provider.name !== env.LLM_PROVIDER,
        attempts,
      };
    } catch (error) {
      const code = getProviderErrorCode(error);
      if (!signal?.aborted) markProviderFailure(provider.name, error);
      attempts.push({ provider: provider.name, model: provider.model, status: 'error', errorCode: code, latencyMs: Date.now() - startedAt });
      logger.warn({ provider: provider.name, model: provider.model, code, status: apiStatus(error), message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500), hadPartialOutput: content.length > 0 }, 'Streaming LLM provider attempt failed');
      // Never restart after tokens were sent to the client: that would duplicate or contradict visible output.
      if (content.length > 0 || signal?.aborted || !shouldFallback(error)) {
        throw new LlmServiceError('The response was interrupted. Please retry your message.', attempts, code, content);
      }
    }
  }

  const finalCode = attempts.at(-1)?.errorCode ?? 'ALL_PROVIDERS_FAILED';
  throw new LlmServiceError('The AI assistant is temporarily unavailable. Please try again shortly.', attempts, finalCode);
}
