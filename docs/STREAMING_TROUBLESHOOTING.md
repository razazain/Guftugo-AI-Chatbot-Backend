# Groq streaming troubleshooting

## Required configuration when using Groq only

```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_actual_groq_key
GROQ_MODEL=openai/gpt-oss-120b
LLM_TIMEOUT_MS=120000
```

`GEMINI_API_KEY` and `OPENAI_API_KEY` are optional. Providers listed in `LLM_FALLBACK_PROVIDERS` are only used when their API keys are configured.

## Changes in this fix

- Use Groq's current `max_completion_tokens` parameter instead of deprecated `max_tokens`.
- For GPT-OSS models, use `reasoning_effort=low` and `reasoning_format=hidden` to reduce unnecessary internal reasoning in user-facing streaming.
- Raise the default upstream timeout from 45 to 120 seconds.
- Send SSE keep-alive comments every 15 seconds so intermediate idle periods are less likely to be closed by hosting proxies.
- Log provider status/code/message for failed streaming attempts (keys are not logged).

## If the stream still fails

Read the backend terminal logs for `Streaming LLM provider attempt failed`. The message and HTTP status help distinguish invalid credentials (401), permissions/model availability (403/404), request parameter errors (400), rate limits/quota (429), server errors (5xx), and network/timeout failures. Never paste the actual API key into a bug report.

## `Message validation failed: content: Path \`content\` is required.`

This error happens before the LLM provider is called when the backend creates an empty assistant message with `status: "pending"`. Empty content is expected during streaming. The Message schema therefore requires content for user messages and completed assistant messages, while allowing empty content for pending or failed assistant messages. The regression test is `tests/messageValidation.test.ts`. No Gemini or OpenAI key is required for this fix; an unset fallback key is skipped by provider selection.
