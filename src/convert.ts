/**
 * The pure part of the chat call: the editor's messages become the server's OpenAI-shaped request,
 * and the server's stream chunks become the editor's parts. It imports nothing from the editor, so
 * the editor's classes are recognised by their shape (a text part has a string `value`, a tool call
 * has `callId`, `name` and `input`, a tool result has `callId` and a `content` list, a data part has
 * `mimeType` and `data`) and roles arrive as names. Nothing here writes or logs the content it
 * handles; a failure carries a reason, never text.
 */
import type { MachineCode } from "./codes";
import { CONVERSION_NOTES } from "./messages";

/** The names the server accepts for a tool (docs/IDE-CONTRACT.md section 3). */
export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.:/-]{1,128}$/;

export const IMAGE_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** What the editor hands over: a role name (never a number) and its parts. */
export interface InputMessage {
  readonly role: string;
  readonly content: readonly unknown[];
}

export interface ToolDefinition {
  readonly name: string;
  readonly description?: string | undefined;
  readonly inputSchema?: object | undefined;
}

/** What the extension reports to the editor, as plain objects the adapter turns into its classes. */
export type ChatPart =
  | { kind: "text"; value: string }
  | { kind: "toolCall"; callId: string; name: string; input: object };

export type ConvertReason =
  | "unknown_role"
  | "unsupported_part"
  | "image_without_vision"
  | "bad_tool_call"
  | "bad_tool_arguments";

/** The machine code each refusal is logged under. */
const REASON_CODES: Record<ConvertReason, MachineCode> = {
  unknown_role: "invalid_request",
  unsupported_part: "invalid_request",
  image_without_vision: "provider_capability_unsupported",
  bad_tool_call: "bad_response",
  bad_tool_arguments: "bad_response",
};

/** A refusal made before sending, or a model answer that cannot be used. `message` is the reason. */
export class ConvertError extends Error {
  readonly reason: ConvertReason;
  readonly code: MachineCode;
  /** Set only for a name that is in the request's own tool list and has a valid shape. */
  readonly toolName: string | undefined;

  constructor(reason: ConvertReason, toolName?: string) {
    super(reason);
    this.name = "ConvertError";
    this.reason = reason;
    this.code = REASON_CODES[reason];
    this.toolName = toolName;
  }
}

export type OpenAiContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OpenAiContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface OpenAiTool {
  type: "function";
  function: { name: string; description?: string; parameters?: object };
}

export interface ChatRequestBody {
  model: string;
  stream: true;
  stream_options: { include_usage: true };
  messages: OpenAiMessage[];
  tools?: OpenAiTool[];
  tool_choice?: "auto" | "required";
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
}

export interface BuildInput {
  /** The model alias. */
  alias: string;
  /** Whether the model reports vision: an image for a model that does not is refused. */
  vision: boolean;
  messages: readonly InputMessage[];
  tools?: readonly ToolDefinition[] | undefined;
  toolMode: "auto" | "required";
  modelOptions?: Readonly<Record<string, unknown>> | undefined;
}

export interface BuiltRequest {
  body: ChatRequestBody;
  /** Tools left out because their name is not one the server accepts. */
  skippedTools: number;
  /** The names of the tools that were sent. */
  toolNames: ReadonlySet<string>;
}

type Loose = Record<string, unknown>;

type Classified =
  | { kind: "text"; value: string }
  | { kind: "toolCall"; callId: string; name: string; input: unknown }
  | { kind: "toolResult"; callId: string; content: readonly unknown[] }
  | { kind: "data"; mimeType: string; data: ArrayBufferView }
  | { kind: "other" };

function classify(part: unknown): Classified {
  if (typeof part !== "object" || part === null) {
    return { kind: "other" };
  }
  const record = part as Loose;
  const callId = record["callId"];
  if (typeof callId === "string" && Array.isArray(record["content"])) {
    return { kind: "toolResult", callId, content: record["content"] as unknown[] };
  }
  if (typeof callId === "string" && typeof record["name"] === "string" && "input" in record) {
    return { kind: "toolCall", callId, name: record["name"], input: record["input"] };
  }
  const data = record["data"];
  if (typeof record["mimeType"] === "string" && ArrayBuffer.isView(data)) {
    return { kind: "data", mimeType: record["mimeType"], data };
  }
  if (typeof record["value"] === "string") {
    return { kind: "text", value: record["value"] };
  }
  return { kind: "other" };
}

function imageUrl(mimeType: string, data: ArrayBufferView): string {
  const base64 = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

function isImage(mimeType: string, data: ArrayBufferView): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType.toLowerCase()) && data.byteLength > 0;
}

function serialise(input: unknown): string {
  try {
    return JSON.stringify(input ?? {}) ?? "{}";
  } catch {
    return "{}";
  }
}

function safeToolName(name: string | undefined): string | undefined {
  return name !== undefined && TOOL_NAME_PATTERN.test(name) ? name : undefined;
}

/** The name each tool call of the history was made with, to name the tool of an image result. */
function toolNamesByCall(messages: readonly InputMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    for (const part of message.content) {
      const found = classify(part);
      if (found.kind === "toolCall") {
        names.set(found.callId, found.name);
      }
    }
  }
  return names;
}

function textMessage(role: "user", parts: OpenAiContentPart[]): OpenAiMessage {
  const [only] = parts;
  return only !== undefined && parts.length === 1 && only.type === "text"
    ? { role, content: only.text }
    : { role, content: parts };
}

function convertUser(
  message: InputMessage,
  vision: boolean,
  names: ReadonlyMap<string, string>,
  out: OpenAiMessage[],
): void {
  const inline: OpenAiContentPart[] = [];
  const results: { callId: string; content: readonly unknown[] }[] = [];
  for (const part of message.content) {
    const found = classify(part);
    if (found.kind === "text") {
      inline.push({ type: "text", text: found.value });
    } else if (found.kind === "data" && isImage(found.mimeType, found.data)) {
      if (!vision) {
        throw new ConvertError("image_without_vision");
      }
      inline.push({
        type: "image_url",
        image_url: { url: imageUrl(found.mimeType.toLowerCase(), found.data) },
      });
    } else if (found.kind === "toolResult") {
      results.push(found);
    } else {
      throw new ConvertError("unsupported_part");
    }
  }

  const imageMessage: OpenAiContentPart[] = [];
  for (const result of results) {
    const texts: string[] = [];
    const images: OpenAiContentPart[] = [];
    for (const inner of result.content) {
      const found = classify(inner);
      if (found.kind === "text") {
        texts.push(found.value);
      } else if (found.kind === "data" && isImage(found.mimeType, found.data)) {
        if (!vision) {
          throw new ConvertError("image_without_vision");
        }
        images.push({
          type: "image_url",
          image_url: { url: imageUrl(found.mimeType.toLowerCase(), found.data) },
        });
      } else {
        texts.push(CONVERSION_NOTES.resultPartLeftOut);
      }
    }
    if (texts.length === 0) {
      texts.push(images.length > 0 ? CONVERSION_NOTES.resultIsImage : CONVERSION_NOTES.resultEmpty);
    }
    out.push({ role: "tool", tool_call_id: result.callId, content: texts.join("\n") });
    if (images.length > 0) {
      imageMessage.push(
        {
          type: "text",
          text: CONVERSION_NOTES.imageFromTool(safeToolName(names.get(result.callId))),
        },
        ...images,
      );
    }
  }
  if (imageMessage.length > 0) {
    out.push({ role: "user", content: imageMessage });
  }
  if (inline.length > 0) {
    out.push(textMessage("user", inline));
  }
}

function convertAssistant(message: InputMessage, out: OpenAiMessage[]): void {
  let text = "";
  const calls: OpenAiToolCall[] = [];
  for (const part of message.content) {
    const found = classify(part);
    if (found.kind === "text") {
      text += found.value;
    } else if (found.kind === "toolCall") {
      calls.push({
        id: found.callId,
        type: "function",
        function: { name: found.name, arguments: serialise(found.input) },
      });
    } else {
      throw new ConvertError("unsupported_part");
    }
  }
  if (calls.length > 0) {
    out.push({ role: "assistant", content: text === "" ? null : text, tool_calls: calls });
  } else if (text !== "") {
    out.push({ role: "assistant", content: text });
  }
}

function convertSystem(message: InputMessage, out: OpenAiMessage[]): void {
  const texts: string[] = [];
  for (const part of message.content) {
    const found = classify(part);
    if (found.kind !== "text") {
      throw new ConvertError("unsupported_part");
    }
    texts.push(found.value);
  }
  if (texts.length > 0) {
    out.push({ role: "system", content: texts.join("\n") });
  }
}

/** Editor messages to server messages, in order. Refuses what it cannot carry. */
export function convertMessages(
  messages: readonly InputMessage[],
  vision: boolean,
): OpenAiMessage[] {
  const names = toolNamesByCall(messages);
  const out: OpenAiMessage[] = [];
  for (const message of messages) {
    switch (message.role) {
      case "System":
        convertSystem(message, out);
        break;
      case "User":
        convertUser(message, vision, names, out);
        break;
      case "Assistant":
        convertAssistant(message, out);
        break;
      default:
        throw new ConvertError("unknown_role");
    }
  }
  return out;
}

function convertTools(tools: readonly ToolDefinition[] | undefined): {
  tools: OpenAiTool[];
  skipped: number;
} {
  const out: OpenAiTool[] = [];
  let skipped = 0;
  for (const tool of tools ?? []) {
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      skipped += 1;
      continue;
    }
    const fn: OpenAiTool["function"] = { name: tool.name };
    if (typeof tool.description === "string" && tool.description !== "") {
      fn.description = tool.description;
    }
    if (typeof tool.inputSchema === "object" && tool.inputSchema !== null) {
      fn.parameters = tool.inputSchema;
    }
    out.push({ type: "function", function: fn });
  }
  return { tools: out, skipped };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stopOption(value: unknown): string | string[] | undefined {
  if (typeof value === "string" && value !== "") {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && item !== "");
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

/** The whole request body of one chat call. `max_tokens` is never sent. */
export function buildChatRequest(input: BuildInput): BuiltRequest {
  const messages = convertMessages(input.messages, input.vision);
  const { tools, skipped } = convertTools(input.tools);
  const body: ChatRequestBody = {
    model: input.alias,
    stream: true,
    stream_options: { include_usage: true },
    messages,
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = input.toolMode === "required" ? "required" : "auto";
  }
  const options = input.modelOptions ?? {};
  const temperature = finiteNumber(options["temperature"]);
  if (temperature !== undefined) {
    body.temperature = temperature;
  }
  const topP = finiteNumber(options["top_p"]);
  if (topP !== undefined) {
    body.top_p = topP;
  }
  const stop = stopOption(options["stop"]);
  if (stop !== undefined) {
    body.stop = stop;
  }
  return {
    body,
    skippedTools: skipped,
    toolNames: new Set(tools.map((tool) => tool.function.name)),
  };
}

function asRecord(value: unknown): Loose | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Loose)
    : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

interface PendingCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Reads the chunks of one answer: text is reported at once, tool calls are accumulated by `index`
 * (the server sends them whole, a split call is still accepted) and reported once the answer says
 * it is finished or the stream ends.
 */
export class ResponseReader {
  private readonly pending = new Map<number, PendingCall>();
  private reportedCalls = 0;
  private prompt: number | undefined;
  private completion: number | undefined;

  constructor(private readonly toolNames: ReadonlySet<string>) {}

  get toolCalls(): number {
    return this.reportedCalls;
  }

  get promptTokens(): number | undefined {
    return this.prompt;
  }

  get completionTokens(): number | undefined {
    return this.completion;
  }

  /** One parsed `data:` chunk. Returns what can be reported now. */
  accept(value: unknown): ChatPart[] {
    const chunk = asRecord(value);
    if (chunk === undefined) {
      return [];
    }
    const usage = asRecord(chunk["usage"]);
    if (usage !== undefined) {
      this.prompt = count(usage["prompt_tokens"]) ?? this.prompt;
      this.completion = count(usage["completion_tokens"]) ?? this.completion;
    }
    const choices = chunk["choices"];
    const choice = Array.isArray(choices) ? asRecord(choices[0]) : undefined;
    if (choice === undefined) {
      return [];
    }
    const parts: ChatPart[] = [];
    const delta = asRecord(choice["delta"]);
    if (delta !== undefined) {
      if (typeof delta["content"] === "string" && delta["content"] !== "") {
        parts.push({ kind: "text", value: delta["content"] });
      }
      if (Array.isArray(delta["tool_calls"])) {
        delta["tool_calls"].forEach((item: unknown, position: number) => this.add(item, position));
      }
    }
    if (typeof choice["finish_reason"] === "string") {
      parts.push(...this.flush());
    }
    return parts;
  }

  /** What is still waiting when the stream ends. */
  finish(): ChatPart[] {
    return this.flush();
  }

  private add(item: unknown, position: number): void {
    const call = asRecord(item);
    if (call === undefined) {
      return;
    }
    const index = count(call["index"]) ?? position;
    const entry = this.pending.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof call["id"] === "string" && entry.id === "") {
      entry.id = call["id"];
    }
    const fn = asRecord(call["function"]);
    if (fn !== undefined) {
      if (typeof fn["name"] === "string" && entry.name === "") {
        entry.name = fn["name"];
      }
      if (typeof fn["arguments"] === "string") {
        entry.arguments += fn["arguments"];
      }
    }
    this.pending.set(index, entry);
  }

  private flush(): ChatPart[] {
    const parts: ChatPart[] = [];
    const ordered = [...this.pending.entries()].sort(([a], [b]) => a - b);
    this.pending.clear();
    for (const [index, call] of ordered) {
      if (call.name === "") {
        throw new ConvertError("bad_tool_call");
      }
      const known = this.toolNames.has(call.name) ? safeToolName(call.name) : undefined;
      this.reportedCalls += 1;
      parts.push({
        kind: "toolCall",
        callId: call.id !== "" ? call.id : `call_${index}`,
        name: call.name,
        input: parseArguments(call.arguments, known),
      });
    }
    return parts;
  }
}

/** The arguments of a call: a JSON object, or empty (meaning no arguments). */
export function parseArguments(text: string, toolName: string | undefined): object {
  if (text.trim() === "") {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConvertError("bad_tool_arguments", toolName);
  }
  const record = asRecord(parsed);
  if (record === undefined) {
    throw new ConvertError("bad_tool_arguments", toolName);
  }
  return record;
}
