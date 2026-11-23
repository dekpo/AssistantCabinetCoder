/**
 * HTTP and HTTPS to the configured server, with `node:http` and `node:https` only.
 * One code path serves streaming and non-streaming calls (connection, headers, errors).
 * Certificate checking is never turned off; the key goes only in `Authorization`; redirects are not
 * followed (the caller reads a 3xx status as `redirect_refused`); nothing is written anywhere.
 */
import { X509Certificate } from "node:crypto";
import { promises as fs } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import { CabinetError } from "./codes";

/** Ceiling of a JSON response body. Streams are not capped. */
export const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_CA_FILE_BYTES = 1024 * 1024;
/** Agents kept at once (one per server address); the least recently used is closed first. */
export const MAX_AGENTS = 8;

export interface TransportOptions {
  /** `http(s)://host[:port]`, as returned by `normalizeServerUrl`. */
  baseUrl: string;
  /** The authority to trust, re-read at each request. Empty: the system's trusted authorities. */
  caFile?: string | undefined;
  /** From the secret store only. Sent only when set. */
  apiKey?: string | undefined;
  /** The limit with no byte received, per request. */
  timeoutSeconds: number;
  maxBodyBytes?: number | undefined;
}

export interface RequestSpec {
  method: "GET" | "POST";
  /** An absolute path on the server, starting with a single `/`. */
  path: string;
  /** A JSON text. */
  body?: string | undefined;
  accept?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** The whole body as text, capped by `maxBodyBytes`. */
  text(): Promise<string>;
  /** The body as it arrives (for the event stream). */
  chunks(): AsyncGenerator<Buffer>;
  /** Drops the connection. */
  destroy(): void;
}

const agents = new Map<string, http.Agent>();

/** The keep-alive agent of one server address (created on first use, bounded). */
export function agentFor(baseUrl: string): http.Agent {
  const url = new URL(baseUrl);
  const key = url.origin;
  const existing = agents.get(key);
  if (existing !== undefined) {
    agents.delete(key);
    agents.set(key, existing);
    return existing;
  }
  const settings = { keepAlive: true, maxSockets: 4, maxFreeSockets: 2, keepAliveMsecs: 30_000 };
  const agent = url.protocol === "https:" ? new https.Agent(settings) : new http.Agent(settings);
  agents.set(key, agent);
  while (agents.size > MAX_AGENTS) {
    const oldest = agents.keys().next();
    if (oldest.done === true) {
      break;
    }
    agents.get(oldest.value)?.destroy();
    agents.delete(oldest.value);
  }
  return agent;
}

export function agentCount(): number {
  return agents.size;
}

export function closeAgents(): void {
  for (const agent of agents.values()) {
    agent.destroy();
  }
  agents.clear();
}

/**
 * Reads the authority file. A file that cannot be read, holds no certificate, or holds a private
 * key in any form is refused. Only certificate blocks are returned.
 */
export async function loadCaFile(file: string): Promise<string> {
  let text: string;
  try {
    const info = await fs.stat(file);
    if (!info.isFile() || info.size > MAX_CA_FILE_BYTES) {
      throw new CabinetError("ca_file_unreadable");
    }
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    throw error instanceof CabinetError ? error : new CabinetError("ca_file_unreadable");
  }
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(text)) {
    throw new CabinetError("ca_file_has_private_key");
  }
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0 || !blocks.every(isCertificate)) {
    throw new CabinetError("ca_file_not_certificate");
  }
  return blocks.join("\n");
}

function isCertificate(pem: string): boolean {
  try {
    return new X509Certificate(pem).subject !== undefined;
  } catch {
    return false;
  }
}

const CERTIFICATE_ERRORS = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_UNTRUSTED",
  "CERT_REVOKED",
  "HOSTNAME_MISMATCH",
]);

function errorCodeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : undefined;
}

/** The machine code of a Node network error. */
export function fromNodeError(error: unknown): CabinetError {
  if (error instanceof CabinetError) {
    return error;
  }
  const code = errorCodeOf(error);
  const detail = code === undefined ? {} : { detail: code };
  if (code !== undefined && (CERTIFICATE_ERRORS.has(code) || code.startsWith("ERR_TLS_CERT"))) {
    return new CabinetError("certificate_untrusted", detail);
  }
  return new CabinetError("unreachable", detail);
}

interface Failure {
  error: CabinetError | undefined;
}

async function readAll(
  res: http.IncomingMessage,
  failure: Failure,
  maxBytes: number,
): Promise<string> {
  const declared = Number(res.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.destroy();
    throw new CabinetError("response_too_large");
  }
  const parts: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of res) {
      const buffer = chunk as Buffer;
      total += buffer.length;
      if (total > maxBytes) {
        res.destroy();
        throw new CabinetError("response_too_large");
      }
      parts.push(buffer);
    }
  } catch (error) {
    throw failure.error ?? fromNodeError(error);
  }
  return Buffer.concat(parts).toString("utf8");
}

/**
 * Sends one request and resolves when the response headers arrive. Rejects with a
 * `CabinetError`: `unreachable`, `certificate_untrusted`, `timeout`, `cancelled` or a CA-file code.
 */
export async function open(options: TransportOptions, spec: RequestSpec): Promise<Reply> {
  if (!spec.path.startsWith("/") || spec.path.startsWith("//")) {
    throw new CabinetError("invalid_server_url");
  }
  if (spec.signal?.aborted === true) {
    throw new CabinetError("cancelled");
  }
  const url = new URL(spec.path, options.baseUrl);
  const secure = url.protocol === "https:";
  let ca: string | undefined;
  if (secure && options.caFile !== undefined && options.caFile.trim() !== "") {
    ca = await loadCaFile(options.caFile.trim());
  }
  const headers: Record<string, string> = { Accept: spec.accept ?? "application/json" };
  if (spec.body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(Buffer.byteLength(spec.body));
  }
  if (options.apiKey !== undefined && options.apiKey !== "") {
    headers["Authorization"] = `Bearer ${options.apiKey}`;
  }
  const maxBytes = options.maxBodyBytes ?? MAX_JSON_BODY_BYTES;
  const agent = agentFor(options.baseUrl);

  return new Promise<Reply>((resolve, reject) => {
    const failure: Failure = { error: undefined };
    const requestOptions: https.RequestOptions = {
      method: spec.method,
      headers,
      agent,
      ...(ca === undefined ? {} : { ca }),
    };
    const req = (secure ? https : http).request(url, requestOptions);
    const fail = (error: CabinetError): void => {
      failure.error ??= error;
      req.destroy();
    };
    const onAbort = (): void => fail(new CabinetError("cancelled"));
    const cleanup = (): void => spec.signal?.removeEventListener("abort", onAbort);
    spec.signal?.addEventListener("abort", onAbort, { once: true });
    req.setTimeout(Math.max(1, Math.round(options.timeoutSeconds * 1000)), () =>
      fail(new CabinetError("timeout")),
    );
    req.on("error", (error) => {
      cleanup();
      reject(failure.error ?? fromNodeError(error));
    });
    req.on("response", (res) => {
      res.once("close", cleanup);
      resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        text: () => readAll(res, failure, maxBytes),
        chunks: async function* () {
          try {
            for await (const chunk of res) {
              yield chunk as Buffer;
            }
          } catch (error) {
            throw failure.error ?? fromNodeError(error);
          }
        },
        destroy: () => {
          req.destroy();
          res.destroy();
        },
      });
    });
    req.end(spec.body);
  });
}
