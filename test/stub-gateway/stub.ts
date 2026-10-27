/**
 * The stub gateway: a plain `node:http(s)` server that speaks the `/ide/v1` surface of
 * docs/IDE-CONTRACT.md with scripted answers. Used by the tests and, through `npm run stub`, for
 * demonstrations. Later lots extend it additively (agents, files analysis).
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

/** Chosen per chat request with the body field `stub_scenario` (the server ignores unknown fields). */
export type Scenario = "text" | "tool-call" | "error" | "error-http" | "slow" | "split";

export interface StubOptions {
  mode?: StubMode;
  /** When set, every `/ide/` request needs this exact bearer key. */
  requireKey?: string;
  tls?: { key: string; cert: string };
  /** Delay before the headers of the `slow` scenario. */
  slowFirstByteMs?: number;
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

function envelope(code: string): string {
  return JSON.stringify({ error: { code, message: "stub secret message", data: {} } });
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

const TOOL_STREAM = [
  chunk({ role: "assistant", content: "" }),
  chunk({
    tool_calls: [
      {
        index: 0,
        id: "call_000000000000000000000001",
        type: "function",
        function: { name: "read_file", arguments: '{"path":"a.py"}' },
      },
    ],
  }),
  chunk({}, "tool_calls"),
  "data: [DONE]\n\n",
];

const ERROR_STREAM = [
  chunk({ role: "assistant", content: "" }),
  `data: ${envelope("provider_error")}\n\n`,
  "data: [DONE]\n\n",
];

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

function completion(toolCall: boolean): string {
  const message = toolCall
    ? {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_000000000000000000000001",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"a.py"}' },
          },
        ],
      }
    : { role: "assistant", content: "Hello from the stub." };
  return JSON.stringify({
    id: "chatcmpl-stub",
    object: "chat.completion",
    model: "cabinet-code",
    choices: [{ index: 0, message, finish_reason: toolCall ? "tool_calls" : "stop" }],
    usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
  });
}

async function chat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: StubOptions,
): Promise<void> {
  const text = await readBody(req);
  let wantsStream = false;
  let scenario: Scenario | undefined;
  try {
    const parsed = JSON.parse(text) as { stream?: unknown; stub_scenario?: unknown };
    wantsStream = parsed.stream === true;
    scenario =
      typeof parsed.stub_scenario === "string" ? (parsed.stub_scenario as Scenario) : undefined;
  } catch {
    // An unreadable body is answered like a plain text request.
  }
  switch (scenario ?? "text") {
    case "error-http":
      sendJson(res, 503, envelope("provider_unreachable"));
      return;
    case "slow":
      await new Promise((resolve) => setTimeout(resolve, options.slowFirstByteMs ?? 1500));
      if (res.destroyed) {
        return;
      }
      sse(res);
      res.end(TEXT_STREAM.join(""));
      return;
    case "split": {
      sse(res);
      const bytes = Buffer.from(TEXT_STREAM.join(""), "utf8");
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
    case "tool-call":
      if (wantsStream) {
        sse(res);
        res.end(TOOL_STREAM.join(""));
      } else {
        sendJson(res, 200, completion(true));
      }
      return;
    default:
      if (wantsStream) {
        sse(res);
        res.end(TEXT_STREAM.join(""));
      } else {
        sendJson(res, 200, completion(false));
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
