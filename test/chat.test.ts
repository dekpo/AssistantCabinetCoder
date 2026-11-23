import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { readChunk, streamChat, type ChatResult } from "../src/chat";
import type { ClientOptions } from "../src/client";
import type { ChatBody } from "../src/conversation";
import { formatCallLine, type CallRecord } from "../src/log";
import { describeCode, describeOverflow } from "../src/messages";
import { closeAgents } from "../src/transport";
import { MARKUP_TEXT, startStub, type ChatEvent, type StubOptions } from "./stub-gateway/stub";
import { dataEvent, delta, sseHeaders, startScripted } from "./support/fake-server";

after(() => closeAgents());

function body(text: string, model = "cabinet-chat"): ChatBody {
  return {
    model,
    messages: [{ role: "user", content: text }],
    stream: true,
    stream_options: { include_usage: true },
  };
}

interface Run {
  result: ChatResult;
  texts: string[];
  firstEvents: number;
  logs: CallRecord[];
  events: ChatEvent[];
}

async function run(
  text: string,
  stubOptions: StubOptions = {},
  control: (signal: AbortController, texts: string[]) => void = () => undefined,
): Promise<Run> {
  const events: ChatEvent[] = [];
  const stub = await startStub({ ...stubOptions, onChat: (event) => events.push(event) });
  const options: ClientOptions = { baseUrl: stub.url, timeoutSeconds: 10 };
  const controller = new AbortController();
  const texts: string[] = [];
  const logs: CallRecord[] = [];
  let firstEvents = 0;
  control(controller, texts);
  try {
    const result = await streamChat(
      options,
      body(text),
      {
        onFirstEvent: () => {
          firstEvents += 1;
        },
        onText: (piece) => {
          texts.push(piece);
          control(controller, texts);
        },
      },
      controller.signal,
      (record) => logs.push(record),
    );
    // Let the stub notice a closed connection before it is stopped.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { result, texts, firstEvents, logs, events };
  } finally {
    await stub.close();
  }
}

describe("readChunk", () => {
  it("reads text, a finish reason and usage, and nothing else", () => {
    assert.deepEqual(readChunk({ choices: [{ delta: { content: "a" }, finish_reason: null }] }), {
      text: "a",
      finish: undefined,
      usage: undefined,
    });
    assert.deepEqual(
      readChunk({
        choices: [],
        usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 },
      }),
      { text: "", finish: undefined, usage: { prompt: 7, completion: 2 } },
    );
    assert.equal(readChunk({ choices: [{ delta: {}, finish_reason: "length" }] }).finish, "length");
    assert.equal(
      readChunk({ choices: [{ delta: {}, finish_reason: "has space" }] }).finish,
      undefined,
    );
    assert.equal(readChunk("nonsense").text, "");
    assert.equal(readChunk({ choices: [{ delta: { content: 5 } }] }).text, "");
  });
});

describe("streamChat against the stub", () => {
  it("streams the text in order, reads usage and the finish, and logs one line", async () => {
    const { result, texts, firstEvents, logs, events } = await run("hello");
    assert.equal(result.outcome, "complete");
    assert.equal(result.phase, "answering");
    assert.equal(texts.join(""), "Hello from the stub, caf\u00e9.");
    assert.equal(firstEvents, 1);
    assert.equal(result.finish, "stop");
    assert.equal(result.promptTokens, 2);
    assert.ok((result.completionTokens ?? 0) > 0);
    assert.equal(result.status, 200);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.call, "chat");
    assert.equal(logs[0]?.alias, "cabinet-chat");
    assert.equal(logs[0]?.promptTokens, 2);
    assert.equal(logs[0]?.code, undefined);
    assert.equal(typeof logs[0]?.firstMs, "number");
    assert.equal(events.filter((event) => event.phase === "start").length, 1);
  });

  it("streams the markup answer exactly, every piece as text", async () => {
    const { result, texts } = await run("[stub:markup]");
    assert.equal(result.outcome, "complete");
    assert.equal(texts.join(""), MARKUP_TEXT);
  });

  it("ends with the code of an error event that comes after the stream started", async () => {
    const { result, texts, logs } = await run("[stub:error]");
    assert.equal(result.outcome, "failed");
    assert.equal(result.phase, "answering");
    assert.equal(result.code, "provider_error");
    assert.deepEqual(texts, []);
    assert.equal(logs[0]?.code, "provider_error");
  });

  it("sends a refused request once: one request in the stub, the sentence of messages.ts", async () => {
    const { result, events, logs } = await run("[stub:refuse:server_busy]");
    assert.equal(result.outcome, "failed");
    assert.equal(result.phase, "reading");
    assert.equal(result.code, "server_busy");
    assert.equal(result.status, 503);
    assert.equal(events.filter((event) => event.phase === "start").length, 1);
    assert.equal(logs.length, 1);
    assert.equal(
      describeCode(result.code ?? "unexpected_response"),
      "The server is busy with other requests. Try again in a moment.",
    );
  });

  it("keeps the overflow numbers of a context_too_large refusal for its sentence", async () => {
    const { result } = await run("[stub:refuse:context_too_large]");
    assert.equal(result.code, "context_too_large");
    assert.deepEqual(result.overflow, {
      kind: "tokens",
      estimatedTokens: 50500,
      contextWindow: 32768,
    });
    assert.match(describeOverflow(result.overflow!), /about 50500 tokens for a window of 32768/);
  });

  it("calls a connection that drops mid-answer a truncated stream", async () => {
    const { result, texts } = await run("[stub:cut]");
    assert.equal(result.outcome, "failed");
    assert.equal(result.code, "stream_truncated");
    assert.deepEqual(texts, ["Partial "]);
  });

  it("stops at once while answering: the connection closes and nothing more is read", async () => {
    let abortedAt = 0;
    let afterAbort = 0;
    const started = Date.now();
    const { result, texts, events, logs } = await run(
      "[stub:long]",
      { longChunkMs: 20, longChunks: 500 },
      (controller, texts) => {
        if (controller.signal.aborted) {
          afterAbort += 1;
        } else if (texts.length === 3) {
          abortedAt = Date.now();
          controller.abort();
        }
      },
    );
    assert.equal(result.outcome, "stopped");
    assert.equal(result.phase, "answering");
    assert.equal(result.code, "cancelled");
    assert.equal(texts.length, 3);
    assert.equal(afterAbort, 0, "no text after the stop");
    assert.ok(Date.now() - started < 3000, "far less than the 10 s of the whole answer");
    const end = events.find((event) => event.phase === "end");
    assert.equal(end?.complete, false);
    assert.ok((end?.ms ?? 0) < 2000);
    assert.ok(abortedAt > 0);
    assert.equal(logs[0]?.code, "cancelled");
  });

  it("stops while the server is still reading: no word, phase reading", async () => {
    const { result, texts, events, firstEvents } = await run(
      "[stub:slow]",
      { slowFirstByteMs: 3000 },
      (controller) => {
        setTimeout(() => controller.abort(), 100);
      },
    );
    assert.equal(result.outcome, "stopped");
    assert.equal(result.phase, "reading");
    assert.equal(result.code, "cancelled");
    assert.deepEqual(texts, []);
    assert.equal(firstEvents, 0);
    assert.ok(result.durationMs < 1500);
    const end = events.find((event) => event.phase === "end");
    assert.equal(end?.complete, false);
  });

  it("reports an unreachable server as a failure, without throwing", async () => {
    const stub = await startStub();
    const url = stub.url;
    await stub.close();
    const logs: CallRecord[] = [];
    const result = await streamChat(
      { baseUrl: url, timeoutSeconds: 2 },
      body("x"),
      { onFirstEvent: () => undefined, onText: () => undefined },
      new AbortController().signal,
      (record) => logs.push(record),
    );
    assert.equal(result.outcome, "failed");
    assert.equal(result.code, "unreachable");
    assert.equal(logs.length, 1);
  });
});

describe("privacy of the panel's call", () => {
  it("keeps the user's text and the model's answer out of the log and the result", async () => {
    const secretQuestion = `SECRET-QUESTION-${Date.now()}`;
    const secretAnswer = `SECRET-ANSWER-${Date.now()}`;
    const server = await startScripted((_req, res) => {
      sseHeaders(res);
      res.write(dataEvent(delta({ role: "assistant", content: "" })));
      res.write(dataEvent(delta({ content: secretAnswer })));
      res.write(dataEvent(delta({}, "stop")));
      res.end("data: [DONE]\n\n");
    });
    const failing = await startScripted((_req, res) => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "invalid_request",
            message: secretAnswer,
            data: { field: secretQuestion },
          },
        }),
      );
    });
    try {
      const logs: CallRecord[] = [];
      const texts: string[] = [];
      const results: ChatResult[] = [];
      for (const url of [server.url, failing.url]) {
        results.push(
          await streamChat(
            { baseUrl: url, timeoutSeconds: 5 },
            body(secretQuestion),
            { onFirstEvent: () => undefined, onText: (piece) => texts.push(piece) },
            new AbortController().signal,
            (record) => logs.push(record),
          ),
        );
      }
      assert.ok(server.bodies[0]?.includes(secretQuestion), "the question reached the server");
      assert.deepEqual(texts, [secretAnswer], "the answer reached the panel");
      const everything = [
        ...logs.map((record) => formatCallLine(record, new Date())),
        JSON.stringify(logs),
        JSON.stringify(results),
        describeCode(results[1]?.code ?? "unexpected_response"),
      ].join("\n");
      assert.equal(everything.includes(secretQuestion), false);
      assert.equal(everything.includes(secretAnswer), false);
    } finally {
      await server.close();
      await failing.close();
    }
  });
});
