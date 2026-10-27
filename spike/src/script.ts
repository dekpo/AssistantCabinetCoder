export const PLAIN_SENTENCE = "Spike plain answer.";
export const CLOSING_SENTENCE = "Spike closing answer.";

export interface ToolInfo {
  readonly name: string;
  readonly inputSchema?: object | undefined;
}

export type Reply =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "toolCall"; readonly name: string; readonly input: object };

export interface ReplyInput {
  readonly tools: readonly ToolInfo[];
  readonly lastIsToolResult: boolean;
  /** Read in memory only to look for one keyword; never logged. */
  readonly lastUserText: string;
}

/** The smallest valid value for each required property of a JSON schema. */
export function minimalArguments(schema: object | undefined): object {
  const out: Record<string, unknown> = {};
  const s = schema as { properties?: Record<string, { type?: unknown }>; required?: unknown };
  if (!s || !Array.isArray(s.required)) {
    return out;
  }
  for (const key of s.required) {
    if (typeof key !== "string") {
      continue;
    }
    const type = s.properties?.[key]?.type;
    switch (type) {
      case "number":
      case "integer":
        out[key] = 1;
        break;
      case "boolean":
        out[key] = false;
        break;
      case "array":
        out[key] = [];
        break;
      case "object":
        out[key] = {};
        break;
      default:
        out[key] = "spike";
    }
  }
  return out;
}

/**
 * The scripted answer: a closing sentence after a tool result; otherwise a call to the tool the user
 * named (`spike_image`) or to the first tool whose name contains `read`; otherwise a fixed sentence.
 */
export function pickReply(input: ReplyInput): Reply {
  if (input.lastIsToolResult) {
    return { kind: "text", text: CLOSING_SENTENCE };
  }
  if (input.tools.length > 0) {
    const named = input.lastUserText.includes("spike_image")
      ? input.tools.find((t) => t.name.includes("spike_image"))
      : undefined;
    const target = named ?? input.tools.find((t) => t.name.toLowerCase().includes("read"));
    if (target) {
      return { kind: "toolCall", name: target.name, input: minimalArguments(target.inputSchema) };
    }
  }
  return { kind: "text", text: PLAIN_SENTENCE };
}
