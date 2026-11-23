/**
 * The messages between the chat panel's webview and the extension. Pure.
 * Every message from the webview is validated here (type, fields, lengths) before anything acts on
 * it; a message of any other shape is dropped and only counted, never echoed or logged.
 * The messages to the webview are typed only: the extension builds them itself.
 */
import type { Block } from "./render";

/** The longest message the panel accepts from the user, in characters. */
export const MAX_MESSAGE_CHARS = 400_000;
/** The longest draft the extension keeps for a webview that is hidden and shown again. */
export const MAX_DRAFT_CHARS = MAX_MESSAGE_CHARS;
/** A conversation id, as the store creates it. */
export const CONVERSATION_ID_PATTERN = /^[a-z0-9]{6,16}-[a-f0-9]{8}$/;
/** A model alias, as the contract allows it. */
export const ALIAS_PATTERN = /^[A-Za-z0-9_.:/-]{1,128}$/;

export type WebviewMessage =
  | { type: "ready" }
  | { type: "send"; text: string }
  | { type: "stop" }
  | { type: "draft"; text: string }
  | { type: "newConversation" }
  | { type: "openConversation"; id: string }
  | { type: "deleteConversation"; id: string }
  | { type: "selectModel"; model: string };

const NO_FIELDS = new Set(["ready", "stop", "newConversation"]);

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(record);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

function boundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

/** The message, or `undefined` when it does not have exactly one of the expected shapes. */
export function parseWebviewMessage(value: unknown): WebviewMessage | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const type = record["type"];
  if (typeof type !== "string") {
    return undefined;
  }
  if (NO_FIELDS.has(type)) {
    return exactKeys(record, ["type"]) ? ({ type } as WebviewMessage) : undefined;
  }
  switch (type) {
    case "send": {
      const text = record["text"];
      return exactKeys(record, ["type", "text"]) &&
        boundedText(text, 1, MAX_MESSAGE_CHARS) &&
        text.trim() !== ""
        ? { type, text }
        : undefined;
    }
    case "draft": {
      const text = record["text"];
      return exactKeys(record, ["type", "text"]) && boundedText(text, 0, MAX_DRAFT_CHARS)
        ? { type, text }
        : undefined;
    }
    case "openConversation":
    case "deleteConversation": {
      const id = record["id"];
      return exactKeys(record, ["type", "id"]) &&
        typeof id === "string" &&
        CONVERSATION_ID_PATTERN.test(id)
        ? { type, id }
        : undefined;
    }
    case "selectModel": {
      const model = record["model"];
      return exactKeys(record, ["type", "model"]) &&
        typeof model === "string" &&
        ALIAS_PATTERN.test(model)
        ? { type, model }
        : undefined;
    }
    default:
      return undefined;
  }
}

/** What a stop or an end left on an answer, for the note under it. */
export type AnswerNote =
  "none" | "stoppedReading" | "stoppedAnswering" | "interrupted" | "lengthReached" | "failed";

/** One turn as the webview draws it: the user's text as it was typed, an answer as blocks. */
export type ViewTurn =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      model: string;
      blocks: Block[];
      pending: boolean;
      note: AnswerNote;
      /** The sentence of a failure, from `messages.ts`. */
      failure: string | undefined;
    };

export interface ViewConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export type Phase = "idle" | "reading" | "answering";

export interface ViewState {
  conversationId: string | undefined;
  turns: ViewTurn[];
  phase: Phase;
  /** When the open request started (milliseconds since the epoch), for the elapsed time shown. */
  since: number | undefined;
  models: string[];
  model: string | undefined;
  history: ViewConversationSummary[];
  /** A sentence about the connection or the store, shown above the input; `undefined` for none. */
  notice: string | undefined;
  /** Text to put back in the input (a redrawn view, a refused send); `undefined` leaves it. */
  draft: string | undefined;
}

export type HostMessage =
  | { type: "labels"; labels: Record<string, string>; maxChars: number; tooLong: string }
  | { type: "state"; state: ViewState }
  | { type: "answer"; index: number; turn: ViewTurn; phase: Phase };
