/**
 * Incremental parser of the server's event stream (docs/IDE-CONTRACT.md section 3).
 * Pure. Lines may be split across chunks; `: comment` lines are ignored; `data: [DONE]` ends;
 * a `{"error":...}` event and invalid JSON are typed errors that never carry the payload.
 */
import { StringDecoder } from "node:string_decoder";
import { codeFromEnvelope, type MachineCode } from "./codes";

export type SseEvent =
  { kind: "data"; value: unknown } | { kind: "done" } | { kind: "error"; code: MachineCode };

export class SseParser {
  private buffer = "";
  private dataLines: string[] = [];
  private finished = false;

  /** True once `[DONE]` or an error event was seen: nothing after it is read. */
  get done(): boolean {
    return this.finished;
  }

  push(chunk: string): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.finished) {
      return events;
    }
    this.buffer += chunk;
    for (;;) {
      const end = this.nextLineEnd();
      if (end === undefined) {
        break;
      }
      const line = this.buffer.slice(0, end.index);
      this.buffer = this.buffer.slice(end.index + end.length);
      const event = this.readLine(line);
      if (event !== undefined) {
        events.push(event);
        if (this.finished) {
          break;
        }
      }
    }
    return events;
  }

  /** A trailing event without its blank line is dropped: the caller checks `done`. */
  end(): SseEvent[] {
    this.buffer = "";
    this.dataLines = [];
    return [];
  }

  private nextLineEnd(): { index: number; length: number } | undefined {
    const match = /\r\n|\n|\r/.exec(this.buffer);
    if (match === null) {
      return undefined;
    }
    // A lone CR at the very end may be the first half of a CRLF split across chunks.
    if (match[0] === "\r" && match.index + 1 === this.buffer.length) {
      return undefined;
    }
    return { index: match.index, length: match[0].length };
  }

  private readLine(line: string): SseEvent | undefined {
    if (line === "") {
      return this.dispatch();
    }
    if (line.startsWith(":")) {
      return undefined;
    }
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    if (field !== "data") {
      return undefined;
    }
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    this.dataLines.push(value);
    return undefined;
  }

  private dispatch(): SseEvent | undefined {
    if (this.dataLines.length === 0) {
      return undefined;
    }
    const data = this.dataLines.join("\n");
    this.dataLines = [];
    if (data === "[DONE]") {
      this.finished = true;
      return { kind: "done" };
    }
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      this.finished = true;
      return { kind: "error", code: "invalid_stream" };
    }
    if (typeof value === "object" && value !== null && "error" in value) {
      this.finished = true;
      const envelope = (value as { error: unknown }).error;
      const code =
        typeof envelope === "object" && envelope !== null
          ? codeFromEnvelope((envelope as { code?: unknown }).code)
          : undefined;
      return { kind: "error", code: code ?? "stream_error" };
    }
    return { kind: "data", value };
  }
}

/** Parses a byte stream (UTF-8 characters split across chunks are handled). */
export async function* parseSse(chunks: AsyncIterable<Buffer>): AsyncGenerator<SseEvent> {
  const parser = new SseParser();
  const decoder = new StringDecoder("utf8");
  for await (const chunk of chunks) {
    for (const event of parser.push(decoder.write(chunk))) {
      yield event;
    }
    if (parser.done) {
      return;
    }
  }
  for (const event of parser.push(decoder.end())) {
    yield event;
  }
  parser.end();
  if (!parser.done) {
    yield { kind: "error", code: "stream_truncated" };
  }
}
