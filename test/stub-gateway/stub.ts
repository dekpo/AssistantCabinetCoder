/**
 * The stub gateway: a plain `node:http(s)` server that speaks the `/ide/v1` surface of
 * docs/IDE-CONTRACT.md with scripted answers. Used by the tests and, through `npm run stub`, for
 * demonstrations. Later lots extend it additively (agents, files analysis).
 *
 * Choosing the script of a chat request (the first match wins):
 *   1. the body field `stub_scenario` (the contract says unknown fields are ignored);
 *   2. a marker `[stub:<scenario>]` in the text of the last real user message (a user message that
 *      does not directly follow a tool message), so a person can choose from the chat box;
 *   3. `text`.
 * Scenarios: `text` (a short answer), `tool-call` (a call to a tool taken from the request's own
 * `tools` list: the first whose name contains `read_file`, otherwise the first, with the smallest
 * valid arguments; once a tool message follows the last real user message the stub answers with a
 * closing text instead), `error` (an error event inside the stream), `error-http` (503),
 * `slow` (a late first byte), `split` (three bytes at a time), `empty` (the contract's
 * `empty_answer` 502), `long` (a trickle of text for about a minute: for the stop button) and
 * `cut` (the connection is destroyed after two chunks). A marker may name the tool of `tool-call`:
 * `[stub:tool-call:create_file]` calls the tool of that exact name when the request offers it.
 * With `stream_options.include_usage` the stream ends with a usage chunk whose prompt tokens are the
 * text characters of the request divided by four, so a client can calibrate its own estimate.
 * An image sent to a model whose `capabilities.vision` is false is refused with
 * `provider_capability_unsupported` 400, like the server does.
 */
import * as http from "node:http";
import * as https from "node:https";

export type StubMode = "ok" | "version-mismatch" | "off" | "key-needed" | "oversize" | "redirect";

export const STUB_MODES: readonly StubMode[] = [
  "ok",
  "version-mismatch",
  "off",
  "key-needed",
  "oversize",
  "redirect",
];

export type Scenario =
  "text" | "tool-call" | "error" | "error-http" | "slow" | "split" | "empty" | "long" | "cut";

export const SCENARIOS: readonly Scenario[] = [
  "text",
  "tool-call",
  "error",
  "error-http",
  "slow",
  "split",
  "empty",
  "long",
  "cut",
];

export interface StubOptions {
  mode?: StubMode;
  /** When set, every `/ide/` request needs this exact bearer key. */
  requireKey?: string;
  tls?: { key: string; cert: string };
  /** Delay before the headers of the `slow` scenario. */
  slowFirstByteMs?: number;
  /** Pause between two chunks of the `long` scenario (default 250) and how many it sends (240). */
  longChunkMs?: number;
  longChunks?: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | undefined;
}

export interface Stub {
  url: string;
  port: number;
  requests: RecordedRequest[];
  /** Connections accepted so far (a reused keep-alive connection counts once). */
  connections: number;
  /** Responses whose connection closed before the answer was complete. */
  aborted: number;
  close(): Promise<void>;
}

export const STUB_MODELS = [
  {
    id: "cabinet-chat",
    object: "model",
    created: 1761500000,
    owned_by: "assistant-cabinet",
    context_window: 32768,
    max_output_tokens: 8192,
    capabilities: { tools: true, vision: false },
  },
  {
    id: "cabinet-code",
    object: "model",
    created: 1761500000,
    owned_by: "assistant-cabinet",
    context_window: 131072,
    max_output_tokens: 16384,
    capabilities: { tools: true, vision: true },
  },
  {
    id: "cabinet-plain",
    object: "model",
    created: 1761500000,
    owned_by: "assistant-cabinet",
    context_window: 8192,
    max_output_tokens: 2048,
    capabilities: { tools: false, vision: false },
  },
];

function envelope(code: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ error: { code, message: "stub secret message", data } });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

function chunk(delta: unknown, finish: string | null = null): string {
  const body = {
    id: "chatcmpl-stub",
    object: "chat.completion.chunk",
    model: "cabinet-code",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

const TEXT_STREAM = [
  chunk({ role: "assistant", content: "" }),
  chunk({ content: "Hello " }),
  chunk({ content: "from the stub, caf\u00e9." }),
  chunk({}, "stop"),
  "data: [DONE]\n\n",
];

const TEXT_COMPLETION_CHARS = 26;
const CLOSING_TEXT = "Closing answer from the stub.";

const ERROR_STREAM = [
  chunk({ role: "assistant", content: "" }),
  `data: ${envelope("provider_error")}\n\n`,
  "data: [DONE]\n\n",
];

/** The smallest valid value for each required property of a JSON schema. */
export function minimalArguments(schema: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const parsed = schema as {
    properties?: Record<string, { type?: unknown }>;
    required?: unknown;
  } | null;
  if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.required)) {
    return out;
  }
  for (const key of parsed.required) {
    if (typeof key !== "string") {
      continue;
    }
    switch (parsed.properties?.[key]?.type) {
      case "number":
      case "integer":
        out[key] = 1;
        break;
      case "boolean":
        out[key] = false;
        break;
      case "array":
        out[key] = [];
        break;
      case "object":
        out[key] = {};
        break;
      default:
        out[key] = "stub";
    }
  }
  return out;
}

interface ToolChoice {
  name: string;
  args: Record<string, unknown>;
}

/**
 * The tool to call: the one the marker names when the request offers it, else the first of the
 * request's own tools named like `read_file`, else the first.
 */
export function pickTool(
  tools: readonly { name: string; parameters: unknown }[],
  wanted?: string,
): ToolChoice {
  const target =
    tools.find((tool) => wanted !== undefined && tool.name === wanted) ??
    tools.find((tool) => tool.name.includes("read_file")) ??
    tools[0];
  if (target === undefined) {
    return { name: "read_file", args: { path: "a.py" } };
  }
  return { name: target.name, args: minimalArguments(target.parameters) };
}

interface Usage {
  prompt: number;
  completion: number;
}

function usageChunk(usage: Usage): string {
  const body = {
    id: "chatcmpl-stub",
    object: "chat.completion.chunk",
    model: "cabinet-code",
    choices: [],
    usage: {
      prompt_tokens: usage.prompt,
      completion_tokens: usage.completion,
      total_tokens: usage.prompt + usage.completion,
    },
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

/** Puts the usage chunk before the final `[DONE]` of a stream, when the request asked for it. */
function withUsage(stream: readonly string[], usage: Usage | undefined): string[] {
  if (usage === undefined) {
    return [...stream];
  }
  return [...stream.slice(0, -1), usageChunk(usage), ...stream.slice(-1)];
}

function toolStream(choice: ToolChoice): string[] {
  return [
    chunk({ role: "assistant", content: "" }),
    chunk({
      tool_calls: [
        {
          index: 0,
          id: "call_000000000000000000000001",
          type: "function",
          function: { name: choice.name, arguments: JSON.stringify(choice.args) },
        },
      ],
    }),
    chunk({}, "tool_calls"),
    "data: [DONE]\n\n",
  ];
}

function closingStream(): string[] {
  return [
    chunk({ role: "assistant", content: "" }),
    chunk({ content: CLOSING_TEXT }),
    chunk({}, "stop"),
    "data: [DONE]\n\n",
  ];
}

function sse(res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
  });
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  let total = 0;
  for await (const part of req) {
    const buffer = part as Buffer;
    total += buffer.length;
    if (total > 1_000_000) {
      break;
    }
    parts.push(buffer);
  }
  return Buffer.concat(parts).toString("utf8");
}

function completion(tool: ToolChoice | undefined, text: string): string {
  const message =
    tool === undefined
      ? { role: "assistant", content: text }
      : {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_000000000000000000000001",
              type: "function",
              function: { name: tool.name, arguments: JSON.stringify(tool.args) },
            },
          ],
        };
  return JSON.stringify({
    id: "chatcmpl-stub",
    object: "chat.completion",
    model: "cabinet-code",
    choices: [{ index: 0, message, finish_reason: tool === undefined ? "stop" : "tool_calls" }],
    usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
  });
}

interface ChatRequest {
  stream: boolean;
  scenario: Scenario | undefined;
  model: string | undefined;
  tools: { name: string; parameters: unknown }[];
  includeUsage: boolean;
  hasImage: boolean;
  /** A tool message follows the last real user message: the model is asked to close. */
  closing: boolean;
  /** The tool a marker such as `[stub:tool-call:create_file]` asks for. */
  wantedTool: string | undefined;
  promptChars: number;
}

type Loose = Record<string, unknown>;

function asObject(value: unknown): Loose | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Loose)
    : undefined;
}

function textOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      const record = asObject(part);
      return record?.["type"] === "text" && typeof record["text"] === "string"
        ? record["text"]
        : "";
    })
    .join("\n");
}

function parseChatRequest(text: string): ChatRequest {
  const request: ChatRequest = {
    stream: false,
    scenario: undefined,
    model: undefined,
    tools: [],
    includeUsage: false,
    hasImage: false,
    closing: false,
    wantedTool: undefined,
    promptChars: 0,
  };
  let body: Loose | undefined;
  try {
    body = asObject(JSON.parse(text));
  } catch {
    // An unreadable body is answered like a plain text request.
  }
  if (body === undefined) {
    return request;
  }
  request.stream = body["stream"] === true;
  request.includeUsage = asObject(body["stream_options"])?.["include_usage"] === true;
  request.model = typeof body["model"] === "string" ? body["model"] : undefined;
  if (Array.isArray(body["tools"])) {
    for (const item of body["tools"]) {
      const fn = asObject(asObject(item)?.["function"]);
      if (fn !== undefined && typeof fn["name"] === "string") {
        request.tools.push({ name: fn["name"], parameters: fn["parameters"] });
      }
    }
  }
  const messages = (Array.isArray(body["messages"]) ? body["messages"] : []).map(
    (message) => asObject(message) ?? {},
  );
  let lastRealUser = -1;
  messages.forEach((message, index) => {
    if (message["role"] === "user" && messages[index - 1]?.["role"] !== "tool") {
      lastRealUser = index;
    }
    if (Array.isArray(message["content"])) {
      request.hasImage ||= message["content"].some(
        (part) => asObject(part)?.["type"] === "image_url",
      );
    }
    request.promptChars += textOf(message["content"]).length;
    if (Array.isArray(message["tool_calls"])) {
      for (const call of message["tool_calls"]) {
        const args = asObject(asObject(call)?.["function"])?.["arguments"];
        request.promptChars += typeof args === "string" ? args.length : 0;
      }
    }
  });
  request.closing = messages.slice(lastRealUser + 1).some((message) => message["role"] === "tool");
  const named = body["stub_scenario"];
  const marker = /\[stub:([a-z-]+)(?::([A-Za-z0-9_.-]+))?\]/.exec(
    textOf(messages[lastRealUser]?.["content"]),
  );
  request.wantedTool = marker?.[2];
  const chosen = typeof named === "string" ? named : marker?.[1];
  request.scenario = SCENARIOS.find((scenario) => scenario === chosen);
  return request;
}

function modelLacksVision(model: string | undefined): boolean {
  return STUB_MODELS.find((entry) => entry.id === model)?.capabilities.vision === false;
}

async function chat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: StubOptions,
): Promise<void> {
  const request = parseChatRequest(await readBody(req));
  if (request.hasImage && modelLacksVision(request.model)) {
    sendJson(res, 400, envelope("provider_capability_unsupported", { capability: "vision" }));
    return;
  }
  const usage = (completionChars: number): Usage | undefined =>
    request.includeUsage
      ? {
          prompt: Math.max(1, Math.ceil(request.promptChars / 4)),
          completion: Math.max(1, Math.ceil(completionChars / 4)),
        }
      : undefined;
  const textStream = (): string => withUsage(TEXT_STREAM, usage(TEXT_COMPLETION_CHARS)).join("");
  switch (request.scenario ?? "text") {
    case "error-http":
      sendJson(res, 503, envelope("provider_unreachable"));
      return;
    case "empty":
      sendJson(res, 502, envelope("empty_answer"));
      return;
    case "slow":
      await sleep(options.slowFirstByteMs ?? 1500);
      if (res.destroyed) {
        return;
      }
      sse(res);
      res.end(textStream());
      return;
    case "split": {
      sse(res);
      const bytes = Buffer.from(textStream(), "utf8");
      for (let at = 0; at < bytes.length; at += 3) {
        if (res.destroyed) {
          return;
        }
        res.write(bytes.subarray(at, at + 3));
        await new Promise((resolve) => setImmediate(resolve));
      }
      res.end();
      return;
    }
    case "error":
      sse(res);
      res.end(ERROR_STREAM.join(""));
      return;
    case "long": {
      sse(res);
      res.write(chunk({ role: "assistant", content: "" }));
      for (let index = 0; index < (options.longChunks ?? 240); index += 1) {
        if (res.destroyed) {
          return;
        }
        res.write(chunk({ content: `word${index} ` }));
        await sleep(options.longChunkMs ?? 250);
      }
      res.write(chunk({}, "stop"));
      res.end("data: [DONE]\n\n");
      return;
    }
    case "cut":
      sse(res);
      await new Promise<void>((resolve) =>
        res.write(chunk({ role: "assistant", content: "" }) + chunk({ content: "Partial " }), () =>
          resolve(),
        ),
      );
      res.destroy();
      return;
    case "tool-call": {
      if (request.closing) {
        if (request.stream) {
          sse(res);
          res.end(withUsage(closingStream(), usage(CLOSING_TEXT.length)).join(""));
        } else {
          sendJson(res, 200, completion(undefined, CLOSING_TEXT));
        }
        return;
      }
      const choice = pickTool(request.tools, request.wantedTool);
      if (request.stream) {
        sse(res);
        res.end(withUsage(toolStream(choice), usage(JSON.stringify(choice.args).length)).join(""));
      } else {
        sendJson(res, 200, completion(choice, ""));
      }
      return;
    }
    default:
      if (request.stream) {
        sse(res);
        res.end(textStream());
      } else {
        sendJson(res, 200, completion(undefined, "Hello from the stub."));
      }
  }
}

function modelsBody(mode: StubMode): string {
  return JSON.stringify({
    object: "list",
    ide_api: mode === "version-mismatch" ? 2 : 1,
    features: { agents: false, document_analysis: false, image_description: false },
    data: STUB_MODELS,
  });
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: StubOptions,
  record: RecordedRequest[],
): Promise<void> {
  const path = (req.url ?? "/").split("?")[0] ?? "/";
  record.push({ method: req.method ?? "", path, authorization: req.headers.authorization });
  const mode = options.mode ?? "ok";
  if (path === "/health") {
    sendJson(res, 200, JSON.stringify({ status: "ok" }));
    return;
  }
  if (!path.startsWith("/ide/")) {
    sendJson(res, 404, JSON.stringify({ detail: "Not Found" }));
    return;
  }
  if (mode === "off") {
    sendJson(res, 404, JSON.stringify({ detail: "Not Found" }));
    return;
  }
  if (mode === "redirect") {
    res.writeHead(302, { Location: "/health" });
    res.end();
    return;
  }
  const keyOk =
    options.requireKey === undefined ||
    req.headers.authorization === `Bearer ${options.requireKey}`;
  if (mode === "key-needed" || !keyOk) {
    res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" });
    res.end(envelope("unauthorized"));
    return;
  }
  if (path === "/ide/v1/models" && req.method === "GET") {
    if (mode === "oversize") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"object":"list","ide_api":1,"data":[],"padding":"');
      const block = "x".repeat(65536);
      for (let sent = 0; sent < 5 * 1024 * 1024; sent += block.length) {
        if (res.destroyed) {
          return;
        }
        res.write(block);
        await new Promise((resolve) => setImmediate(resolve));
      }
      res.end('"}');
      return;
    }
    sendJson(res, 200, modelsBody(mode));
    return;
  }
  if (path === "/ide/v1/chat/completions" && req.method === "POST") {
    await chat(req, res, options);
    return;
  }
  sendJson(res, 404, JSON.stringify({ detail: "Not Found" }));
}

export async function startStub(options: StubOptions = {}, port = 0): Promise<Stub> {
  const requests: RecordedRequest[] = [];
  const stub = { connections: 0, aborted: 0 };
  const listener: http.RequestListener = (req, res) => {
    res.on("close", () => {
      if (!res.writableFinished) {
        stub.aborted += 1;
      }
    });
    handle(req, res, options, requests).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
  };
  const server = options.tls
    ? https.createServer(options.tls, listener)
    : http.createServer(listener);
  server.on(options.tls ? "secureConnection" : "connection", () => {
    stub.connections += 1;
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : 0;
  const scheme = options.tls ? "https:" : "http:";
  return {
    url: `${scheme}//127.0.0.1:${boundPort}`,
    port: boundPort,
    requests,
    get connections() {
      return stub.connections;
    },
    get aborted() {
      return stub.aborted;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
