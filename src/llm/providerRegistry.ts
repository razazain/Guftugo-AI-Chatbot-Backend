import OpenAI from 'openai';
import { env } from '../config/env';
import type { ProviderName } from './types';

export interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  model: string;
  baseURL?: string;
}

const allProviderConfigs: Record<ProviderName, Omit<ProviderConfig, 'name'>> = {
  groq: { apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL, baseURL: 'https://api.groq.com/openai/v1' },
  gemini: { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
  openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
};

export function getProviderOrder(): ProviderName[] {
  return [...new Set<ProviderName>([env.LLM_PROVIDER, ...env.LLM_FALLBACK_PROVIDERS])];
}

export function getConfiguredProviders(): ProviderConfig[] {
  return getProviderOrder()
    .map((name) => ({ name, ...allProviderConfigs[name] }))
    .filter((provider) => provider.apiKey.trim().length > 0);
}

export function getPublicProviderConfiguration() {
  const configured = new Set(getConfiguredProviders().map((provider) => provider.name));
  return {
    primaryProvider: env.LLM_PROVIDER,
    webSearchEnabled: env.ENABLE_WEB_SEARCH && env.TAVILY_API_KEY.trim().length > 0,
    fallbackProviders: env.LLM_FALLBACK_PROVIDERS.filter((name) => name !== env.LLM_PROVIDER),
    configuredProviders: getProviderOrder().map((name) => ({
      name,
      configured: configured.has(name),
      primary: name === env.LLM_PROVIDER,
      model: allProviderConfigs[name].model,
    })),
  };
}

export function createProviderClient(provider: ProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: 0,
  });
}
