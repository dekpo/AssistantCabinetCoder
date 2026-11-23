/**
 * The content-free log: one line per call, built from a closed list of fields. A value that does
 * not have the expected shape is dropped, so no text can reach the output channel through here.
 */
import { isMachineCode, type MachineCode } from "./codes";

export const CALL_NAMES = [
  "health",
  "models",
  "chat",
  "files",
  "webview",
  "store",
  "tool",
] as const;
export type CallName = (typeof CALL_NAMES)[number];

/**
 * The names a log line may carry for a tool of the panel (Lot P0b): the extension's own four, and
 * `other` for any name a model invents (that name is never written).
 */
export const LOG_TOOL_NAMES = [
  "read_file",
  "list_files",
  "search_text",
  "propose_edit",
  "other",
] as const;
export type LogToolName = (typeof LOG_TOOL_NAMES)[number];
/** What became of one tool call. */
export const LOG_TOOL_OUTCOMES = ["done", "failed", "accepted", "rejected", "stopped"] as const;
/** Why a tool call failed: the closed list of `tools.ToolReason`. */
export const LOG_TOOL_REASONS = [
  "unknown_tool",
  "invalid_arguments",
  "no_workspace",
  "invalid_path",
  "outside_workspace",
  "not_found",
  "not_a_file",
  "not_a_folder",
  "too_large",
  "binary",
  "unreadable",
  "text_not_found",
  "text_not_unique",
  "file_missing",
  "file_exists",
  "no_change",
  "file_changed",
  "unsaved_changes",
  "not_applied",
] as const;

/** A tool name as the log may write it: one of the four, else `other`. */
export function toolNamesForLog(names: readonly string[]): LogToolName[] {
  return names.map((name) =>
    (LOG_TOOL_NAMES as readonly string[]).includes(name) && name !== "other"
      ? (name as LogToolName)
      : "other",
  );
}

export interface CallRecord {
  call: CallName;
  status?: number | undefined;
  durationMs: number;
  /** The model alias, when known. */
  alias?: string | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  toolCalls?: number | undefined;
  code?: MachineCode | undefined;
  /** Milliseconds from the start of a chat call to its first event of the answer (the panel). */
  firstMs?: number | undefined;
  /** Messages from the webview dropped because they did not have the expected shape. */
  dropped?: number | undefined;
  /** A Node error code of a failed disk operation of the conversation store, such as `ENOSPC`. */
  detail?: string | undefined;
  /** The step of the panel's agent loop this request is (1, 2, ...). */
  step?: number | undefined;
  /** The names of the tool calls of a chat answer (`toolNamesForLog`). */
  tools?: readonly string[] | undefined;
  /** For `call=tool`: the tool, what became of the call and why it failed. */
  tool?: string | undefined;
  outcome?: string | undefined;
  reason?: string | undefined;
}

function oneOf(value: unknown, list: readonly string[]): string | undefined {
  return typeof value === "string" && list.includes(value) ? value : undefined;
}

const ALIAS_PATTERN = /^[A-Za-z0-9_.:/-]{1,128}$/;
const DETAIL_PATTERN = /^[A-Z0-9_]{1,32}$/;

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** `2026-10-27T10:00:00.000Z call=models status=200 ms=12 code=...`, fields in a fixed order. */
export function formatCallLine(record: CallRecord, now: Date): string {
  const parts: string[] = [now.toISOString()];
  if ((CALL_NAMES as readonly string[]).includes(record.call)) {
    parts.push(`call=${record.call}`);
  }
  const fields: [string, number | undefined][] = [
    ["status", count(record.status)],
    ["ms", count(record.durationMs)],
  ];
  for (const [name, value] of fields) {
    if (value !== undefined) {
      parts.push(`${name}=${value}`);
    }
  }
  if (typeof record.alias === "string" && ALIAS_PATTERN.test(record.alias)) {
    parts.push(`alias=${record.alias}`);
  }
  const tokens: [string, number | undefined][] = [
    ["prompt_tokens", count(record.promptTokens)],
    ["completion_tokens", count(record.completionTokens)],
    ["tool_calls", count(record.toolCalls)],
    ["first_ms", count(record.firstMs)],
    ["dropped", count(record.dropped)],
  ];
  for (const [name, value] of tokens) {
    if (value !== undefined) {
      parts.push(`${name}=${value}`);
    }
  }
  if (isMachineCode(record.code)) {
    parts.push(`code=${record.code}`);
  }
  if (typeof record.detail === "string" && DETAIL_PATTERN.test(record.detail)) {
    parts.push(`detail=${record.detail}`);
  }
  const step = count(record.step);
  if (step !== undefined) {
    parts.push(`step=${step}`);
  }
  if (Array.isArray(record.tools) && record.tools.length > 0) {
    const names = record.tools.map((name) => oneOf(name, LOG_TOOL_NAMES) ?? "other");
    parts.push(`tools=${names.join(",")}`);
  }
  const named: [string, string | undefined][] = [
    ["tool", oneOf(record.tool, LOG_TOOL_NAMES)],
    ["outcome", oneOf(record.outcome, LOG_TOOL_OUTCOMES)],
    ["reason", oneOf(record.reason, LOG_TOOL_REASONS)],
  ];
  for (const [name, value] of named) {
    if (value !== undefined) {
      parts.push(`${name}=${value}`);
    }
  }
  return parts.join(" ");
}

export class CallLog {
  constructor(
    private readonly sink: (line: string) => void,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  record(record: CallRecord): void {
    this.sink(formatCallLine(record, this.clock()));
  }
}
