import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SseParser, parseSse, type SseEvent } from "../src/sse";

async function* bytes(...parts: Buffer[]): AsyncGenerator<Buffer> {
  for (const part of parts) {
    yield part;
  }
}

async function collect(stream: AsyncIterable<SseEvent>): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("SseParser", () => {
  it("parses data events and the end marker", () => {
    const parser = new SseParser();
    const events = parser.push('data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n');
    assert.deepEqual(events, [
      { kind: "data", value: { a: 1 } },
      { kind: "data", value: { a: 2 } },
      { kind: "done" },
    ]);
    assert.equal(parser.done, true);
  });

  it("joins a line split across chunks, at any position", () => {
    const text = 'data: {"hello":"world"}\n\ndata: [DONE]\n\n';
    for (let cut = 1; cut < text.length; cut += 1) {
      const parser = new SseParser();
      const events = [...parser.push(text.slice(0, cut)), ...parser.push(text.slice(cut))];
      assert.deepEqual(
        events,
        [{ kind: "data", value: { hello: "world" } }, { kind: "done" }],
        `cut ${cut}`,
      );
    }
  });

  it("ignores comment lines and other fields", () => {
    const events = new SseParser().push(
      ': keep-alive\nevent: message\nid: 7\ndata: {"x":true}\n\n',
    );
    assert.deepEqual(events, [{ kind: "data", value: { x: true } }]);
  });

  it("accepts CRLF and a CRLF split between chunks", () => {
    const parser = new SseParser();
    const events = [...parser.push('data: {"n":1}\r'), ...parser.push("\n\r\n")];
    assert.deepEqual(events, [{ kind: "data", value: { n: 1 } }]);
  });

  it("joins several data lines of one event with a newline", () => {
    const events = new SseParser().push('data: {"a":\ndata: 1}\n\n');
    assert.deepEqual(events, [{ kind: "data", value: { a: 1 } }]);
  });

  it("surfaces an error event as a typed error with the contract's code", () => {
    const events = new SseParser().push(
      'data: {"error":{"code":"provider_error","message":"SECRET text","data":{}}}\n\ndata: [DONE]\n\n',
    );
    assert.deepEqual(events, [{ kind: "error", code: "provider_error" }]);
  });

  it("maps an unknown error code to stream_error and an unauthorized one to key_needed", () => {
    assert.deepEqual(new SseParser().push('data: {"error":{"code":"weird"}}\n\n'), [
      { kind: "error", code: "stream_error" },
    ]);
    assert.deepEqual(new SseParser().push('data: {"error":{"code":"unauthorized"}}\n\n'), [
      { kind: "error", code: "key_needed" },
    ]);
    assert.deepEqual(new SseParser().push('data: {"error":"text"}\n\n'), [
      { kind: "error", code: "stream_error" },
    ]);
  });

  it("makes invalid JSON a typed error that never contains the payload", () => {
    const events = new SseParser().push("data: {not json SECRET-PAYLOAD\n\n");
    assert.deepEqual(events, [{ kind: "error", code: "invalid_stream" }]);
    assert.equal(JSON.stringify(events).includes("SECRET"), false);
  });

  it("reads nothing after the end or an error", () => {
    const parser = new SseParser();
    parser.push("data: [DONE]\n\n");
    assert.deepEqual(parser.push('data: {"late":1}\n\n'), []);
  });

  it("drops an event without its blank line", () => {
    const parser = new SseParser();
    assert.deepEqual(parser.push('data: {"a":1}\n'), []);
    assert.deepEqual(parser.end(), []);
    assert.equal(parser.done, false);
  });
});

describe("parseSse", () => {
  it("decodes UTF-8 characters split across byte chunks", async () => {
    const whole = Buffer.from('data: {"t":"caf\u00e9"}\n\ndata: [DONE]\n\n', "utf8");
    const at = whole.indexOf(0xc3) + 1;
    const events = await collect(parseSse(bytes(whole.subarray(0, at), whole.subarray(at))));
    assert.deepEqual(events, [{ kind: "data", value: { t: "caf\u00e9" } }, { kind: "done" }]);
  });

  it("reports a stream that ends without the end marker", async () => {
    const events = await collect(parseSse(bytes(Buffer.from('data: {"a":1}\n\n'))));
    assert.deepEqual(events, [
      { kind: "data", value: { a: 1 } },
      { kind: "error", code: "stream_truncated" },
    ]);
  });
});
