/** Structure-only description of chat message parts. Nothing here ever returns text content. */

type Loose = Record<string, unknown>;

function isObject(part: unknown): part is Loose {
  return typeof part === "object" && part !== null;
}

export function describePart(part: unknown): string {
  if (!isObject(part)) {
    return `other:${typeof part}`;
  }
  if (typeof part.callId === "string" && Array.isArray(part.content)) {
    return `toolResult[${part.content.map(describePart).join(",")}]`;
  }
  if (typeof part.callId === "string" && typeof part.name === "string" && "input" in part) {
    return "toolCall";
  }
  if (typeof part.mimeType === "string" && part.data instanceof Uint8Array) {
    return `data:${part.mimeType}:${part.data.byteLength}b`;
  }
  if (typeof part.value === "string") {
    return `text:${part.value.length}`;
  }
  return `other:${part.constructor?.name ?? "unknown"}`;
}

export function describeMessage(index: number, role: string, content: readonly unknown[]): string {
  return `msg[${index}] role=${role} parts=[${content.map(describePart).join(", ")}]`;
}

/** Characters of the direct text parts of a message (not those inside tool results). */
export function textChars(content: readonly unknown[]): number {
  let total = 0;
  for (const part of content) {
    if (isObject(part) && typeof part.value === "string" && !("callId" in part)) {
      total += part.value.length;
    }
  }
  return total;
}

export function hasToolResult(content: readonly unknown[]): boolean {
  return content.some((part) => describePart(part).startsWith("toolResult["));
}

/** Joined direct text of a message, for in-memory keyword matching only. */
export function joinedText(content: readonly unknown[]): string {
  const pieces: string[] = [];
  for (const part of content) {
    if (isObject(part) && typeof part.value === "string" && !("callId" in part)) {
      pieces.push(part.value);
    }
  }
  return pieces.join("\n");
}

export function names(items: readonly { readonly name: string }[]): string {
  return items.map((i) => i.name).join(", ");
}
