/**
 * Typed calls to the server over the transport: `GET /health` and `GET /ide/v1/models`, and the
 * mapping of every status and error envelope to a machine code. The chat call is Lot X1b's.
 * No sentence, no response text and no key ever leaves this module: errors carry codes only.
 */
import { CabinetError, codeFromEnvelope, codeOf, type MachineCode } from "./codes";
import { open, type RequestSpec, type TransportOptions } from "./transport";

/** The version of the editor interface this extension speaks (`ide_api`). */
export const SUPPORTED_IDE_API = 1;

/** One finished call, as `log.ts` records it. */
export interface CallSummary {
  call: "health" | "models";
  status: number | undefined;
  durationMs: number;
  code: MachineCode | undefined;
}

export interface ClientOptions extends TransportOptions {
  onCall?: ((summary: CallSummary) => void) | undefined;
}

export interface ModelInfo {
  id: string;
  contextWindow: number | undefined;
  maxOutputTokens: number | undefined;
  tools: boolean;
  vision: boolean;
}

export interface ServerFeatures {
  agents: boolean;
  documentAnalysis: boolean;
  imageDescription: boolean;
}

export interface ModelsResult {
  ideApi: number;
  features: ServerFeatures;
  models: ModelInfo[];
}

export type ConnectionState =
  "connected" | "off" | "key_needed" | "unreachable" | "certificate" | "version" | "error";

export interface ConnectionReport {
  /** `GET /health` answered with the expected body. */
  healthy: boolean;
  /** Present when `/ide/v1/models` answered and was accepted. */
  models?: ModelsResult;
  /** The first failure, with the call it came from. */
  failure?: { call: "health" | "models"; code: MachineCode; detail?: string };
}

/**
 * The failure for a response that is not a success. A `404` on the editor surface is "off", a
 * `401` is "key needed" whatever the body says; otherwise the envelope's code decides, then the
 * status. The envelope's message and data are read by nobody.
 */
export function failureFromResponse(
  status: number,
  bodyText: string,
  surface: "ide" | "other",
): CabinetError {
  if (status === 404 && surface === "ide") {
    return new CabinetError("ide_surface_off", { status });
  }
  if (status === 401) {
    return new CabinetError("key_needed", { status });
  }
  if (status >= 300 && status < 400) {
    return new CabinetError("redirect_refused", { status });
  }
  const fromBody = codeFromEnvelope(envelopeCode(bodyText));
  if (fromBody !== undefined) {
    return new CabinetError(fromBody, { status });
  }
  if (status === 429) {
    return new CabinetError("rate_limited", { status });
  }
  if (status >= 500) {
    return new CabinetError("server_error", { status });
  }
  return new CabinetError("unexpected_response", { status });
}

function envelopeCode(bodyText: string): unknown {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    const error = (parsed as { error?: unknown } | null)?.error;
    return (error as { code?: unknown } | null)?.code;
  } catch {
    return undefined;
  }
}

async function getJson(
  options: ClientOptions,
  call: CallSummary["call"],
  path: string,
  surface: "ide" | "other",
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const started = Date.now();
  let status: number | undefined;
  let code: MachineCode | undefined;
  try {
    const spec: RequestSpec = { method: "GET", path, signal };
    const reply = await open(options, spec);
    status = reply.status;
    const text = await reply.text();
    if (status < 200 || status >= 300) {
      throw failureFromResponse(status, text, surface);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CabinetError("bad_response", { status });
    }
  } catch (error) {
    code = codeOf(error);
    throw error instanceof CabinetError ? error : new CabinetError(code);
  } finally {
    options.onCall?.({ call, status, durationMs: Date.now() - started, code });
  }
}

/** `GET /health`: reachable and speaking the expected language. */
export async function getHealth(options: ClientOptions, signal?: AbortSignal): Promise<void> {
  const body = await getJson(options, "health", "/health", "other", signal);
  if ((body as { status?: unknown } | null)?.status !== "ok") {
    throw new CabinetError("bad_response");
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Reads the body of `GET /ide/v1/models`; unknown fields and a missing `features` are fine. */
export function parseModels(body: unknown): ModelsResult {
  const record = asRecord(body);
  if (record === undefined || record["ide_api"] !== SUPPORTED_IDE_API) {
    throw new CabinetError("ide_api_mismatch");
  }
  const data = record["data"];
  if (!Array.isArray(data)) {
    throw new CabinetError("bad_response");
  }
  const features = asRecord(record["features"]) ?? {};
  const models: ModelInfo[] = [];
  for (const item of data) {
    const entry = asRecord(item);
    if (entry === undefined || typeof entry["id"] !== "string" || entry["id"] === "") {
      continue;
    }
    const capabilities = asRecord(entry["capabilities"]) ?? {};
    models.push({
      id: entry["id"],
      contextWindow: positiveInteger(entry["context_window"]),
      maxOutputTokens: positiveInteger(entry["max_output_tokens"]),
      tools: capabilities["tools"] === true,
      vision: capabilities["vision"] === true,
    });
  }
  return {
    ideApi: SUPPORTED_IDE_API,
    features: {
      agents: features["agents"] === true,
      documentAnalysis: features["document_analysis"] === true,
      imageDescription: features["image_description"] === true,
    },
    models,
  };
}

/** `GET /ide/v1/models`. */
export async function getModels(
  options: ClientOptions,
  signal?: AbortSignal,
): Promise<ModelsResult> {
  return parseModels(await getJson(options, "models", "/ide/v1/models", "ide", signal));
}

/** What `Test Connection` shows: the health call, then the model list. Never throws. */
export async function checkConnection(
  options: ClientOptions,
  signal?: AbortSignal,
): Promise<ConnectionReport> {
  try {
    await getHealth(options, signal);
  } catch (error) {
    return { healthy: false, failure: failureOf("health", error) };
  }
  try {
    return { healthy: true, models: await getModels(options, signal) };
  } catch (error) {
    return { healthy: true, failure: failureOf("models", error) };
  }
}

function failureOf(
  call: "health" | "models",
  error: unknown,
): NonNullable<ConnectionReport["failure"]> {
  const detail = error instanceof CabinetError ? error.detail : undefined;
  return detail === undefined
    ? { call, code: codeOf(error) }
    : { call, code: codeOf(error), detail };
}

/** The status-bar state for the outcome of a call (`undefined` is a success). */
export function stateFromCode(code: MachineCode | undefined): ConnectionState {
  switch (code) {
    case undefined:
      return "connected";
    case "ide_surface_off":
      return "off";
    case "key_needed":
      return "key_needed";
    case "unreachable":
    case "timeout":
      return "unreachable";
    case "certificate_untrusted":
    case "ca_file_unreadable":
    case "ca_file_not_certificate":
    case "ca_file_has_private_key":
      return "certificate";
    case "ide_api_mismatch":
      return "version";
    default:
      return "error";
  }
}
