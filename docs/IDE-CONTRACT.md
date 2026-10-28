# IDE API contract (`/ide/v1`, `ide_api` = 1)

Single source of truth shared by the gateway (`AssistantCabinetServer`, Lots 15 to 19) and the VS Code extension (`AssistantCabinetVSCode`, Lots X0 to X4). The server's Lot 15 commits this file as `docs/IDE-CONTRACT.md`; the extension repository vendors a copy as `docs/IDE-CONTRACT.md` and a test compares the two when both are present. English, like the whole repository.

This surface is **additive**. It does not change `docs/CONTRACT.md`: every route, field, status and error code the desktop app relies on keeps its current behaviour.

The surface grows lot by lot. Each section says which lot delivers it; a server that has not got a feature says so in `features` (section 2) and the extension must tolerate that. `ide_api` stays `1` for every additive change; it changes only for a break.

## 1. Availability

- Controlled by `IDE_ENABLED` (`off` by default). The routes are **mounted only when it is `on`**. When it is `off` the application is the same object graph as today: a request to `/ide/...` gets exactly the answer any unknown path gets (the framework's own `404`, `{"detail":"Not Found"}`), not a custom error. The extension reads that `404` as "the editor surface is not enabled on this server".
- Same transport and protection as `/v1`: the gateway's address and port, HTTP or HTTPS (`TLS_MODE`), `Authorization: Bearer <key>` when `AUTH_MODE=required`, the rate limit, the security and no-store headers, no CORS.
- `GET /health` is unchanged (liveness, answers without a key); the extension may call it first and learns nothing IDE-specific from it.
- The server never fetches a URL on a client's behalf and never stores what it receives: code, messages, tool definitions, tool arguments, tool results, images and files exist in memory for the duration of the request only.

## 2. `GET /ide/v1/models` (Lot 15)

Every **chat alias** the gateway serves (`MODEL_ALIASES` minus the embedding alias; `:cloud` models refused as everywhere), including the aliases of `IDE_ONLY_ALIASES`. Aliases only: no runtime weight name, digest or size ever appears.

```json
{
  "object": "list",
  "ide_api": 1,
  "features": { "agents": false, "document_analysis": false, "image_description": false },
  "data": [
    {
      "id": "cabinet-code",
      "object": "model",
      "created": 1761500000,
      "owned_by": "assistant-cabinet",
      "context_window": 131072,
      "max_output_tokens": 16384,
      "capabilities": { "tools": true, "vision": false }
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `ide_api` | Integer version. The extension refuses any other value than the one it knows. |
| `features.agents` | `true` from Lot 16 when `GET /ide/v1/agents` is available. |
| `features.document_analysis` | `true` from Lot 17 when `IDE_DOCUMENT_ANALYSIS=on` and `POST /ide/v1/files/analyze` is mounted. |
| `features.image_description` | `true` from Lot 17 when `IDE_VISION_ALIAS` names a vision-capable alias (so the analysis route can describe images and scanned pages) **and `features.document_analysis` is also `true`**: the flag says what the route can do, so it is `false` while the route is not mounted. Asked again at each call of this route: the runtime must report `vision` for the weight now. |
| `data[].id` | The alias, sorted ascending. |
| `data[].context_window` | Tokens one request may hold (prompt + answer): `min(configured window, the model's own maximum)` (`effective_context_window`). The gateway sends exactly this value to the runtime as `num_ctx` on every request and **never varies it for an alias**, because a runtime reloads a model whose context size changes between requests. |
| `data[].max_output_tokens` | `min(IDE_MAX_OUTPUT_TOKENS, context_window // 2)`. |
| `data[].capabilities.tools` | `true` when the runtime reports the `tools` capability for the weight behind the alias (model metadata, cached per model); `false` when it does not, or cannot say. Never an error. |
| `data[].capabilities.vision` | `true` when the runtime reports the `vision` capability for the weight; `false` otherwise. |

Errors: the usual envelope (`unauthorized` 401, `rate_limited` 429). If the runtime is down the list is still returned (aliases come from configuration) with `tools: false`, `vision: false` and the configured window.

## 3. `POST /ide/v1/chat/completions` (Lot 15)

OpenAI Chat Completions shape, with tool calling and images. **No system prompt is added, no output-language directive, no `output_locale`**: the client's messages are the whole conversation. Unknown request fields are ignored.

### Request

| Field | Accepted | Notes |
| --- | --- | --- |
| `model` | string | An alias. Absent means `DEFAULT_MODEL_ALIAS`. Unknown alias: `model_alias_not_allowed` 400. Embedding alias: refused the same way. |
| `messages` | non-empty list | Roles `system`, `user`, `assistant`, `tool`. |
| `messages[].content` | string, `null`, or list of parts | `null` is allowed for an assistant message that only carries `tool_calls`. Parts: `{"type":"text","text":...}` and `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`. Any other part type is `invalid_request` 422 (field name only). |
| image parts | `user` messages only | Only `data:` URLs with media type `image/png`, `image/jpeg`, `image/webp` or `image/gif` and valid base64. **An `http(s)` URL is refused** (`invalid_request` 422): the server fetches nothing. Limits: `IDE_MAX_IMAGES_PER_REQUEST`, `IDE_MAX_IMAGE_BYTES` per image (`payload_too_large` 413). An image sent to a model whose `capabilities.vision` is false is `provider_capability_unsupported` 400 (with `data.capability: "vision"`). A client that has an image to return from a tool puts it in a following `user` message, as OpenAI requires. |
| `messages[].tool_calls` | assistant messages | `[{"id","type":"function","function":{"name","arguments":"<JSON string>"}}]`. |
| `messages[].tool_call_id` | `tool` messages | The id of the call this message answers. |
| `tools` | list | `[{"type":"function","function":{"name","description"?,"parameters"?}}]`. An empty list means no tools. A missing `parameters` is read as `{"type":"object","properties":{}}`. Tool names: `^[A-Za-z0-9_.:/-]{1,128}$`. |
| `tool_choice` | `"auto"`, `"none"`, `"required"`, `{"type":"function",...}` | `"none"` drops the tools from the request. The other values are **accepted and ignored**: the runtime cannot force a call. Documented limit. |
| `stream` | bool | Default `false`. |
| `stream_options.include_usage` | bool | Streaming only. |
| `temperature`, `top_p`, `stop` (string or list), `seed` | optional | Passed to the runtime as options. |
| `max_tokens`, `max_completion_tokens` | optional | A ceiling, clamped: `min(requested or ceiling, IDE_MAX_OUTPUT_TOKENS, max_output_tokens)`. Out of range (`<1`, `-1`, too large) is read as "not asked". The VS Code extension sends none. |
| `n` | `1` or absent | Other values: `invalid_request` 422 with field `n`. |
| anything else | ignored | `parallel_tool_calls`, `response_format`, penalties, `user`, ... |

Limits (on top of the existing ones, only for `/ide/`): body at most `IDE_MAX_REQUEST_BODY_BYTES`; the characters of all text contents plus the JSON of `tools` at most `IDE_MAX_CONTEXT_CHARS` (`context_too_large` 413 with `chars` and `limit`); a request whose text characters divided by 2 already exceed the alias's `context_window` is refused `context_too_large` 413 with `estimated_tokens` and `context_window` (a certain overflow only: the runtime would silently cut the oldest messages otherwise). Passing the guard does not guarantee fit: the client budgets with the `context_window` it was given and reads `usage.prompt_tokens` back.

Concurrency: a gate separate from the desktop's (`IDE_MAX_CONCURRENT_GENERATIONS`, default 1), with the existing queue size and wait (`MAX_QUEUED_GENERATIONS`, `QUEUE_WAIT_SECONDS`); beyond that `server_busy` 503. IDE traffic can never take a desktop slot, and the reverse. The time the runtime may take (prompt evaluation of a very long context included) is `IDE_REQUEST_TIMEOUT_SECONDS` (default 900), not the desktop's `LLM_REQUEST_TIMEOUT_SECONDS`.

### Response, `stream: false`

```json
{
  "id": "chatcmpl-<hex>",
  "object": "chat.completion",
  "created": 1761500000,
  "model": "cabinet-code",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{"id": "call_<hex>", "type": "function",
                      "function": {"name": "read_file", "arguments": "{\"path\":\"a.py\"}"}}]
    },
    "finish_reason": "tool_calls"
  }],
  "usage": {"prompt_tokens": 812, "completion_tokens": 24, "total_tokens": 836}
}
```

- `content` is the text, or `null` when there is only `tool_calls`. `tool_calls` is absent when there are none.
- `finish_reason`: `"tool_calls"` when at least one call was returned; `"length"` when the runtime stopped on the output ceiling; otherwise `"stop"`.
- `arguments` is always a JSON **string** (the runtime's object, serialised, non-ASCII kept). `id` is `call_` + 24 hex digits, generated by the gateway when the runtime gives none.
- No text **and** no tool call is `empty_answer` 502 (existing code). Only tool calls is a success. The weight name never appears: `model` is the alias.

### Response, `stream: true` (`text/event-stream`)

`data: {json}\n\n` lines ending with `data: [DONE]\n\n`, in this order:

1. `{"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}`
2. zero or more text chunks `delta: {"content": "..."}`;
3. for each tool call, **one** chunk carrying the whole call: `delta: {"tool_calls":[{"index":0,"id":"call_...","type":"function","function":{"name":"...","arguments":"{...}"}}]}` (`index` increments per call; the runtime delivers calls complete, so they are never split; a client must still accept split calls, accumulating by `index`);
4. one chunk with an empty `delta` and the `finish_reason`;
5. only if `stream_options.include_usage` is true: one chunk with `"choices": []` and `"usage": {...}`;
6. `data: [DONE]`.

The status code and headers are sent after the first chunk of the runtime is received (an unreachable runtime is an HTTP error with a code, not a broken stream), exactly as the desktop route does. A long prompt therefore delays the headers: clients use a generous first-byte timeout (the extension's default is 900 seconds). An error after the stream started is one `data: {"error": {"code","message","data"}}` event followed by `data: [DONE]`.

### Errors

The usual envelope `{"error":{"code","message","data"}}`. Codes used: `invalid_request` (422, field names only), `model_alias_not_allowed` 400, `model_not_permitted` 400, `context_too_large` 413, `payload_too_large` 413, `provider_capability_unsupported` 400, `provider_unreachable` 503, `provider_error` 502/504, `empty_answer` 502, `server_busy` 503, `rate_limited` 429, `unauthorized` 401. **No new error code is added anywhere in this contract.** No error, log line or register entry contains message text, tool names with arguments, tool results, tool definitions, image bytes or file content.

## 4. `GET /ide/v1/agents` (Lot 16)

The catalogue of **agent profiles** the administrator publishes for code work: a role, its instructions, the tools it may use and, optionally, the model alias it prefers. The gateway only serves the file; it applies nothing itself.

Source: `ide-agents.json` in the `config` folder (next to `server.env`; an administrator edits it with Notepad; read at each request when its modification time changes, so no restart is needed). A missing file is an empty catalogue. A malformed file is an empty catalogue plus one log metadata line (`ide_agents_unusable`), never an error to the client.

```json
{
  "object": "list",
  "ide_api": 1,
  "data": [
    {
      "id": "reviewer",
      "name": "Reviewer",
      "description": "Reviews a change and reports problems without editing files",
      "model": "cabinet-code",
      "tools": ["read", "search"],
      "instructions": "Review the change. Do not edit files. ...",
      "user_invocable": true
    }
  ]
}
```

| Field | Rules |
| --- | --- |
| `id` | `^[a-z0-9][a-z0-9-]{0,47}$`, unique. |
| `name`, `description` | Non-empty strings, at most 80 and 300 characters. |
| `model` | `null`, or an alias that is in the IDE alias set; otherwise the entry is dropped (and counted in the log metadata). |
| `tools` | List of at most 64 strings `^[A-Za-z0-9_.:/*-]{1,128}$`. The names are the editor's, opaque to the server. |
| `instructions` | Markdown text, at most 20 000 characters. |
| `user_invocable` | Boolean, default `true`. |

The file is **data written by the administrator**, not a constant of the product: the server ships no agent text. A file entry that does not validate is dropped; the others are served.

## 5. `POST /ide/v1/files/analyze` (Lot 17, only when `IDE_DOCUMENT_ANALYSIS=on`)

Turns a document or an image that lives on the developer's machine into text the model can use. The extension reads the file locally (the server cannot) and sends the bytes; the server returns text and keeps nothing.

```json
{ "filename": "report.pdf", "media_type": "application/pdf",
  "content_base64": "<base64>", "mode": "extract", "question": null }
```

```json
{ "object": "file_analysis", "filename": "report.pdf", "media_type": "application/pdf",
  "pages": 12, "text": "...", "truncated": false,
  "images": [ { "index": 0, "page": 3, "description": "..." } ],
  "warnings": [ "scanned_pages_described:4" ] }
```

| Input | Rules |
| --- | --- |
| `media_type` | `application/pdf`; the OOXML types for `.docx`, `.xlsx`, `.pptx`; `text/plain`, `text/markdown`, `text/csv`, `application/json`; `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Anything else: `provider_capability_unsupported` 400 with `data.media_type`. The server trusts neither the file name nor the declared type: it checks the content's signature and refuses a mismatch (`invalid_request` 422, field `media_type`). |
| `mode` | `"extract"` (text, tables as Markdown, notes) or `"describe"` (images and scanned pages through `IDE_VISION_ALIAS`; with `question`, the description answers it). `"describe"` without a vision alias: `provider_capability_unsupported` 400 with `data.capability: "vision"`. |
| limits | `IDE_MAX_FILE_BYTES`, `IDE_MAX_FILE_PAGES`, `IDE_MAX_ANALYSIS_CHARS` (text beyond it is cut, `truncated: true`); `payload_too_large` 413. |
| safety | Parsed in a **separate worker process** with a time and memory limit; macros, external links, embedded objects and scripts are neither run nor followed; zip-based formats are checked for size and ratio before reading. A worker that fails or times out is `provider_error` 502 with `data.reason: "analysis_failed"`; the gateway keeps running. The file is never written to disk by the gateway. |
| `warnings` | Machine codes with an optional `:count`, never prose. |

Counts toward the IDE gate and rate limit like a chat request.

### Clarifications (Lot 17b, D-055)

These fix what the text above leaves open. Nothing here adds an error code.

- **Request.** `filename` is optional, is echoed in the answer (`null` when absent) and is never read, logged or recorded. `question` is optional, at most 2000 characters, and is used only by `"describe"`. `mode` is `"extract"` by default. Unknown fields are ignored. A malformed request is `invalid_request` 422 with the field names (`body.mode`, `body.question`, `body.media_type`, `content_base64`).
- **`pages`** is the page count of a PDF, the sheet count of a workbook, the slide count of a presentation, `1` for an image, and **`null` for a Word file and a text file** (no page count exists without laying the text out). A client must accept `null`.
- **`mode: "extract"`**: the text of every format. An image gives `text: ""`, `images: []` and the warning `image_not_described` (describing is `"describe"`'s job). The scanned pages of a PDF (fewer than ten visible characters) are only listed, in the warning `scanned_pages:N`.
- **`mode: "describe"`** needs `IDE_VISION_ALIAS` to name an alias of the editor whose weight reports `vision`; otherwise `provider_capability_unsupported` 400 with `data.capability: "vision"` (checked before the file is read). Per format:
  - an image: one description, which is both `text` and the single entry of `images` (`{"index": 0, "page": 1, "description": "..."}`); a failure of the model is the model's error (`provider_unreachable`, `empty_answer`, ...), because there is no text to keep; an image over `IDE_MAX_IMAGE_BYTES` is `payload_too_large` 413 with `data.limit`;
  - a PDF: the pages that have text are read as in `"extract"`, and up to `min(8, IDE_MAX_IMAGES_PER_REQUEST)` scanned pages are drawn and described, one model call per page; each description is written in `text` under its `--- Page N ---` line, after the line `[Image description]`, and is an entry of `images` (`index` counts from 0, `page` is the PDF page); a model failure on a page leaves the page as it was and is counted; a runtime that is unreachable or times out is asked once, not once per page;
  - any other supported format (Word, Excel, PowerPoint, text): `invalid_request` 422, field `mode`.
- **Warning codes**, each `code` or `code:N`: `pages_truncated:N` (pages beyond `IDE_MAX_FILE_PAGES` or slides, left out; `truncated` is `true`), `sheets_truncated:N`, `sheet_truncated`, `decoded_as_cp1252`, `scanned_pages:N`, `scanned_pages_described:N`, `scanned_pages_skipped:N` (scanned pages beyond the ceiling above), `description_failed:N` (pages whose description failed or was empty), `image_not_described`. Text longer than `IDE_MAX_ANALYSIS_CHARS` (descriptions included) is cut and `truncated` is `true`.
- **Which refusal gives which error.** The declared `media_type` is not one of the twelve: `provider_capability_unsupported` 400, `data.media_type`. An old Office file (`.doc`, `.xls`, `.ppt`) under any declared type: the same. The content contradicts the declared type, or a text type holds binary data: `invalid_request` 422, field `media_type`. Bad base64, an empty file, a damaged, encrypted, protected or booby-trapped file: `invalid_request` 422, field `content_base64`. Larger than `IDE_MAX_FILE_BYTES`: `payload_too_large` 413, `data.limit`. A worker that fails, is killed or times out: `provider_error` 502, `data.reason: "analysis_failed"`. A full editor gate: `server_busy` 503.
- **One slot of the editor gate** is held for the whole request, the reading and every description included.

## 6. What the surface deliberately does not do

Fetch URLs; store anything; expose the runtime's own hidden reasoning; the Ollama native API (`/api/*`); embeddings (the desktop `/v1/embeddings` stays the only route); inline (fill-in-the-middle) completion; force a tool call; read, create or write files on a client machine (that is done by the editor and the extension, with the user's approval). Adding any of these later is a new, additive version of this file.

## 7. Settings

All optional, documented in `docs/CONFIGURATION.md` and `docs/USER-GUIDE.md`, edited with `cabinet-server config set KEY=VALUE` (Lot 11) or Notepad, applied by `cabinet-server restart`.

| Setting | Default | Lot | Meaning |
| --- | --- | --- | --- |
| `IDE_ENABLED` | `off` | 15 | `on` mounts the `/ide/v1` routes. |
| `IDE_ONLY_ALIASES` | empty | 15 | Chat aliases **hidden from the desktop** (not in `GET /health` `aliases` / `context_windows` and not in `GET /v1/models`), still served on `/ide`. Empty hides nothing. Must be chat aliases of `MODEL_ALIASES` and must not contain `DEFAULT_MODEL_ALIAS` (`config check`). |
| `IDE_MAX_OUTPUT_TOKENS` | `16384` | 15 | Ceiling of one IDE answer. |
| `IDE_MAX_CONTEXT_CHARS` | `1500000` | 15 | Ceiling of the text characters of one IDE request (messages + tools). |
| `IDE_MAX_REQUEST_BODY_BYTES` | `33554432` | 15 | Body ceiling for paths under `/ide/` (elsewhere `MAX_REQUEST_BODY_BYTES` is unchanged). |
| `IDE_MAX_IMAGES_PER_REQUEST` | `8` | 15 | |
| `IDE_MAX_IMAGE_BYTES` | `8388608` | 15 | Per image, decoded. |
| `IDE_MAX_CONCURRENT_GENERATIONS` | `1` | 15 | Separate gate for IDE generations. |
| `IDE_REQUEST_TIMEOUT_SECONDS` | `900` | 15 | Runtime time limit for IDE generations. |
| `IDE_DOCUMENT_ANALYSIS` | `off` | 17 | `on` mounts `POST /ide/v1/files/analyze`. |
| `IDE_VISION_ALIAS` | empty | 17 | A chat alias whose weight reports `vision`; used to describe images and scanned pages. |
| `IDE_MAX_FILE_BYTES` | `20971520` | 17 | |
| `IDE_MAX_FILE_PAGES` | `300` | 17 | |
| `IDE_MAX_ANALYSIS_CHARS` | `400000` | 17 | |
| `IDE_ANALYSIS_TIMEOUT_SECONDS` | `120` | 17 | Worker time limit. |
| `OLLAMA_FLASH_ATTENTION`, `OLLAMA_KV_CACHE_TYPE`, `OLLAMA_NUM_PARALLEL` | unset | 18 | Runtime tuning for large contexts, passed by the launcher only when set (verified against the pinned Ollama release). |

Windows per alias stay in `MODEL_CONTEXT_WINDOWS` / `DEFAULT_CONTEXT_WINDOW` (`cabinet-server models context`). An alias meant for Agent or Plan should get 32 768 tokens or more; a professional code model on a large machine, 131 072 or more.
