import { describe, expect, it } from 'vitest';
import { getProviderErrorCode, shouldFallback } from '../src/llm/orchestrator';

describe('LLM fallback policy', () => {
  it('falls back on rate limits', () => {
    expect(shouldFallback({ status: 429 })).toBe(true);
    expect(getProviderErrorCode({ status: 429 })).toBe('PROVIDER_RATE_LIMITED');
  });

  it('falls back on provider authentication, not-found, server and connection failures', () => {
    expect(shouldFallback({ status: 401 })).toBe(true);
    expect(shouldFallback({ status: 404 })).toBe(true);
    expect(shouldFallback({ status: 503 })).toBe(true);
    expect(shouldFallback(new Error('network timeout'))).toBe(true);
  });

  it('does not fall back on malformed requests', () => {
    expect(shouldFallback({ status: 400 })).toBe(false);
    expect(getProviderErrorCode({ status: 400 })).toBe('PROVIDER_BAD_REQUEST');
  });
});
