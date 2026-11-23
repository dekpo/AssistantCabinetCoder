/**
 * One streamed chat call of the panel: `POST /ide/v1/chat/completions`, sent **once**. No retry,
 * automatic or hidden: a failure is returned to the caller, which shows it once. A stop aborts the
 * request's signal, which closes the connection at once; nothing more is read after it.
 * Composes `transport.open` and `sse.parseSse`; maps a refusal with `client.failureFromResponse`.
 * It does not use the frozen provider of the editor's chat (`provider`, `convert`, `tokens`): the
 * small duplication of the stream loop is accepted and written in docs/ARCHITECTURE.md.
 * One log line per call: codes, status, durations and counts only.
 */
import { failureFromResponse, type ClientOptions } from "./client";
import { CabinetError, codeOf, type MachineCode, type OverflowNumbers } from "./codes";
import type { ChatBody, RawToolCall } from "./conversation";
import { toolNamesForLog, type CallRecord } from "./log";
import { parseSse } from "./sse";
import { open } from "./transport";

export const CHAT_PATH = "/ide/v1/chat/completions";

export interface ChatHandlers {
  /** The first event of the answer arrived: the server has read the request. */
  onFirstEvent(): void;
  /** A piece of the answer's text, in order. */
  onText(delta: string): void;
}

export interface ChatResult {
  outcome: "complete" | "stopped" | "failed";
  /** Whether the first event had arrived when the call ended. */
  phase: "reading" | "answering";
  code?: MachineCode | undefined;
  overflow?: OverflowNumbers | undefined;
  status?: number | undefined;
  finish?: string | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  durationMs: number;
  firstMs?: number | undefined;
  /** The tool calls of the answer, complete, in the order of their index (Lot P0b). */
  toolCalls?: RawToolCall[] | undefined;
}

type Loose = Record<string, unknown>;

/** The longest call id and tool name kept from the stream; longer ones are cut. */
const MAX_CALL_FIELD_CHARS = 256;

/** One piece of a tool call in a stream chunk (the server sends whole calls; split ones are joined). */
export interface ToolCallDelta {
  index: number;
  id: string | undefined;
  name: string | undefined;
  arguments: string;
}

/** The tool call pieces a stream chunk carries, as the contract's section 3 describes them. */
export function readToolCallDeltas(value: unknown): ToolCallDelta[] {
  const record = asRecord(value);
  const choice = Array.isArray(record?.["choices"]) ? asRecord(record["choices"][0]) : undefined;
  const calls = asRecord(choice?.["delta"])?.["tool_calls"];
  if (!Array.isArray(calls)) {
    return [];
  }
  const out: ToolCallDelta[] = [];
  calls.forEach((item: unknown, position: number) => {
    const call = asRecord(item);
    if (call === undefined) {
      return;
    }
    const fn = asRecord(call["function"]);
    const id = call["id"];
    const name = fn?.["name"];
    const args = fn?.["arguments"];
    out.push({
      index: count(call["index"]) ?? position,
      id: typeof id === "string" ? id.slice(0, MAX_CALL_FIELD_CHARS) : undefined,
      name: typeof name === "string" ? name.slice(0, MAX_CALL_FIELD_CHARS) : undefined,
      arguments: typeof args === "string" ? args : "",
    });
  });
  return out;
}

/** Joins the pieces of the tool calls by index, keeping the first id and name of each. */
export class ToolCallCollector {
  private readonly calls = new Map<number, RawToolCall>();

  add(deltas: readonly ToolCallDelta[]): void {
    for (const delta of deltas) {
      const call = this.calls.get(delta.index) ?? { id: "", name: "", arguments: "" };
      if (call.id === "" && delta.id !== undefined) {
        call.id = delta.id;
      }
      if (call.name === "" && delta.name !== undefined) {
        call.name = delta.name;
      }
      call.arguments += delta.arguments;
      this.calls.set(delta.index, call);
    }
  }

  /** The complete calls; a call without an id gets one from its index. */
  done(): RawToolCall[] {
    return [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, call]) => ({ ...call, id: call.id === "" ? `call_${index}` : call.id }));
  }
}

function asRecord(value: unknown): Loose | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Loose)
    : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** What one stream chunk carries for a plain chat: text, a finish reason, usage. */
export function readChunk(value: unknown): {
  text: string;
  finish: string | undefined;
  usage: { prompt: number | undefined; completion: number | undefined } | undefined;
} {
  const record = asRecord(value);
  const choice = Array.isArray(record?.["choices"]) ? asRecord(record["choices"][0]) : undefined;
  const delta = asRecord(choice?.["delta"]);
  const content = delta?.["content"];
  const finish = choice?.["finish_reason"];
  const usage = asRecord(record?.["usage"]);
  return {
    text: typeof content === "string" ? content : "",
    finish: typeof finish === "string" && /^[a-z_]{1,32}$/.test(finish) ? finish : undefined,
    usage:
      usage === undefined
        ? undefined
        : { prompt: count(usage["prompt_tokens"]), completion: count(usage["completion_tokens"]) },
  };
}

/** Sends the body once and streams the answer. Never throws: the outcome says what happened. */
export async function streamChat(
  options: ClientOptions,
  body: ChatBody,
  handlers: ChatHandlers,
  signal: AbortSignal,
  log: (record: CallRecord) => void,
  clock: () => number = Date.now,
): Promise<ChatResult> {
  const started = clock();
  const record: CallRecord = { call: "chat", alias: body.model, durationMs: 0 };
  const result: ChatResult = { outcome: "complete", phase: "reading", durationMs: 0 };
  const collector = new ToolCallCollector();
  try {
    const reply = await open(options, {
      method: "POST",
      path: CHAT_PATH,
      body: JSON.stringify(body),
      accept: "text/event-stream",
      signal,
    });
    result.status = reply.status;
    if (reply.status < 200 || reply.status >= 300) {
      throw failureFromResponse(reply.status, await reply.text(), "ide");
    }
    try {
      for await (const event of parseSse(reply.chunks())) {
        if (result.phase === "reading") {
          result.phase = "answering";
          result.firstMs = clock() - started;
          handlers.onFirstEvent();
        }
        if (event.kind === "error") {
          throw new CabinetError(event.code);
        }
        if (event.kind === "done") {
          break;
        }
        const piece = readChunk(event.value);
        if (piece.text !== "") {
          handlers.onText(piece.text);
        }
        collector.add(readToolCallDeltas(event.value));
        result.finish = piece.finish ?? result.finish;
        if (piece.usage !== undefined) {
          result.promptTokens = piece.usage.prompt;
          result.completionTokens = piece.usage.completion;
        }
      }
    } catch (error) {
      // A connection that drops after the answer started is a stream that stopped.
      if (error instanceof CabinetError && error.code === "unreachable") {
        throw new CabinetError("stream_truncated");
      }
      throw error;
    } finally {
      if (signal.aborted) {
        reply.destroy();
      }
    }
    if (signal.aborted) {
      throw new CabinetError("cancelled");
    }
  } catch (error) {
    const code = signal.aborted ? "cancelled" : codeOf(error);
    result.outcome = code === "cancelled" ? "stopped" : "failed";
    result.code = code;
    if (error instanceof CabinetError && error.overflow !== undefined && code !== "cancelled") {
      result.overflow = error.overflow;
    }
  }
  const calls = collector.done();
  if (calls.length > 0 && result.outcome === "complete") {
    result.toolCalls = calls;
    record.toolCalls = calls.length;
    record.tools = toolNamesForLog(calls.map((call) => call.name));
  }
  result.durationMs = clock() - started;
  record.durationMs = result.durationMs;
  record.status = result.status;
  record.promptTokens = result.promptTokens;
  record.completionTokens = result.completionTokens;
  record.firstMs = result.firstMs;
  record.code = result.code;
  log(record);
  return result;
}
