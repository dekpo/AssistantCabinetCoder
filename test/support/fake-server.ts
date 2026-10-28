/**
 * A tiny HTTP server whose answers a test writes by hand, for the cases the stub gateway does not
 * script (a model list without features, an arguments string that is not JSON, a stream with no end,
 * every error code of the contract). It records the bodies and headers it receives.
 */
import * as http from "node:http";

export interface Scripted {
  url: string;
  bodies: string[];
  headers: http.IncomingHttpHeaders[];
  paths: string[];
  close(): Promise<void>;
}

export type Responder = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string,
) => void | Promise<void>;

export async function startScripted(respond: Responder): Promise<Scripted> {
  const bodies: string[] = [];
  const headers: http.IncomingHttpHeaders[] = [];
  const paths: string[] = [];
  const server = http.createServer((req, res) => {
    const parts: Buffer[] = [];
    req.on("data", (part: Buffer) => parts.push(part));
    req.on("end", () => {
      const body = Buffer.concat(parts).toString("utf8");
      bodies.push(body);
      headers.push(req.headers);
      paths.push(req.url ?? "");
      Promise.resolve(respond(req, res, body)).catch(() => res.destroy());
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    bodies,
    headers,
    paths,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

export function sseHeaders(res: http.ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
}

/** One `data:` event of the stream. */
export function dataEvent(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

export function delta(content: unknown, finish: string | null = null): unknown {
  return { choices: [{ index: 0, delta: content, finish_reason: finish }] };
}

export function modelsBody(models: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ object: "list", ide_api: 1, data: models, ...extra });
}

/** A models route that answers `models`, and a chat route that answers with `chat`. */
export function routes(options: {
  models?: unknown[];
  modelsDelayMs?: number;
  chat?: Responder;
}): Responder {
  return async (req, res, body) => {
    if (req.url === "/ide/v1/models") {
      if (options.modelsDelayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, options.modelsDelayMs));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(modelsBody(options.models ?? []));
      return;
    }
    if (req.url === "/ide/v1/chat/completions" && options.chat !== undefined) {
      await options.chat(req, res, body);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end('{"detail":"Not Found"}');
  };
}
