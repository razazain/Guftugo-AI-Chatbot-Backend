# Guftugo API Guide

Base URL: `http://localhost:5000/api/v1`

Most endpoints return JSON using `{ "success": true, "data": ... }`. Protected routes require `Authorization: Bearer <accessToken>`.

## Health

### `GET /health`
Returns server and MongoDB connection status.

### `GET /health/ready`
Returns `200` when MongoDB is connected, otherwise `503`.

## Authentication

### `POST /auth/register`
Request:
```json
{
  "name": "Zain Raza",
  "email": "zain@example.com",
  "password": "use-a-strong-password",
  "preferredLanguage": "auto"
}
```
`preferredLanguage` is `auto`, `english`, or `roman-urdu` and is optional. Returns `user`, `accessToken`, and `refreshToken`.

### `POST /auth/login`
```json
{ "email": "zain@example.com", "password": "your-password" }
```
Returns user and token pair.

### `POST /auth/refresh`
```json
{ "refreshToken": "..." }
```
Revokes the old refresh token and rotates it. Save the new token pair returned by the endpoint.

### `POST /auth/logout` (protected)
```json
{ "refreshToken": "..." }
```
Revokes the supplied refresh token.

### `GET /auth/me` (protected)
Returns the current user profile.

### `PATCH /auth/me` (protected)
```json
{ "name": "Updated name", "preferredLanguage": "roman-urdu" }
```
Both fields are optional, but at least one must be supplied.

### `PATCH /auth/me/language` (protected)
```json
{ "preferredLanguage": "auto" }
```

## Chat

### `POST /chat` (protected)
Normal, non-streaming response. Sends one user message and saves both user and assistant messages. Omit `conversationId` to create a new conversation automatically.

```json
{
  "message": "Mujhy Node.js aur Express ka difference Roman Urdu mein samjhao",
  "conversationId": "optional-existing-conversation-id",
  "language": "auto",
  "documentIds": ["optional-document-id"],
  "webSearch": false
}
```

`language` is optional and may be `auto`, `english`, or `roman-urdu`. If omitted, the backend uses a conversation preference or the user's saved preference. `auto` mirrors the user's language/style; it does not force every user into Urdu. `documentIds` is an optional array of up to five IDs returned by `/documents`; the current user must own every attached file. `webSearch: true` runs an optional Tavily search and returns source metadata with the assistant response. It returns a configuration error if search is disabled or the key is missing.

Response data includes `conversation`, `userMessage`, and `assistantMessage`. Assistant metadata contains provider/model, token usage, latency, and whether fallback was used. The API keys are never returned.

### `POST /chat/stream` (protected)
Uses the same JSON body. Response content type is `text/event-stream` (SSE). Events:

- `start`: generation started.
- `meta`: conversation/message IDs, emitted before tokens.
- `token`: `{ "token": "text chunk" }`.
- `done`: final provider/model and usage metadata.
- `error`: safe error code and message.

If no output has been sent yet, the backend may try a fallback provider. Once output chunks have been delivered, it does not restart the answer with a different provider.

### Prompt language rules

- English user message → normally English response.
- Roman Urdu user message → normally Roman Urdu response using Latin letters.
- Language preference can override the automatic behaviour.
- Guftugo remains general purpose: coding, writing, education, knowledge, business, and everyday help.

## Conversations

### `POST /conversations` (protected)
Creates an empty conversation. Body is optional:
```json
{ "title": "Project planning", "language": "auto" }
```

### `GET /conversations?page=1&limit=20` (protected)
Lists only the signed-in user's conversations. `limit` is 1–100.

### `GET /conversations/:id/messages?limit=50&before=<messageId>` (protected)
Returns the conversation and a page of messages. The `before` cursor is optional; use `pagination.nextCursor` to fetch older messages when `hasMore` is true. Messages are returned in chronological order within the page.

### `PATCH /conversations/:id` (protected)
```json
{ "title": "A new title" }
```

### `DELETE /conversations/:id` (protected)
Deletes the conversation and its messages.

## Documents

Uploads are authenticated and stored as extracted text in MongoDB Atlas. Supported types are UTF-8 `.txt`, `.md`, `.csv`, `.json`, and text-based `.pdf`. Maximum file size is 5 MB, PDF page count is limited to 100, and extracted text is limited to 200,000 characters. Scanned/image-only PDFs (OCR) and DOCX are not supported.

### `POST /documents` (protected)
`multipart/form-data` with a field named `file`. Example using curl:

```bash
curl -X POST http://localhost:5000/api/v1/documents \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@notes.md"
```

### `GET /documents?page=1&limit=20` (protected)
Lists the signed-in user's documents without returning the stored text content.

### `GET /documents/:id?includeContent=true` (protected)
Returns metadata; include `includeContent=true` to also return extracted text. The user must own the document.

### `DELETE /documents/:id` (protected)
Deletes the uploaded document from MongoDB. This does not rewrite old chat messages that may have referenced its ID.

## Web search

Web search is optional and disabled by default. Configure `ENABLE_WEB_SEARCH=true` and `TAVILY_API_KEY` in `.env`. Then add `"webSearch": true` to `POST /chat` or `POST /chat/stream`. The backend searches the user's query through Tavily, injects up to five source snippets into the prompt, and returns source titles/URLs in the response. Search results are treated as untrusted data.

## Usage and providers

### `GET /usage/summary?days=7` (protected)
Returns the current user's logged request attempts, tokens, average latency, provider breakdown, and daily activity. The `days` parameter accepts 1–90. Streaming token counts are estimates because provider stream responses do not always include usage data.

### `GET /usage/providers` (protected)
Returns configured provider names, model names, which provider is primary, and whether a provider key is configured. It does not return actual API keys.

## Error codes

Typical codes include `VALIDATION_ERROR`, `AUTH_REQUIRED`, `INVALID_ACCESS_TOKEN`, `INVALID_CREDENTIALS`, `EMAIL_ALREADY_REGISTERED`, `RATE_LIMITED`, `CHAT_RATE_LIMITED`, `CONVERSATION_NOT_FOUND`, `AI_PROVIDER_UNAVAILABLE`, and `INTERNAL_SERVER_ERROR`.

Do not parse raw error messages for control flow in the frontend; use `error.code`.

## Limits and behaviour

- Chat input limit: 15,000 characters.
- Context history is bounded by `LLM_MAX_HISTORY_MESSAGES` and `LLM_MAX_CONTEXT_CHARS`.
- API rate limits are configured in `.env`.
- In-memory cooldown and rate-limit state is not shared across multiple server instances.
- MongoDB stores user and assistant messages separately so a conversation does not grow as one large MongoDB document.
