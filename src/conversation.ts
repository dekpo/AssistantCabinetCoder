/**
 * One conversation of the chat panel: its turns, the request body built from them, and the rules
 * of one request at a time. Pure: no clock, no disk, no network (the caller passes the time).
 * A plain chat sends the user's and the model's turns only; the agent loop (Lot P0b) adds a short
 * system prompt, the tool definitions and the steps taken with tools (`agentRequestBody`).
 */
import { isMachineCode, type MachineCode, type OverflowNumbers } from "./codes";
import type { AnswerNote } from "./protocol";

/** The phase of one request to the model: before or after the first event of its answer. */
export type RequestPhase = "reading" | "answering";

/** How an answer ended. `pending` is an answer still coming (or cut off by a closed window). */
export type AnswerState = "pending" | "complete" | "stopped" | "failed" | "interrupted";

export interface UserTurn {
  role: "user";
  text: string;
  at: number;
}

export interface AssistantTurn {
  role: "assistant";
  text: string;
  at: number;
  model: string;
  state: AnswerState;
  /** For a stopped answer: whether a word had arrived when the stop came. */
  stoppedWhile?: "reading" | "answering";
  /** For a failed answer: the machine code (the sentence is chosen when it is shown). */
  code?: MachineCode;
  overflow?: OverflowNumbers;
  /** The finish reason the server gave, when it is not a plain stop. */
  finish?: "length";
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  firstMs?: number;
  /**
   * The steps of the agent loop that ended with tool calls (Lot P0b), in order: each holds the text
   * the model wrote before its calls, and the calls with their results. `text` above is then the
   * text of the step that is still coming or that ended the answer.
   */
  steps?: ToolRound[];
  /** The loop reached its step limit before a final answer. */
  stepLimit?: true;
}

/** One tool call of the model and what became of it. */
export interface ToolStep {
  /** The call's id, as the model gave it. */
  id: string;
  name: string;
  /** The arguments as the model sent them (a JSON text). */
  arguments: string;
  /** The text the model read back; absent while the call has not run. */
  result?: string;
  status?: ToolStepStatus;
  /** The short note the panel shows beside the call (from `messages.ts`). */
  note?: string;
}

export type ToolStepStatus = "done" | "failed" | "accepted" | "rejected" | "stopped";

/** One step of the loop that ended with tool calls. */
export interface ToolRound {
  text: string;
  calls: ToolStep[];
}

export type Turn = UserTurn | AssistantTurn;

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string | undefined;
  turns: Turn[];
}

/** The longest title kept, in characters. */
export const MAX_TITLE_CHARS = 80;

/** The title of a conversation: its first message on one line, shortened. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= MAX_TITLE_CHARS ? line : `${line.slice(0, MAX_TITLE_CHARS - 3)}...`;
}

export function newConversation(id: string, now: number, model: string | undefined): Conversation {
  return { id, title: "", createdAt: now, updatedAt: now, model, turns: [] };
}

/** The open answer, if the last turn is one. */
export function pendingAnswer(conversation: Conversation): AssistantTurn | undefined {
  const last = conversation.turns[conversation.turns.length - 1];
  return last?.role === "assistant" && last.state === "pending" ? last : undefined;
}

/**
 * Adds the user's message and an empty answer to come. Refused (returns `false`) while another
 * answer is open: one request at a time.
 */
export function beginTurn(
  conversation: Conversation,
  text: string,
  model: string,
  now: number,
): boolean {
  if (pendingAnswer(conversation) !== undefined) {
    return false;
  }
  if (conversation.title === "") {
    conversation.title = titleFrom(text);
  }
  conversation.model = model;
  conversation.turns.push({ role: "user", text, at: now });
  conversation.turns.push({ role: "assistant", text: "", at: now, model, state: "pending" });
  conversation.updatedAt = now;
  return true;
}

export interface RequestToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type RequestMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "system"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: RequestToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ChatBody {
  model: string;
  messages: RequestMessage[];
  stream: true;
  stream_options: { include_usage: true };
  /** The tool definitions, when the panel's tools are on (Lot P0b). */
  tools?: readonly object[];
}

/** The messages of the steps that ended with tool calls: each step's calls, then their results. */
function roundMessages(rounds: readonly ToolRound[]): RequestMessage[] {
  const messages: RequestMessage[] = [];
  for (const round of rounds) {
    messages.push({
      role: "assistant",
      content: round.text === "" ? null : round.text,
      tool_calls: round.calls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    });
    for (const call of round.calls) {
      messages.push({ role: "tool", tool_call_id: call.id, content: call.result ?? "" });
    }
  }
  return messages;
}

/**
 * The request body for the open answer: every user turn, and every earlier answer that holds text
 * (a stopped answer's words included, so the model sees what it said). The open answer is left out,
 * except the steps it already took with tools, which the next step of the loop needs.
 */
export function requestBody(conversation: Conversation, model: string): ChatBody {
  const messages: RequestMessage[] = [];
  for (const turn of conversation.turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
      continue;
    }
    messages.push(...roundMessages(turn.steps ?? []));
    if (turn.state !== "pending" && turn.text !== "") {
      messages.push({ role: "assistant", content: turn.text });
    }
  }
  return { model, messages, stream: true, stream_options: { include_usage: true } };
}

/** The request body of the agent loop: the system prompt first, and the tools. */
export function agentRequestBody(
  conversation: Conversation,
  model: string,
  systemPrompt: string,
  tools: readonly object[],
): ChatBody {
  const body = requestBody(conversation, model);
  body.messages.unshift({ role: "system", content: systemPrompt });
  body.tools = tools;
  return body;
}

/** A tool call as the stream delivered it: its id, its name and its arguments' text. */
export interface RawToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * The open answer's step ended with tool calls: its text so far and the calls become a step, and
 * the text of the next step starts empty. Returns the new step's calls.
 */
export function recordCalls(conversation: Conversation, calls: readonly RawToolCall[]): ToolStep[] {
  const answer = pendingAnswer(conversation);
  if (answer === undefined) {
    return [];
  }
  const steps = calls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments }));
  answer.steps = [...(answer.steps ?? []), { text: answer.text, calls: steps }];
  answer.text = "";
  return steps;
}

/** A call that will never run (the request was stopped) gets the result that says so. */
export function closeOpenCalls(conversation: Conversation, result: string, note: string): void {
  const answer = pendingAnswer(conversation);
  for (const round of answer?.steps ?? []) {
    for (const call of round.calls) {
      if (call.result === undefined) {
        call.result = result;
        call.status = "stopped";
        call.note = note;
      }
    }
  }
}

export interface AnswerEnd {
  outcome: "complete" | "stopped" | "failed";
  /** The phase the request was in when it ended (for a stop: before or after the first word). */
  phase: RequestPhase;
  code?: MachineCode | undefined;
  overflow?: OverflowNumbers | undefined;
  finish?: string | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  durationMs?: number | undefined;
  firstMs?: number | undefined;
  /** The agent loop reached its step limit (Lot P0b). */
  stepLimit?: boolean | undefined;
}

/** Closes the open answer. The words already received stay, whatever the outcome. */
export function finishAnswer(conversation: Conversation, end: AnswerEnd, now: number): void {
  const answer = pendingAnswer(conversation);
  if (answer === undefined) {
    return;
  }
  answer.state = end.outcome;
  if (end.outcome === "stopped") {
    answer.stoppedWhile = end.phase;
  }
  if (end.outcome === "failed" && end.code !== undefined && isMachineCode(end.code)) {
    answer.code = end.code;
    if (end.overflow !== undefined) {
      answer.overflow = end.overflow;
    }
  }
  if (end.finish === "length") {
    answer.finish = "length";
  }
  if (end.promptTokens !== undefined) {
    answer.promptTokens = end.promptTokens;
  }
  if (end.completionTokens !== undefined) {
    answer.completionTokens = end.completionTokens;
  }
  if (end.durationMs !== undefined) {
    answer.durationMs = end.durationMs;
  }
  if (end.firstMs !== undefined) {
    answer.firstMs = end.firstMs;
  }
  if (end.stepLimit === true) {
    answer.stepLimit = true;
  }
  conversation.updatedAt = now;
}

/** An answer left open by a window that closed: it is marked interrupted when read again. */
export function closeInterrupted(conversation: Conversation): boolean {
  let changed = false;
  for (const turn of conversation.turns) {
    if (turn.role === "assistant" && turn.state === "pending") {
      turn.state = "interrupted";
      changed = true;
    }
  }
  return changed;
}

/** The note under an answer: which stop sentence it gives, or why it ended early. */
export function noteOf(turn: AssistantTurn): AnswerNote {
  switch (turn.state) {
    case "stopped":
      return turn.stoppedWhile === "reading" ? "stoppedReading" : "stoppedAnswering";
    case "interrupted":
      return "interrupted";
    case "failed":
      return "failed";
    default:
      return turn.stepLimit === true
        ? "stepLimit"
        : turn.finish === "length"
          ? "lengthReached"
          : "none";
  }
}

/** The phase of a request: `reading` until the first event of the answer, then `answering`. */
export function phaseAfter(firstEventSeen: boolean): RequestPhase {
  return firstEventSeen ? "answering" : "reading";
}
