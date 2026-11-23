/**
 * The logic of the model provider, against an injected `Host`, so it needs no editor: the list of
 * models (cached, coalesced, tolerant of a server that is off or needs a key), one chat request
 * (conversion, stream loop, error mapping, log line) and the token estimate. The thin adapter in
 * `extension.ts` supplies the `Host` and turns plain parts into the editor's classes.
 * No text, argument, result, image or key is ever written by this module: the log carries codes,
 * durations and counts, and the errors it throws hold sentences from `messages.ts` only.
 */
import {
  failureFromResponse,
  getModels,
  requestFingerprint,
  type ClientOptions,
  type ModelInfo,
} from "./client";
import { CabinetError, codeOf, type MachineCode, type OverflowNumbers } from "./codes";
import {
  ConvertError,
  ResponseReader,
  buildChatRequest,
  type ChatPart,
  type InputMessage,
  type ToolDefinition,
} from "./convert";
import type { NoServerReason } from "./discovery";
import type { CallRecord } from "./log";
import {
  UI,
  describeCode,
  describeConversionFailure,
  describeModelTooltip,
  describeNoServer,
  describeOverflow,
} from "./messages";
import { parseSse } from "./sse";
import { RatioTable, measureInput, measureMessages } from "./tokens";
import { open } from "./transport";

/** How long a model list is fresh. A failed refresh keeps the last good list past this. */
export const CACHE_MS = 60_000;
/** Server addresses whose list is kept at once. */
export const MAX_CACHED_ADDRESSES = 8;
/** Used when the server does not report a window or an output ceiling; the tooltip says so. */
export const FALLBACK_WINDOW = 8192;
export const FALLBACK_OUTPUT = 2048;
/**
 * How long a refusal that retrying cannot fix is remembered (decision D-025). VS Code 1.147.0
 * retries every failure five times within about 15 seconds, whatever its kind (measured).
 */
export const REFUSAL_MEMORY_MS = 30_000;
/** Refusals remembered at once; the oldest is forgotten first. */
export const MAX_REMEMBERED_REFUSALS = 16;

/** Refusals that the same request cannot escape by being sent again a few seconds later. */
const FINAL_CODES: ReadonlySet<MachineCode> = new Set<MachineCode>([
  "context_too_large",
  "payload_too_large",
  "key_needed",
  "model_alias_not_allowed",
  "model_not_permitted",
  "provider_capability_unsupported",
  "invalid_request",
  "timeout",
]);

/**
 * Whether a failure is one that retrying the same request cannot fix: the codes above, and the
 * runtime's timeout (`provider_error` with status 504). `server_busy`, `provider_unreachable`,
 * `rate_limited`, `empty_answer` and `provider_error` 502 may succeed later.
 */
export function isFinalRefusal(error: CabinetError): boolean {
  return FINAL_CODES.has(error.code) || (error.code === "provider_error" && error.status === 504);
}

interface RememberedRefusal {
  code: MachineCode;
  status: number | undefined;
  overflow: OverflowNumbers | undefined;
  at: number;
}

export type Resolution =
  { ok: true; url: string; options: ClientOptions } | { ok: false; reason: NoServerReason };

/** Everything the provider needs from the editor and the settings. */
export interface Host {
  /** The connection as it is now (settings and key read again at each call). */
  resolve(): Promise<Resolution>;
  /** Shows a message to the user; `offerKey` adds the Set API Key action. */
  show(text: string, offerKey?: boolean): void;
  log(record: CallRecord): void;
  /** Tells the editor that the list of models may have changed. */
  fireChange(): void;
}

/** A model as the editor wants it: the fields of its model information, as a plain object. */
export interface ModelEntry {
  id: string;
  name: string;
  family: string;
  version: string;
  detail: string;
  tooltip: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: { toolCalling: boolean; imageInput: boolean };
}

export interface ChatCall {
  model: { id: string; imageInput: boolean };
  messages: readonly InputMessage[];
  tools?: readonly ToolDefinition[] | undefined;
  toolMode: "auto" | "required";
  modelOptions?: Readonly<Record<string, unknown>> | undefined;
}

export function toModelEntry(model: ModelInfo): ModelEntry {
  const window = model.contextWindow ?? FALLBACK_WINDOW;
  const output = model.maxOutputTokens ?? FALLBACK_OUTPUT;
  // The input budget keeps an eighth of the window for the answer (at least 2048 tokens, never more
  // than the output ceiling), decision D-023. VS Code 1.147.0 refuses Agent mode when the input
  // budget is below its static prompt (measured: 24576 refused, 28672 accepted), and the old rule,
  // window minus ceiling, gave 16384 for a 32768-token model. Windows of 131072 and the fallback
  // keep the old value, because there the eighth reaches the ceiling or the minimum.
  const reserve = Math.min(output, Math.max(Math.floor(window / 8), 2048));
  return {
    id: model.id,
    name: model.id,
    family: model.id,
    version: "1",
    detail: UI.providerDetail,
    tooltip: describeModelTooltip(model, { window: FALLBACK_WINDOW, output: FALLBACK_OUTPUT }),
    maxInputTokens: Math.max(1, window - reserve),
    maxOutputTokens: output,
    capabilities: { toolCalling: model.tools, imageInput: model.vision },
  };
}

type Outcome = { ok: true; models: ModelEntry[] } | { ok: false; code: MachineCode };

interface Cached {
  models: ModelEntry[];
  at: number;
}

export class ChatProvider {
  private readonly cache = new Map<string, Cached>();
  private readonly inflight = new Map<string, Promise<Outcome>>();
  private readonly offShown = new Set<string>();
  private readonly ratios = new RatioTable();
  private readonly refusals = new Map<string, RememberedRefusal>();
  private generation = 0;

  constructor(
    private readonly host: Host,
    private readonly clock: () => number = Date.now,
  ) {}

  /** The models to offer. Never throws: a failure is a message (when not silent) and a list. */
  async information(silent: boolean): Promise<ModelEntry[]> {
    const resolved = await this.host.resolve();
    if (!resolved.ok) {
      if (!silent) {
        this.host.show(describeNoServer(resolved.reason));
      }
      return [];
    }
    const url = resolved.url;
    const cached = this.cache.get(url);
    if (cached !== undefined && this.clock() - cached.at < CACHE_MS) {
      this.remember(url, cached);
      return cached.models;
    }
    const outcome = await this.requestModels(url, resolved.options);
    if (outcome.ok) {
      this.offShown.delete(url);
      return outcome.models;
    }
    return this.failed(url, outcome.code, silent);
  }

  /** The address, the key or the authority changed: forget what was learned and tell the editor. */
  invalidate(): void {
    this.generation += 1;
    this.cache.clear();
    this.inflight.clear();
    this.refusals.clear();
    this.host.fireChange();
  }

  /** The estimate behind `provideTokenCount`; never touches the network. */
  countTokens(modelId: string, input: string | { readonly content: readonly unknown[] }): number {
    return this.ratios.estimate(modelId, measureInput(input));
  }

  /**
   * One chat request. Parts are reported as they arrive. A refusal or a failure throws an `Error`
   * whose message is a sentence of `messages.ts`; a cancellation ends quietly.
   */
  async chat(call: ChatCall, report: (part: ChatPart) => void, signal: AbortSignal): Promise<void> {
    const started = this.clock();
    const record: CallRecord = { call: "chat", alias: call.model.id, durationMs: 0 };
    let failure: Error | undefined;
    try {
      await this.run(call, report, signal, record);
    } catch (error) {
      const code = error instanceof ConvertError ? error.code : codeOf(error);
      record.code = code;
      if (code !== "cancelled") {
        failure = new Error(
          error instanceof ConvertError
            ? describeConversionFailure(error.reason, error.toolName)
            : error instanceof CabinetError && error.overflow !== undefined
              ? describeOverflow(error.overflow)
              : describeCode(code),
        );
      }
    } finally {
      record.durationMs = this.clock() - started;
      this.host.log(record);
    }
    if (failure !== undefined) {
      throw failure;
    }
  }

  private async run(
    call: ChatCall,
    report: (part: ChatPart) => void,
    signal: AbortSignal,
    record: CallRecord,
  ): Promise<void> {
    const built = buildChatRequest({
      alias: call.model.id,
      vision: call.model.imageInput,
      messages: call.messages,
      tools: call.tools,
      toolMode: call.toolMode,
      modelOptions: call.modelOptions,
    });
    const resolved = await this.host.resolve();
    if (!resolved.ok) {
      throw new CabinetError(
        resolved.reason === "invalid_server_url" ? "invalid_server_url" : "server_not_configured",
      );
    }
    const body = JSON.stringify(built.body);
    // The editor retries every failure five times (decision D-025): an identical request that the
    // server has just refused for good is answered here, with no call and no status in the log.
    const key = requestFingerprint(resolved.url, body);
    const remembered = this.recallRefusal(key);
    if (remembered !== undefined) {
      throw remembered;
    }
    try {
      await this.send(resolved.options, body, built.toolNames, call, report, signal, record);
    } catch (error) {
      if (error instanceof CabinetError && isFinalRefusal(error)) {
        this.rememberRefusal(key, error);
      }
      throw error;
    }
  }

  private async send(
    options: ClientOptions,
    body: string,
    toolNames: ReturnType<typeof buildChatRequest>["toolNames"],
    call: ChatCall,
    report: (part: ChatPart) => void,
    signal: AbortSignal,
    record: CallRecord,
  ): Promise<void> {
    const reply = await open(options, {
      method: "POST",
      path: "/ide/v1/chat/completions",
      body,
      accept: "text/event-stream",
      signal,
    });
    record.status = reply.status;
    if (reply.status < 200 || reply.status >= 300) {
      throw failureFromResponse(reply.status, await reply.text(), "ide");
    }
    const reader = new ResponseReader(toolNames);
    try {
      for await (const event of parseSse(reply.chunks())) {
        if (event.kind === "error") {
          throw new CabinetError(event.code);
        }
        if (event.kind === "done") {
          break;
        }
        for (const part of reader.accept(event.value)) {
          report(part);
        }
      }
    } catch (error) {
      // A connection that drops after the answer started is a stream that stopped, not a server
      // that cannot be reached.
      if (error instanceof CabinetError && error.code === "unreachable") {
        throw new CabinetError("stream_truncated");
      }
      throw error;
    }
    for (const part of reader.finish()) {
      report(part);
    }
    record.promptTokens = reader.promptTokens;
    record.completionTokens = reader.completionTokens;
    record.toolCalls = reader.toolCalls;
    if (reader.promptTokens !== undefined) {
      this.ratios.observe(call.model.id, measureMessages(call.messages), reader.promptTokens);
    }
  }

  /** A fresh copy of a refusal remembered for this fingerprint, or `undefined`. */
  private recallRefusal(key: string): CabinetError | undefined {
    const entry = this.refusals.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (this.clock() - entry.at >= REFUSAL_MEMORY_MS) {
      this.refusals.delete(key);
      return undefined;
    }
    const options: { status?: number; overflow?: OverflowNumbers } = {};
    if (entry.status !== undefined) {
      options.status = entry.status;
    }
    if (entry.overflow !== undefined) {
      options.overflow = entry.overflow;
    }
    return new CabinetError(entry.code, options);
  }

  private rememberRefusal(key: string, error: CabinetError): void {
    const now = this.clock();
    for (const [stored, entry] of this.refusals) {
      if (now - entry.at >= REFUSAL_MEMORY_MS) {
        this.refusals.delete(stored);
      }
    }
    this.refusals.delete(key);
    this.refusals.set(key, {
      code: error.code,
      status: error.status,
      overflow: error.overflow,
      at: now,
    });
    while (this.refusals.size > MAX_REMEMBERED_REFUSALS) {
      const oldest = this.refusals.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.refusals.delete(oldest.value);
    }
  }

  /** How many refusals are remembered now (for tests; the fingerprints never leave the class). */
  get rememberedRefusals(): number {
    return this.refusals.size;
  }

  private requestModels(url: string, options: ClientOptions): Promise<Outcome> {
    const running = this.inflight.get(url);
    if (running !== undefined) {
      return running;
    }
    const generation = this.generation;
    const promise: Promise<Outcome> = getModels(options).then(
      (result): Outcome => ({ ok: true, models: result.models.map(toModelEntry) }),
      (error: unknown): Outcome => ({ ok: false, code: codeOf(error) }),
    );
    this.inflight.set(url, promise);
    void promise.then((outcome) => {
      if (this.inflight.get(url) === promise) {
        this.inflight.delete(url);
      }
      if (outcome.ok && generation === this.generation) {
        this.remember(url, { models: outcome.models, at: this.clock() });
      }
    });
    return promise;
  }

  private remember(url: string, entry: Cached): void {
    this.cache.delete(url);
    this.cache.set(url, entry);
    while (this.cache.size > MAX_CACHED_ADDRESSES) {
      const oldest = this.cache.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.cache.delete(oldest.value);
    }
  }

  private failed(url: string, code: MachineCode, silent: boolean): ModelEntry[] {
    switch (code) {
      case "ide_surface_off":
        this.cache.delete(url);
        if (!silent && !this.offShown.has(url)) {
          this.offShown.add(url);
          this.host.show(describeCode(code));
        }
        return [];
      case "key_needed":
        this.cache.delete(url);
        if (!silent) {
          this.host.show(describeCode(code), true);
        }
        return [];
      case "ide_api_mismatch":
        this.cache.delete(url);
        if (!silent) {
          this.host.show(UI.providerMismatch);
        }
        return [];
      default:
        if (!silent) {
          this.host.show(describeCode(code));
        }
        return this.cache.get(url)?.models ?? [];
    }
  }
}
