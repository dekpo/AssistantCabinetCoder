/**
 * The content-free log: one line per call, built from a closed list of fields. A value that does
 * not have the expected shape is dropped, so no text can reach the output channel through here.
 */
import { isMachineCode, type MachineCode } from "./codes";

export const CALL_NAMES = ["health", "models", "chat", "files"] as const;
export type CallName = (typeof CALL_NAMES)[number];

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
}

const ALIAS_PATTERN = /^[A-Za-z0-9_.:/-]{1,128}$/;

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
  ];
  for (const [name, value] of tokens) {
    if (value !== undefined) {
      parts.push(`${name}=${value}`);
    }
  }
  if (isMachineCode(record.code)) {
    parts.push(`code=${record.code}`);
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
