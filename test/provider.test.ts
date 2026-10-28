import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { ClientOptions } from "../src/client";
import { CONTRACT_ERROR_CODES, codeFromEnvelope, type MachineCode } from "../src/codes";
import type { ChatPart } from "../src/convert";
import { UI, describeCode, describeConversionFailure, describeNoServer } from "../src/messages";
import {
  CACHE_MS,
  ChatProvider,
  FALLBACK_OUTPUT,
  FALLBACK_WINDOW,
  MAX_CACHED_ADDRESSES,
  toModelEntry,
  type ChatCall,
} from "../src/provider";
import { closeAgents } from "../src/transport";
import { FakeHost } from "./support/fake-host";
import { image, message, opening, sampleTools, text, toolCall, toolResult } from "./support/editor";
import { dataEvent, delta, routes, sseHeaders, startScripted } from "./support/fake-server";
import { STUB_MODELS, startStub, type Stub, type StubOptions } from "./stub-gateway/stub";

after(() => closeAgents());

const CODE = { id: "cabinet-code", imageInput: true };
const PLAIN = { id: "cabinet-plain", imageInput: false };

async function withStub<T>(
  options: StubOptions,
  action: (stub: Stub, host: FakeHost) => Promise<T>,
  extra: Partial<ClientOptions> = {},
): Promise<T> {
  const stub = await startStub(options);
  try {
    return await action(stub, new FakeHost(stub.url, extra));
  } finally {
    await stub.close();
  }
}

function modelRequests(stub: Stub): number {
  return stub.requests.filter((entry) => entry.path === "/ide/v1/models").length;
}

function chatCall(overrides: Partial<ChatCall> = {}): ChatCall {
  return { model: CODE, messages: opening(), toolMode: "auto", ...overrides };
}

async function collect(
  provider: ChatProvider,
  call: ChatCall,
  signal: AbortSignal = new AbortController().signal,
): Promise<ChatPart[]> {
  const parts: ChatPart[] = [];
  await provider.chat(call, (part) => parts.push(part), signal);
  return parts;
}

async function failureOf(provider: ChatProvider, call: ChatCall): Promise<string> {
  try {
    await collect(provider, call);
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  return "no failure";
}

const joined = (parts: ChatPart[]): string =>
  parts.flatMap((part) => (part.kind === "text" ? [part.value] : [])).join("");

describe("the list of models", () => {
  it("maps each entry of the server to a model with its truth in the tooltip, in the server's order", async () => {
    await withStub({}, async (_stub, host) => {
      const models = await new ChatProvider(host).information(true);
      assert.deepEqual(
        models.map((model) => model.id),
        STUB_MODELS.map((model) => model.id),
      );
      const chat = models[0];
      assert.ok(chat !== undefined);
      assert.equal(chat.name, "cabinet-chat");
      assert.equal(chat.family, "cabinet-chat");
      assert.equal(chat.version, "1");
      assert.equal(chat.detail, "Assistant Cabinet Coder");
      assert.equal(chat.maxOutputTokens, 8192);
      assert.equal(chat.maxInputTokens, 32768 - 8192);
      assert.deepEqual(chat.capabilities, { toolCalling: true, imageInput: false });
      assert.match(chat.tooltip, /Context window: 32768 tokens\./);
      assert.match(chat.tooltip, /Output ceiling: 8192 tokens\./);
      assert.match(chat.tooltip, /Tool calling: yes\. Image input: no\./);
      const code = models[1];
      assert.deepEqual(code?.capabilities, { toolCalling: true, imageInput: true });
      assert.match(code?.tooltip ?? "", /Image input: yes/);
      const plain = models[2];
      assert.deepEqual(plain?.capabilities, { toolCalling: false, imageInput: false });
      assert.match(plain?.tooltip ?? "", /does not offer this model in the chat/);
      assert.match(plain?.tooltip ?? "", /32768 tokens or more/);
    });
  });

  it("chooses a documented fallback for a missing window or ceiling, and says so", () => {
    const entry = toModelEntry({
      id: "m",
      contextWindow: undefined,
      maxOutputTokens: undefined,
      tools: false,
      vision: false,
    });
    assert.equal(entry.maxOutputTokens, FALLBACK_OUTPUT);
    assert.equal(entry.maxInputTokens, FALLBACK_WINDOW - FALLBACK_OUTPUT);
    assert.match(
      entry.tooltip,
      /Context window: not reported by the server, 8192 tokens assumed\./,
    );
    assert.match(
      entry.tooltip,
      /Output ceiling: not reported by the server, 2048 tokens assumed\./,
    );
  });

  it("never reports an input window below one token", () => {
    const entry = toModelEntry({
      id: "m",
      contextWindow: 1000,
      maxOutputTokens: 2000,
      tools: true,
      vision: false,
    });
    assert.equal(entry.maxInputTokens, 1);
  });

  it("reads a server that sends no features and an entry with no window", async () => {
    const server = await startScripted(routes({ models: [{ id: "bare" }] }));
    try {
      const models = await new ChatProvider(new FakeHost(server.url)).information(true);
      assert.equal(models.length, 1);
      assert.equal(models[0]?.id, "bare");
      assert.deepEqual(models[0]?.capabilities, { toolCalling: false, imageInput: false });
      assert.equal(models[0]?.maxOutputTokens, FALLBACK_OUTPUT);
    } finally {
      await server.close();
    }
  });

  it("coalesces concurrent requests for the list into one request", async () => {
    await withStub({}, async (stub, host) => {
      const provider = new ChatProvider(host);
      const answers = await Promise.all(
        Array.from({ length: 6 }, () => provider.information(true)),
      );
      assert.equal(modelRequests(stub), 1);
      for (const answer of answers) {
        assert.equal(answer.length, 3);
      }
    });
  });

  it("answers from the cache for 60 seconds, then asks again", async () => {
    await withStub({}, async (stub, host) => {
      let now = 1_000_000;
      const provider = new ChatProvider(host, () => now);
      await provider.information(true);
      now += CACHE_MS - 1;
      await provider.information(true);
      assert.equal(modelRequests(stub), 1);
      now += 2;
      await provider.information(true);
      assert.equal(modelRequests(stub), 2);
    });
  });

  it("keeps the last good list when a refresh fails, and says why when not silent", async () => {
    const good = await startStub();
    const dead = await startStub();
    const deadUrl = dead.url;
    await dead.close();
    try {
      const host = new FakeHost(good.url);
      let now = 0;
      const provider = new ChatProvider(host, () => now);
      assert.equal((await provider.information(true)).length, 3);
      host.target = deadUrl;
      now += CACHE_MS + 1;
      assert.equal((await provider.information(true)).length, 3, "silent keeps the list");
      assert.deepEqual(host.shown, []);
      now += CACHE_MS + 1;
      assert.equal((await provider.information(false)).length, 3, "not silent keeps it too");
      assert.deepEqual(host.shown, [{ text: describeCode("unreachable"), offerKey: false }]);
    } finally {
      await good.close();
    }
  });

  it("returns no model when the first request fails", async () => {
    const dead = await startStub();
    const deadUrl = dead.url;
    await dead.close();
    const host = new FakeHost(deadUrl);
    const provider = new ChatProvider(host);
    assert.deepEqual(await provider.information(true), []);
    assert.deepEqual(host.shown, []);
    assert.deepEqual(await provider.information(false), []);
    assert.equal(host.shown.length, 1);
  });

  it("returns no model and says nothing when the surface is off and the call is silent", async () => {
    await withStub({ mode: "off" }, async (_stub, host) => {
      assert.deepEqual(await new ChatProvider(host).information(true), []);
      assert.deepEqual(host.shown, []);
    });
  });

  it("tells the administrator sentence once per address when the surface is off", async () => {
    await withStub({ mode: "off" }, async (_stub, host) => {
      const provider = new ChatProvider(host);
      await provider.information(false);
      await provider.information(false);
      assert.deepEqual(host.shown, [{ text: describeCode("ide_surface_off"), offerKey: false }]);
      host.url = "http://other.test";
      await provider.information(false);
      assert.equal(host.shown.length, 2);
    });
  });

  it("offers the Set API Key action when a key is needed and the call is not silent", async () => {
    await withStub({ mode: "key-needed" }, async (_stub, host) => {
      const provider = new ChatProvider(host);
      assert.deepEqual(await provider.information(true), []);
      assert.deepEqual(host.shown, []);
      assert.deepEqual(await provider.information(false), []);
      assert.deepEqual(host.shown, [{ text: describeCode("key_needed"), offerKey: true }]);
    });
  });

  it("says that the extension and the server do not match", async () => {
    await withStub({ mode: "version-mismatch" }, async (_stub, host) => {
      const provider = new ChatProvider(host);
      assert.deepEqual(await provider.information(true), []);
      assert.deepEqual(host.shown, []);
      await provider.information(false);
      assert.deepEqual(host.shown, [{ text: UI.providerMismatch, offerKey: false }]);
    });
  });

  it("drops the list when the server stops offering the surface", async () => {
    const good = await startStub();
    const off = await startStub({ mode: "off" });
    try {
      const host = new FakeHost(good.url);
      let now = 0;
      const provider = new ChatProvider(host, () => now);
      assert.equal((await provider.information(true)).length, 3);
      host.target = off.url;
      now += CACHE_MS + 1;
      assert.deepEqual(await provider.information(true), []);
      host.target = good.url;
      assert.equal((await provider.information(true)).length, 3);
      host.target = off.url;
      now += CACHE_MS + 1;
      await provider.information(false);
      assert.equal(host.shown.length, 1, "the sentence is shown again after a success");
    } finally {
      await good.close();
      await off.close();
    }
  });

  it("says what to fix when no server is configured", async () => {
    const host = new FakeHost("http://unused.test");
    host.nextFailure = { ok: false, reason: "autodiscover_off" };
    const provider = new ChatProvider(host);
    assert.deepEqual(await provider.information(true), []);
    assert.deepEqual(host.shown, []);
    assert.deepEqual(await provider.information(false), []);
    assert.deepEqual(host.shown, [{ text: describeNoServer("autodiscover_off"), offerKey: false }]);
  });

  it("reads the connection again at each call, so a new key applies at once", async () => {
    await withStub({ requireKey: "right" }, async (stub) => {
      const host = new FakeHost(stub.url, { apiKey: "wrong" });
      const provider = new ChatProvider(host);
      assert.deepEqual(await provider.information(true), []);
      host.extra = { apiKey: "right" };
      assert.equal((await provider.information(true)).length, 3);
      assert.equal(host.resolutions, 2);
    });
  });

  it("fires the change event and forgets the cache when told the connection changed", async () => {
    await withStub({}, async (stub, host) => {
      const provider = new ChatProvider(host);
      await provider.information(true);
      provider.invalidate();
      assert.equal(host.changes, 1);
      await provider.information(true);
      assert.equal(modelRequests(stub), 2);
    });
  });

  it("does not cache an answer that was started before the connection changed", async () => {
    const server = await startScripted(routes({ models: [{ id: "slow" }], modelsDelayMs: 80 }));
    try {
      const host = new FakeHost(server.url);
      const provider = new ChatProvider(host);
      const running = provider.information(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
      provider.invalidate();
      await running;
      await provider.information(true);
      assert.equal(server.paths.filter((path) => path === "/ide/v1/models").length, 2);
    } finally {
      await server.close();
    }
  });

  it("keeps one entry per server address and a bounded number of them", async () => {
    await withStub({}, async (stub, host) => {
      const provider = new ChatProvider(host);
      for (let index = 0; index < MAX_CACHED_ADDRESSES + 2; index += 1) {
        host.url = `http://server-${index}.test`;
        await provider.information(true);
      }
      const total = modelRequests(stub);
      assert.equal(total, MAX_CACHED_ADDRESSES + 2);
      host.url = `http://server-${MAX_CACHED_ADDRESSES + 1}.test`;
      await provider.information(true);
      assert.equal(modelRequests(stub), total, "the newest is still cached");
      host.url = "http://server-0.test";
      await provider.information(true);
      assert.equal(modelRequests(stub), total + 1, "the oldest was forgotten");
    });
  });
});

describe("a chat call", () => {
  it("streams a text answer and logs one line of numbers and codes", async () => {
    await withStub({}, async (_stub, host) => {
      const provider = new ChatProvider(host);
      const parts = await collect(provider, chatCall({ messages: opening("[stub:text]") }));
      assert.equal(joined(parts), `Hello from the stub, caf${String.fromCharCode(0xe9)}.`);
      assert.equal(host.logs.length, 1);
      const line = host.logs[0];
      assert.equal(line?.call, "chat");
      assert.equal(line?.alias, "cabinet-code");
      assert.equal(line?.status, 200);
      assert.equal(line?.toolCalls, 0);
      assert.equal(typeof line?.promptTokens, "number");
      assert.equal(typeof line?.completionTokens, "number");
      assert.equal(typeof line?.durationMs, "number");
      assert.equal(line?.code, undefined);
    });
  });

  it("reassembles an answer that arrives three bytes at a time", async () => {
    await withStub({}, async (_stub, host) => {
      const parts = await collect(
        new ChatProvider(host),
        chatCall({ messages: opening("[stub:split]") }),
      );
      assert.equal(joined(parts), `Hello from the stub, caf${String.fromCharCode(0xe9)}.`);
    });
  });

  it("runs the tool loop of an Agent turn: a call taken from the request's tools, then a closing answer", async () => {
    await withStub({}, async (_stub, host) => {
      const provider = new ChatProvider(host);
      const first = await collect(
        provider,
        chatCall({ messages: opening("[stub:tool-call]"), tools: sampleTools }),
      );
      assert.deepEqual(first, [
        {
          kind: "toolCall",
          callId: "call_000000000000000000000001",
          name: "read_file",
          input: { filePath: "stub" },
        },
      ]);
      assert.equal(host.logs[0]?.toolCalls, 1);
      const second = await collect(
        provider,
        chatCall({
          messages: [
            ...opening("[stub:tool-call]"),
            message(
              "Assistant",
              toolCall("call_000000000000000000000001", "read_file", { filePath: "stub" }),
            ),
            message("User", toolResult("call_000000000000000000000001", [text("file contents")])),
          ],
          tools: sampleTools,
        }),
      );
      assert.equal(joined(second), "Closing answer from the stub.");
      assert.equal(host.logs[1]?.toolCalls, 0);
    });
  });

  it("sends a request of the right shape, with the key only in the Authorization header", async () => {
    const server = await startScripted(
      routes({
        chat: (_req, res) => {
          sseHeaders(res);
          res.end(
            dataEvent(delta({ content: "ok" })) + dataEvent(delta({}, "stop")) + "data: [DONE]\n\n",
          );
        },
      }),
    );
    try {
      const host = new FakeHost(server.url, { apiKey: "KEY-123" });
      await collect(
        new ChatProvider(host),
        chatCall({
          tools: sampleTools,
          toolMode: "required",
          modelOptions: { temperature: 0.5, _conversationId: "private" },
        }),
      );
      const body = JSON.parse(server.bodies[0] ?? "{}") as Record<string, unknown>;
      assert.equal(body["model"], "cabinet-code");
      assert.equal(body["stream"], true);
      assert.deepEqual(body["stream_options"], { include_usage: true });
      assert.equal(body["tool_choice"], "required");
      assert.equal(body["temperature"], 0.5);
      assert.equal("max_tokens" in body, false);
      assert.equal("_conversationId" in body, false);
      assert.equal(server.headers[0]?.["authorization"], "Bearer KEY-123");
      assert.equal(server.headers[0]?.["accept"], "text/event-stream");
      assert.equal(server.bodies[0]?.includes("KEY-123"), false);
    } finally {
      await server.close();
    }
  });

  it("maps a scripted error event, an HTTP error and an empty answer to their sentences", async () => {
    await withStub({}, async (_stub, host) => {
      const provider = new ChatProvider(host);
      const cases: [string, MachineCode][] = [
        ["error", "provider_error"],
        ["error-http", "provider_unreachable"],
        ["empty", "empty_answer"],
      ];
      for (const [scenario, code] of cases) {
        const failure = await failureOf(
          provider,
          chatCall({ messages: opening(`[stub:${scenario}]`) }),
        );
        assert.equal(failure, describeCode(code), scenario);
        assert.equal(host.logs.at(-1)?.code, code, scenario);
      }
    });
  });

  it("maps every error code of the contract, sent with an HTTP status, to its sentence", async () => {
    for (const code of CONTRACT_ERROR_CODES) {
      const server = await startScripted(
        routes({
          chat: (_req, res) => {
            res.writeHead(code === "payload_too_large" ? 413 : 400, {
              "Content-Type": "application/json",
            });
            res.end(JSON.stringify({ error: { code, message: "secret words", data: {} } }));
          },
        }),
      );
      try {
        const host = new FakeHost(server.url);
        const failure = await failureOf(new ChatProvider(host), chatCall());
        const expected = codeFromEnvelope(code);
        assert.ok(expected !== undefined);
        assert.equal(failure, describeCode(expected), code);
        assert.equal(host.logs[0]?.code, expected, code);
        assert.equal(failure.includes("secret words"), false);
      } finally {
        await server.close();
      }
    }
  });

  it("explains a wrong key and a surface that is off", async () => {
    await withStub({ mode: "key-needed" }, async (_stub, host) => {
      assert.equal(await failureOf(new ChatProvider(host), chatCall()), describeCode("key_needed"));
    });
    await withStub({ mode: "off" }, async (_stub, host) => {
      assert.equal(
        await failureOf(new ChatProvider(host), chatCall()),
        describeCode("ide_surface_off"),
      );
    });
  });

  it("says the answer stopped when the server cuts the connection mid-answer", async () => {
    await withStub({}, async (_stub, host) => {
      const parts: ChatPart[] = [];
      await assert.rejects(
        new ChatProvider(host).chat(
          chatCall({ messages: opening("[stub:cut]") }),
          (part) => parts.push(part),
          new AbortController().signal,
        ),
        { message: describeCode("stream_truncated") },
      );
      assert.equal(joined(parts), "Partial ");
      assert.equal(host.logs[0]?.code, "stream_truncated");
    });
  });

  it("says the answer stopped when the stream ends without its last event", async () => {
    const server = await startScripted(
      routes({
        chat: (_req, res) => {
          sseHeaders(res);
          res.end(dataEvent(delta({ content: "half" })));
        },
      }),
    );
    try {
      const failure = await failureOf(new ChatProvider(new FakeHost(server.url)), chatCall());
      assert.equal(failure, describeCode("stream_truncated"));
    } finally {
      await server.close();
    }
  });

  it("refuses an image for a model without vision before sending anything", async () => {
    await withStub({}, async (stub, host) => {
      const failure = await failureOf(
        new ChatProvider(host),
        chatCall({
          model: PLAIN,
          messages: [...opening(), message("User", text("look"), image())],
        }),
      );
      assert.equal(failure, describeConversionFailure("image_without_vision", undefined));
      assert.equal(stub.requests.length, 0);
      assert.equal(host.logs[0]?.code, "provider_capability_unsupported");
      assert.equal(host.resolutions, 0);
    });
  });

  it("explains the server's own refusal of an image", async () => {
    await withStub({}, async (_stub, host) => {
      const failure = await failureOf(
        new ChatProvider(host),
        chatCall({
          model: { id: "cabinet-plain", imageInput: true },
          messages: [...opening(), message("User", image())],
        }),
      );
      assert.equal(failure, describeCode("provider_capability_unsupported"));
    });
  });

  it("refuses a role it does not know, with its sentence", async () => {
    await withStub({}, async (stub, host) => {
      const failure = await failureOf(
        new ChatProvider(host),
        chatCall({ messages: [message("Narrator", text("x"))] }),
      );
      assert.equal(failure, describeConversionFailure("unknown_role", undefined));
      assert.equal(stub.requests.length, 0);
    });
  });

  it("names the tool of invalid arguments only when it is in the request's own tool list", async () => {
    const server = await startScripted(
      routes({
        chat: (_req, res) => {
          sseHeaders(res);
          res.end(
            dataEvent(
              delta({
                tool_calls: [
                  { index: 0, id: "c", function: { name: "read_file", arguments: "{not json" } },
                ],
              }),
            ) +
              dataEvent(delta({}, "tool_calls")) +
              "data: [DONE]\n\n",
          );
        },
      }),
    );
    try {
      const provider = new ChatProvider(new FakeHost(server.url));
      assert.equal(
        await failureOf(provider, chatCall({ tools: sampleTools })),
        describeConversionFailure("bad_tool_arguments", "read_file"),
      );
      assert.equal(
        await failureOf(provider, chatCall({ tools: [{ name: "list_dir" }] })),
        describeConversionFailure("bad_tool_arguments", undefined),
      );
    } finally {
      await server.close();
    }
  });

  it("explains a server that is not configured", async () => {
    const host = new FakeHost("http://unused.test");
    host.nextFailure = { ok: false, reason: "autodiscover_off" };
    assert.equal(
      await failureOf(new ChatProvider(host), chatCall()),
      describeCode("server_not_configured"),
    );
  });

  it("gives up with a timeout sentence when no byte arrives in time", async () => {
    await withStub(
      { slowFirstByteMs: 1200 },
      async (_stub, host) => {
        const failure = await failureOf(
          new ChatProvider(host),
          chatCall({ messages: opening("[stub:slow]") }),
        );
        assert.equal(failure, describeCode("timeout"));
        assert.equal(host.logs[0]?.code, "timeout");
      },
      { timeoutSeconds: 0.3 },
    );
  });

  it("ends quietly and closes the connection when the call is cancelled", async () => {
    await withStub({ longChunkMs: 20 }, async (stub, host) => {
      const controller = new AbortController();
      const parts: ChatPart[] = [];
      await new ChatProvider(host).chat(
        chatCall({ messages: opening("[stub:long]") }),
        (part) => {
          parts.push(part);
          controller.abort();
        },
        controller.signal,
      );
      assert.ok(parts.length >= 1);
      assert.equal(host.logs[0]?.code, "cancelled");
      for (let wait = 0; wait < 100 && stub.aborted === 0; wait += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(stub.aborted, 1, "the server saw the connection close");
    });
  });

  it("does not even connect when it is cancelled before it starts", async () => {
    await withStub({}, async (stub, host) => {
      const controller = new AbortController();
      controller.abort();
      await new ChatProvider(host).chat(chatCall(), () => undefined, controller.signal);
      assert.equal(stub.requests.length, 0);
      assert.equal(host.logs[0]?.code, "cancelled");
    });
  });
});

describe("the token estimate", () => {
  it("never touches the network and starts high", async () => {
    await withStub({}, async (stub, host) => {
      const provider = new ChatProvider(host);
      const estimate = provider.countTokens("cabinet-code", "a".repeat(3000));
      assert.equal(estimate, 1000);
      assert.equal(
        provider.countTokens("cabinet-code", { content: [text("abc"), image()] }),
        1 + 1024,
      );
      assert.equal(stub.requests.length, 0);
      assert.equal(host.resolutions, 0);
    });
  });

  it("is corrected from the usage the server reports, per model", async () => {
    await withStub({}, async (_stub, host) => {
      const provider = new ChatProvider(host);
      const long = "word ".repeat(2000);
      const before = provider.countTokens("cabinet-code", long);
      for (let index = 0; index < 8; index += 1) {
        await collect(provider, chatCall({ messages: opening(long) }));
      }
      const after = provider.countTokens("cabinet-code", long);
      assert.ok(after < before, `${after} should be below ${before}`);
      assert.ok(after >= Math.ceil(long.length / 6), "never below the clamp");
      assert.equal(
        provider.countTokens("cabinet-chat", long),
        before,
        "another model is not changed",
      );
    });
  });
});
