export type ProviderName = 'groq' | 'gemini' | 'openai';
export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string }

export interface ProviderAttempt {
  provider: ProviderName;
  model: string;
  status: 'success' | 'error';
  errorCode?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedTokens?: boolean;
}

export interface LlmResult {
  provider: ProviderName;
  model: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedTokens: boolean;
  latencyMs: number;
  fallbackUsed: boolean;
  attempts: ProviderAttempt[];
}

export class LlmServiceError extends Error {
  public readonly attempts: ProviderAttempt[];
  public readonly partialContent: string;
  public readonly code: string;

  constructor(message: string, attempts: ProviderAttempt[], code = 'ALL_PROVIDERS_FAILED', partialContent = '') {
    super(message);
    this.name = 'LlmServiceError';
    this.attempts = attempts;
    this.partialContent = partialContent;
    this.code = code;
  }
}
