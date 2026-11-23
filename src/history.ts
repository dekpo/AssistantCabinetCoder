/**
 * The format of the saved conversations of the chat panel (decision D-027). Pure.
 * One JSON file per conversation, and an index of their titles and dates, which is only a cache:
 * it is rebuilt from the conversation files whenever it disagrees with them. Reading is strict: a
 * file of another shape or of a newer format is "unreadable" and is left on disk untouched.
 */
import { isMachineCode, type OverflowNumbers } from "./codes";
import type {
  AnswerState,
  AssistantTurn,
  Conversation,
  ToolRound,
  ToolStep,
  ToolStepStatus,
  Turn,
} from "./conversation";
import { ALIAS_PATTERN, CONVERSATION_ID_PATTERN } from "./protocol";

/**
 * The format written by this version. A file with a higher number is not read. Format 2 (Lot P0b)
 * adds the steps an answer took with tools; a file of format 1 is still read (it has none).
 */
export const HISTORY_FORMAT = 2;
/** The formats this version reads. */
export const READABLE_FORMATS: readonly number[] = [1, 2];
/** The format of the index, which did not change with the conversations' format 2. */
export const INDEX_FORMAT = 1;
/** The longest call id, tool name, arguments' text and note of a saved tool call. */
const MAX_CALL_ID_CHARS = 256;
const MAX_NOTE_CHARS = 200;
const TOOL_STATUSES: readonly ToolStepStatus[] = [
  "done",
  "failed",
  "accepted",
  "rejected",
  "stopped",
];
/** The longest text of one turn that is read back, in characters. */
export const MAX_TURN_CHARS = 16_000_000;

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

const STATES: readonly AnswerState[] = ["pending", "complete", "stopped", "failed", "interrupted"];

type Loose = Record<string, unknown>;

function asRecord(value: unknown): Loose | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Loose)
    : undefined;
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && CONVERSATION_ID_PATTERN.test(value);
}

function isAlias(value: unknown): value is string {
  return typeof value === "string" && ALIAS_PATTERN.test(value);
}

function readOverflow(value: unknown): OverflowNumbers | undefined {
  const record = asRecord(value);
  if (record?.["kind"] === "tokens") {
    const estimatedTokens = record["estimatedTokens"];
    const contextWindow = record["contextWindow"];
    return isCount(estimatedTokens) && isCount(contextWindow)
      ? { kind: "tokens", estimatedTokens, contextWindow }
      : undefined;
  }
  if (record?.["kind"] === "chars") {
    const chars = record["chars"];
    const limit = record["limit"];
    return isCount(chars) && isCount(limit) ? { kind: "chars", chars, limit } : undefined;
  }
  return undefined;
}

function readTurn(value: unknown): Turn | undefined {
  const record = asRecord(value);
  if (record === undefined || !isTime(record["at"]) || !isText(record["text"], MAX_TURN_CHARS)) {
    return undefined;
  }
  const at = record["at"];
  const text = record["text"];
  if (record["role"] === "user") {
    return { role: "user", text, at };
  }
  if (record["role"] !== "assistant" || !isAlias(record["model"])) {
    return undefined;
  }
  const state = STATES.find((candidate) => candidate === record["state"]);
  if (state === undefined) {
    return undefined;
  }
  const turn: AssistantTurn = { role: "assistant", text, at, model: record["model"], state };
  const stoppedWhile = record["stoppedWhile"];
  if (stoppedWhile === "reading" || stoppedWhile === "answering") {
    turn.stoppedWhile = stoppedWhile;
  }
  if (isMachineCode(record["code"])) {
    turn.code = record["code"];
  }
  const overflow = readOverflow(record["overflow"]);
  if (overflow !== undefined) {
    turn.overflow = overflow;
  }
  if (record["finish"] === "length") {
    turn.finish = "length";
  }
  for (const field of ["promptTokens", "completionTokens", "durationMs", "firstMs"] as const) {
    const count = record[field];
    if (isCount(count)) {
      turn[field] = count;
    }
  }
  if (record["stepLimit"] === true) {
    turn.stepLimit = true;
  }
  if (record["steps"] !== undefined) {
    const steps = readSteps(record["steps"]);
    if (steps === undefined) {
      return undefined;
    }
    turn.steps = steps;
  }
  return turn;
}

/** The steps an answer took with tools (format 2), strictly: one wrong field refuses the file. */
function readSteps(value: unknown): ToolRound[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const rounds: ToolRound[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (record === undefined || !isText(record["text"], MAX_TURN_CHARS)) {
      return undefined;
    }
    if (!Array.isArray(record["calls"])) {
      return undefined;
    }
    const calls: ToolStep[] = [];
    for (const entry of record["calls"]) {
      const call = readCall(entry);
      if (call === undefined) {
        return undefined;
      }
      calls.push(call);
    }
    rounds.push({ text: record["text"], calls });
  }
  return rounds;
}

function readCall(value: unknown): ToolStep | undefined {
  const record = asRecord(value);
  if (
    record === undefined ||
    !isText(record["id"], MAX_CALL_ID_CHARS) ||
    !isText(record["name"], MAX_CALL_ID_CHARS) ||
    !isText(record["arguments"], MAX_TURN_CHARS)
  ) {
    return undefined;
  }
  const call: ToolStep = { id: record["id"], name: record["name"], arguments: record["arguments"] };
  const result = record["result"];
  if (result !== undefined) {
    if (!isText(result, MAX_TURN_CHARS)) {
      return undefined;
    }
    call.result = result;
  }
  const status = TOOL_STATUSES.find((candidate) => candidate === record["status"]);
  if (status !== undefined) {
    call.status = status;
  }
  if (isText(record["note"], MAX_NOTE_CHARS)) {
    call.note = record["note"];
  }
  return call;
}

/** The conversation of a file's text, or `undefined` when the file cannot be read as one. */
export function parseConversation(text: string): Conversation | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const record = asRecord(parsed);
  if (
    record === undefined ||
    !READABLE_FORMATS.includes(record["format"] as number) ||
    !isConversationId(record["id"]) ||
    !isText(record["title"], 1000) ||
    !isTime(record["createdAt"]) ||
    !isTime(record["updatedAt"]) ||
    !Array.isArray(record["turns"])
  ) {
    return undefined;
  }
  const model = record["model"];
  if (model !== undefined && model !== null && !isAlias(model)) {
    return undefined;
  }
  const turns: Turn[] = [];
  for (const item of record["turns"]) {
    const turn = readTurn(item);
    if (turn === undefined) {
      return undefined;
    }
    turns.push(turn);
  }
  return {
    id: record["id"],
    title: record["title"],
    createdAt: record["createdAt"],
    updatedAt: record["updatedAt"],
    model: typeof model === "string" ? model : undefined,
    turns,
  };
}

/** The text of a conversation's file. */
export function serializeConversation(conversation: Conversation): string {
  return JSON.stringify({
    format: HISTORY_FORMAT,
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    model: conversation.model ?? null,
    turns: conversation.turns,
  });
}

export function summaryOf(conversation: Conversation): ConversationSummary {
  return { id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt };
}

/** Newest first; a tie is broken by the id, so the order is stable. */
export function sortSummaries(entries: readonly ConversationSummary[]): ConversationSummary[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
}

/** The entries of the index file, or `undefined` when it cannot be read. */
export function parseIndex(text: string): ConversationSummary[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const record = asRecord(parsed);
  if (record?.["format"] !== INDEX_FORMAT || !Array.isArray(record["entries"])) {
    return undefined;
  }
  const entries: ConversationSummary[] = [];
  for (const item of record["entries"]) {
    const entry = asRecord(item);
    if (
      entry === undefined ||
      !isConversationId(entry["id"]) ||
      !isText(entry["title"], 1000) ||
      !isTime(entry["updatedAt"])
    ) {
      return undefined;
    }
    entries.push({ id: entry["id"], title: entry["title"], updatedAt: entry["updatedAt"] });
  }
  return entries;
}

export function serializeIndex(entries: readonly ConversationSummary[]): string {
  return JSON.stringify({ format: INDEX_FORMAT, entries: sortSummaries(entries) });
}
