# Guftugo AI Backend

A modular TypeScript/Node.js backend for Guftugo, a general-purpose AI assistant that should reply naturally in Roman Urdu when the user writes in Roman Urdu, while still answering general questions in English and other styles.

## Included in this MVP

- Express + TypeScript API.
- MongoDB Atlas persistence through Mongoose.
- Registration, password login, Firebase Google sign-in, access tokens, refresh-token rotation, logout, current-user profile, language preference.
- Chat history in separate `conversations` and `messages` collections.
- Provider-neutral LLM adapter using the OpenAI-compatible chat completions interface.
- Groq as primary by default; Gemini and OpenAI as optional providers.
- Automatic fallback on rate limits, temporary outages, timeouts, invalid credentials, and missing/unavailable models when the next provider is configured.
- In-process provider cooldowns after rate-limit/auth/server failures to reduce repeated calls to a failing provider.
- Standard and SSE-streaming chat endpoints.
- Per-user chat-history context, bounded by `LLM_MAX_CONTEXT_CHARS` and `LLM_MAX_HISTORY_MESSAGES`.
- Per-user usage summary and provider configuration endpoints.
- Authenticated document uploads for UTF-8 `.txt`, `.md`, `.csv`, and `.json` files plus text-based `.pdf` extraction, document management, and selected-document context in chat.
- Optional web search through Tavily, with returned sources passed to the LLM and returned to the client.
- API rate limits, Helmet security headers, CORS allowlist, Zod validation, password hashing, hashed refresh tokens, request logging with secret redaction.
- Postman collection, API guide, OpenAPI starter file, and unit tests for prompt/fallback rules.

## Document and web-search boundaries

- Document upload supports UTF-8 `.txt`, `.md`, `.csv`, `.json`, and text-based `.pdf` files. Uploads are limited to 5 MB, PDFs to 100 pages, and extracted text to 200,000 characters. Scanned/image-only PDFs are not supported because OCR is not enabled. Stored extracted text is kept in MongoDB Atlas and may be attached by document ID to chat requests. DOCX extraction is not supported.
- Web search is optional and disabled by default. It requires a Tavily API key, and the search query is sent to Tavily. Enable it with `ENABLE_WEB_SEARCH=true` and `TAVILY_API_KEY=...`. Results are passed as untrusted source snippets to the LLM and returned with source URLs.

## Requirements

- Node.js 22 or newer.
- MongoDB Atlas database and connection string.
- At least one LLM provider API key. Groq is primary by default.

## Setup on Windows

1. Extract the ZIP.
2. Open a terminal inside the `guftugo-backend` folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env` (PowerShell):

   ```powershell
   Copy-Item .env.example .env
   ```

   In CMD:

   ```bat
   copy .env.example .env
   ```

5. Edit `.env`:
   - Put your MongoDB Atlas connection string in `MONGODB_URI`.
   - Put your Groq key in `GROQ_API_KEY`.
   - Keep `LLM_PROVIDER=groq` to use Groq first.
   - Add `GEMINI_API_KEY` and/or `OPENAI_API_KEY` if you want those providers to act as fallbacks.
   - Replace both JWT secrets with independent random strings of at least 32 characters.
   - Set `CORS_ORIGINS` to the actual frontend origin(s).
6. Start development mode:

   ```bash
   npm run dev
   ```

7. Check health:

   ```text
   GET http://localhost:5000/api/v1/health
   ```

## MongoDB Atlas checklist

- Create a database user with a strong password.
- Add the server's IP to Atlas Network Access. For local development, add your current public IP; avoid `0.0.0.0/0` for production.
- Use a database-specific connection string and URL-encode reserved characters in the password.
- Keep the connection string only in `.env`; never send it to frontend code or commit it to Git.

## Firebase Google sign-in

The backend exposes `POST /api/v1/auth/google`. It verifies Firebase-issued Google ID tokens with Firebase Admin SDK, then creates/returns the regular Guftugo API session. To set up Google sign-in securely, follow [`FIREBASE_GOOGLE_SIGNIN_SETUP.md`](./FIREBASE_GOOGLE_SIGNIN_SETUP.md). The service-account private key belongs only in backend environment variables (Render), never in the frontend.

## LLM provider configuration

```env
LLM_PROVIDER=groq
LLM_FALLBACK_PROVIDERS=gemini,openai
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini

ENABLE_WEB_SEARCH=false
TAVILY_API_KEY=
```

Only the selected primary provider key is required at startup. A fallback provider is available only when its key is configured. Provider names supported by this version are `groq`, `gemini`, and `openai`. If you switch the `OPENAI_MODEL` default, check that the model supports the common Chat Completions parameters used by this backend.

### Fallback behaviour

1. Try the active `LLM_PROVIDER` first unless that provider is cooling down after a recent failure.
2. On a qualifying provider error, try the next configured provider(s) in `LLM_FALLBACK_PROVIDERS` order.
3. Use the first successful response and store which provider/model answered.
4. Do not retry a malformed request (HTTP 400) against every provider because it is usually a request issue.
5. During streaming, fallback is allowed only before any output is sent. If the provider fails after partial text has been delivered, the server ends that stream with an error rather than generating a second conflicting answer.

Cooldown state is in memory for each Node process. It reduces repeated calls to the same failing provider for a single instance but is not shared across multiple server instances. If Guftugo scales horizontally, move this state to Redis or another shared store.

### Model availability note

Provider model IDs and rate limits change. Verify the model configured in `.env` against the provider's current official model list. If a model ID is retired or unavailable, update its corresponding `*_MODEL` setting. The backend never guarantees free or unlimited provider usage.

## Commands

```bash
npm run dev       # Run with hot reload
npm run build     # Compile TypeScript to dist/
npm start         # Run compiled application
npm run db:indexes # Create declared indexes (after a build)
npm run db:indexes:dev # Create declared indexes directly from TypeScript
npm run typecheck # Type-check source
npm test          # Run unit tests
```

## API response format

Success responses use `{ "success": true, "data": ... }`.

Errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`.

Include access tokens in protected requests as:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

The API returns access and refresh tokens in JSON for this backend version. Keep them in the frontend's safest available storage and never log or expose them. For browser production apps, consider secure, HttpOnly cookies and CSRF protection as an alternative session strategy.

## Quick API walkthrough

1. `POST /api/v1/auth/register`
2. Use `data.accessToken` as a Bearer token.
3. `POST /api/v1/chat` with `{ "message": "Explain APIs in Roman Urdu" }`
4. `GET /api/v1/conversations` to list chat history.
5. `GET /api/v1/conversations/:id/messages` to reload a conversation.
6. `POST /api/v1/chat/stream` for Server-Sent Events.

See [`docs/API.md`](docs/API.md), [`docs/openapi.yaml`](docs/openapi.yaml), and [`postman/Guftugo.postman_collection.json`](postman/Guftugo.postman_collection.json).

## Important production checklist

- Use a paid/managed hosting plan with TLS and environment-variable management.
- Set exact production CORS origins.
- Configure MongoDB Atlas network access and backups.
- Run `npm run build` and then `npm run db:indexes` after deployment (and whenever you add indexes) because automatic index creation is disabled in production. For local development, use `npm run db:indexes:dev`.
- Set and rotate strong JWT secrets; do not reuse the sample strings.
- Add a shared rate-limit store before horizontal scaling.
- Review provider privacy policies, pricing, and free-tier limits before sending user data to any external provider.
- Add monitoring/alerts and test fallback with deliberately invalid sandbox keys before launch.
- Add email verification, password reset, account deletion/export, and a published privacy policy before opening public registration broadly.
- This is a feature-complete MVP foundation, not a substitute for a production security review or load test.

## Architecture outline

```text
src/
  config/       Environment, MongoDB, logger
  controllers/  HTTP handlers
  llm/          Provider registry, completion/streaming fallback
  middleware/   Authentication, rate limits, error responses
  models/       User, conversation, message, refresh token, usage, provider health
  routes/       Versioned route groups
  services/     Authentication and chat orchestration
  utils/        Shared errors, validation, pagination, and safe route-param helpers
```

## Groq streaming troubleshooting

- `LLM_PROVIDER=groq` and `GROQ_API_KEY` are sufficient to run with Groq alone. Gemini and OpenAI keys are optional; configured fallback entries without keys are ignored.
- The default upstream timeout is 120 seconds. If your existing `.env` already has `LLM_TIMEOUT_MS=45000`, update it to `LLM_TIMEOUT_MS=120000` because values in `.env` override application defaults.
- The backend sends SSE keep-alive comments while a response is being generated so idle periods are less likely to be closed by proxies.
- For `openai/gpt-oss-120b` and `openai/gpt-oss-20b`, the backend uses `max_completion_tokens`, low reasoning effort, and hidden reasoning output. These are intended to make user-facing streaming more responsive.
- If the UI still reports an interrupted response, inspect the backend console for `Streaming LLM provider attempt failed`. The log records the provider, model, HTTP status/error code, and a truncated provider error message without exposing the API key. Common causes include a revoked/invalid key, quota/rate limits, an unavailable model, and transient provider/network failures.
