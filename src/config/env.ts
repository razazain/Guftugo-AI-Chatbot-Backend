import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  LLM_PROVIDER: z.enum(['groq', 'gemini', 'openai']).default('groq'),
  LLM_FALLBACK_PROVIDERS: z.string().default('gemini,openai'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(180000).default(120000),
  LLM_MAX_HISTORY_MESSAGES: z.coerce.number().int().min(2).max(100).default(30),
  LLM_MAX_CONTEXT_CHARS: z.coerce.number().int().min(5000).max(100000).default(20000),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(8192).default(2048),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  ENABLE_WEB_SEARCH: z.string().default('false').transform((value) => value.toLowerCase() === 'true'),
  TAVILY_API_KEY: z.string().optional().default(''),
  GROQ_API_KEY: z.string().optional().default(''),
  GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().min(1).default('gpt-4.1-mini'),
  GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  CHAT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  MAX_JSON_BODY_SIZE: z.string().default('1mb'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Print configuration names, never values that could contain secrets.
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

const value = parsed.data;
const keys: Record<string, string> = {
  groq: value.GROQ_API_KEY,
  gemini: value.GEMINI_API_KEY,
  openai: value.OPENAI_API_KEY,
};
if (!keys[value.LLM_PROVIDER]?.trim()) {
  throw new Error(`LLM_PROVIDER is "${value.LLM_PROVIDER}" but its API key is missing.`);
}
const fallbackNames = value.LLM_FALLBACK_PROVIDERS.split(',').map((provider) => provider.trim().toLowerCase()).filter(Boolean);
const invalidFallbacks = fallbackNames.filter((provider) => !['groq', 'gemini', 'openai'].includes(provider));
if (invalidFallbacks.length) throw new Error(`Unsupported LLM_FALLBACK_PROVIDERS value(s): ${invalidFallbacks.join(', ')}.`);
if (value.ENABLE_WEB_SEARCH && !value.TAVILY_API_KEY.trim()) {
  throw new Error('ENABLE_WEB_SEARCH is true but TAVILY_API_KEY is missing.');
}

export const env = {
  ...value,
  CORS_ORIGINS: value.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  LLM_FALLBACK_PROVIDERS: fallbackNames.filter((provider): provider is 'groq' | 'gemini' | 'openai' => ['groq', 'gemini', 'openai'].includes(provider)),
};
