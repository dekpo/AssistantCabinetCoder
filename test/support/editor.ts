/**
 * Plain stand-ins for the editor's message parts, with the shape the real classes have, so the
 * conversion can be tested without the editor. Also reads the JSON fixtures of the conversion.
 */
import type { InputMessage, ToolDefinition } from "../../src/convert";

export const text = (value: string) => ({ value });

export const image = (mimeType = "image/png", bytes: number[] = [0x89, 0x50, 0x4e, 0x47]) => ({
  mimeType,
  data: Uint8Array.from(bytes),
});

export const toolCall = (callId: string, name: string, input: object) => ({
  callId,
  name,
  input,
});

export const toolResult = (callId: string, content: unknown[]) => ({ callId, content });

export const message = (role: string, ...content: unknown[]): InputMessage => ({
  role,
  content,
});

/** The three messages every mode of the editor starts a chat with. */
export const opening = (typed = "hello"): InputMessage[] => [
  message("System", text("You are a coding assistant.")),
  message("User", text("Environment: windows.")),
  message("User", text(typed)),
];

export const sampleTools: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a file",
    inputSchema: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  { name: "list_dir", description: "List a folder" },
];

interface FixturePart {
  type: "text" | "data" | "toolCall" | "toolResult";
  value?: string;
  mimeType?: string;
  base64?: string;
  callId?: string;
  name?: string;
  input?: object;
  content?: FixturePart[];
}

export interface ConversionFixture {
  description: string;
  alias: string;
  vision: boolean;
  toolMode: "auto" | "required";
  tools: ToolDefinition[];
  messages: { role: string; content: FixturePart[] }[];
  expected: unknown;
}

function fromFixturePart(part: FixturePart): unknown {
  switch (part.type) {
    case "text":
      return text(part.value ?? "");
    case "data":
      return {
        mimeType: part.mimeType ?? "",
        data: Uint8Array.from(Buffer.from(part.base64 ?? "", "base64")),
      };
    case "toolCall":
      return toolCall(part.callId ?? "", part.name ?? "", part.input ?? {});
    case "toolResult":
      return toolResult(part.callId ?? "", (part.content ?? []).map(fromFixturePart));
  }
}

export function fixtureMessages(fixture: ConversionFixture): InputMessage[] {
  return fixture.messages.map((entry) => ({
    role: entry.role,
    content: entry.content.map(fromFixturePart),
  }));
}
