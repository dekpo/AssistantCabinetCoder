import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { failureFromResponse, overflowFrom, requestFingerprint } from "../src/client";
import { CabinetError, MACHINE_CODES, type MachineCode } from "../src/codes";
import { CODE_MESSAGES, describeOverflow } from "../src/messages";
import {
  ChatProvider,
  MAX_REMEMBERED_REFUSALS,
  REFUSAL_MEMORY_MS,
  isFinalRefusal,
  type ChatCall,
} from "../src/provider";
import { closeAgents, open } from "../src/transport";
import { FakeHost } from "./support/fake-host";
import { opening } from "./support/editor";
import { startScripted } from "./support/fake-server";
import { REFUSAL_STATUS, startStub, type ChatEvent, type Stub } from "./stub-gateway/stub";

after(() => closeAgents());

const SECRET = "x1e-secret-4c9d";

function call(typed: string): ChatCall {
  return {
    model: { id: "cabinet-code", imageInput: true },
    messages: opening(typed),
    toolMode: "auto",
  };
}

async function failureOf(provider: ChatProvider, chat: ChatCall): Promise<string> {
  try {
    await provider.chat(chat, () => undefined, new AbortController().signal);
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  return "no failure";
}

function chatRequests(stub: Stub): number {
  return stub.requests.filter((entry) => entry.path === "/ide/v1/chat/completions").length;
}

/** A clock the test moves by hand. */
function handClock(): { now: number; read: () => number } {
  const clock = { now: 1_000_000, read: () => clock.now };
  return clock;
}

describe("which refusals retrying cannot fix (decision D-025)", () => {
  const FINAL: MachineCode[] = [
    "context_too_large",
    "payload_too_large",
    "key_needed",
    "model_alias_not_allowed",
    "model_not_permitted",
    "provider_capability_unsupported",
    "invalid_request",
    "timeout",
  ];

  it("names every machine code once: final ones are remembered, the others are not", () => {
    for (const code of MACHINE_CODES) {
      assert.equal(
        isFinalRefusal(new CabinetError(code, { status: 400 })),
        FINAL.includes(code),
        code,
      );
    }
  });

  it("remembers a runtime timeout (provider_error 504) but not a provider_error 502", () => {
    assert.equal(isFinalRefusal(new CabinetError("provider_error", { status: 504 })), true);
    assert.equal(isFinalRefusal(new CabinetError("provider_error", { status: 502 })), false);
    assert.equal(isFinalRefusal(new CabinetError("provider_error")), false);
  });

  it("lets the refusals that may succeed later be retried", () => {
    for (const code of ["server_busy", "provider_unreachable", "rate_limited", "empty_answer"]) {
      assert.equal(isFinalRefusal(new CabinetError(code as MachineCode, { status: 503 })), false);
    }
  });
});

describe("the numbers of a window overflow", () => {
  it("keeps the guard's estimate and window", () => {
    assert.deepEqual(overflowFrom({ estimated_tokens: 50500, context_window: 32768 }), {
      kind: "tokens",
      estimatedTokens: 50500,
      contextWindow: 32768,
    });
  });

  it("keeps the characters and the ceiling", () => {
    assert.deepEqual(overflowFrom({ chars: 1600000, limit: 1500000 }), {
      kind: "chars",
      chars: 1600000,
      limit: 1500000,
    });
  });

  it("prefers the guard's pair when both pairs are present", () => {
    assert.equal(
      overflowFrom({ estimated_tokens: 9, context_window: 8, chars: 7, limit: 6 })?.kind,
      "tokens",
    );
  });

  it("keeps nothing from a pair that is incomplete or not made of positive integers", () => {
    const refused: unknown[] = [
      undefined,
      null,
      [],
      "50500",
      {},
      { estimated_tokens: 50500 },
      { context_window: 32768 },
      { estimated_tokens: "50500", context_window: 32768 },
      { estimated_tokens: -1, context_window: 32768 },
      { estimated_tokens: 0, context_window: 32768 },
      { estimated_tokens: 1.5, context_window: 32768 },
      { chars: 10, limit: Number.NaN },
      { chars: Number.MAX_VALUE, limit: 10 },
    ];
    for (const data of refused) {
      assert.equal(overflowFrom(data), undefined, JSON.stringify(data));
    }
  });

  it("is read from a context_too_large envelope only", () => {
    const data = { estimated_tokens: 50500, context_window: 32768 };
    const body = (code: string) => JSON.stringify({ error: { code, message: SECRET, data } });
    assert.deepEqual(failureFromResponse(413, body("context_too_large"), "ide").overflow, {
      kind: "tokens",
      estimatedTokens: 50500,
      contextWindow: 32768,
    });
    assert.equal(failureFromResponse(413, body("payload_too_large"), "ide").overflow, undefined);
  });

  it("is said as an estimate of the server, with the administrator's command, and no address", () => {
    const tokens = describeOverflow({
      kind: "tokens",
      estimatedTokens: 50500,
      contextWindow: 32768,
    });
    assert.match(tokens, /the server estimates about 50500 tokens for a window of 32768 tokens/);
    assert.match(tokens, /cabinet models context/);
    assert.match(tokens, /Start a new chat or attach less\./);
    const chars = describeOverflow({ kind: "chars", chars: 1600000, limit: 1500000 });
    assert.match(chars, /1600000 characters for a limit of 1500000/);
    assert.match(chars, /IDE_MAX_CONTEXT_CHARS/);
    for (const sentence of [tokens, chars]) {
      assert.doesNotMatch(sentence, /https?:|127\.0\.0\.1|cabinet-code/);
    }
  });
});

describe("the provider's memory of a refusal (decision D-025)", () => {
  it("shows the numbers, then answers the editor's identical retry without calling the server", async () => {
    const stub = await startStub();
    try {
      const host = new FakeHost(stub.url);
      const provider = new ChatProvider(host);
      const first = await failureOf(provider, call("[stub:refuse:context_too_large]"));
      const second = await failureOf(provider, call("[stub:refuse:context_too_large]"));
      assert.equal(
        first,
        describeOverflow({ kind: "tokens", estimatedTokens: 50500, contextWindow: 32768 }),
      );
      assert.equal(second, first);
      assert.equal(chatRequests(stub), 1);
      assert.equal(host.logs.length, 2);
      assert.equal(host.logs[0]?.status, 413);
      assert.equal(host.logs[0]?.code, "context_too_large");
      assert.equal(host.logs[1]?.status, undefined, "a remembered refusal made no call");
      assert.equal(host.logs[1]?.code, "context_too_large");
    } finally {
      await stub.close();
    }
  });

  it("keeps the old sentence for an overflow that carries no numbers", async () => {
    const server = await startScripted((_req, res) => {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "context_too_large", message: SECRET, data: {} } }));
    });
    try {
      const provider = new ChatProvider(new FakeHost(server.url));
      assert.equal(await failureOf(provider, call("hello")), CODE_MESSAGES.context_too_large);
    } finally {
      await server.close();
    }
  });

  it("sends a different request, even right after a refusal", async () => {
    const stub = await startStub();
    try {
      const provider = new ChatProvider(new FakeHost(stub.url));
      await failureOf(provider, call("one [stub:refuse:context_too_large]"));
      await failureOf(provider, call("two [stub:refuse:context_too_large]"));
      assert.equal(chatRequests(stub), 2);
    } finally {
      await stub.close();
    }
  });

  it("lets a refusal that may succeed later reach the server every time", async () => {
    const stub = await startStub();
    try {
      const provider = new ChatProvider(new FakeHost(stub.url));
      for (const code of ["server_busy", "provider_unreachable", "rate_limited", "empty_answer"]) {
        await failureOf(provider, call(`[stub:refuse:${code}]`));
        await failureOf(provider, call(`[stub:refuse:${code}]`));
      }
      assert.equal(chatRequests(stub), 8);
      assert.equal(provider.rememberedRefusals, 0);
    } finally {
      await stub.close();
    }
  });

  it("remembers every final refusal of the contract, the runtime timeout included", async () => {
    const stub = await startStub();
    try {
      const provider = new ChatProvider(new FakeHost(stub.url));
      const finals = [
        "context_too_large",
        "payload_too_large",
        "unauthorized",
        "model_alias_not_allowed",
        "model_not_permitted",
        "provider_capability_unsupported",
        "invalid_request",
        "provider_error",
      ];
      for (const code of finals) {
        assert.ok(REFUSAL_STATUS[code] !== undefined, code);
        await failureOf(provider, call(`[stub:refuse:${code}]`));
        await failureOf(provider, call(`[stub:refuse:${code}]`));
      }
      assert.equal(chatRequests(stub), finals.length);
      assert.equal(provider.rememberedRefusals, finals.length);
    } finally {
      await stub.close();
    }
  });

  it("remembers the extension's own timeout", async () => {
    const server = await startScripted(() => undefined);
    try {
      const host = new FakeHost(server.url, { timeoutSeconds: 0.2 });
      const provider = new ChatProvider(host);
      const first = await failureOf(provider, call("hello"));
      const second = await failureOf(provider, call("hello"));
      assert.equal(first, CODE_MESSAGES.timeout);
      assert.equal(second, first);
      assert.equal(server.bodies.length, 1);
    } finally {
      await server.close();
    }
  });

  it("forgets a refusal after the delay", async () => {
    const stub = await startStub();
    try {
      const clock = handClock();
      const provider = new ChatProvider(new FakeHost(stub.url), clock.read);
      await failureOf(provider, call("[stub:refuse:invalid_request]"));
      clock.now += REFUSAL_MEMORY_MS - 1;
      await failureOf(provider, call("[stub:refuse:invalid_request]"));
      assert.equal(chatRequests(stub), 1);
      clock.now += 1;
      await failureOf(provider, call("[stub:refuse:invalid_request]"));
      assert.equal(chatRequests(stub), 2);
    } finally {
      await stub.close();
    }
  });

  it("forgets every refusal when the address, the key or the authority changes", async () => {
    const stub = await startStub();
    try {
      const provider = new ChatProvider(new FakeHost(stub.url));
      await failureOf(provider, call("[stub:refuse:unauthorized]"));
      provider.invalidate();
      assert.equal(provider.rememberedRefusals, 0);
      await failureOf(provider, call("[stub:refuse:unauthorized]"));
      assert.equal(chatRequests(stub), 2);
    } finally {
      await stub.close();
    }
  });

  it("does not answer for another server", async () => {
    const stub = await startStub();
    try {
      const host = new FakeHost(stub.url);
      const provider = new ChatProvider(host);
      await failureOf(provider, call("[stub:refuse:invalid_request]"));
      host.url = "http://other.test";
      await failureOf(provider, call("[stub:refuse:invalid_request]"));
      assert.equal(chatRequests(stub), 2);
    } finally {
      await stub.close();
    }
  });

  it(`keeps at most ${MAX_REMEMBERED_REFUSALS} refusals, forgetting the oldest`, async () => {
    const stub = await startStub();
    try {
      const provider = new ChatProvider(new FakeHost(stub.url));
      for (let index = 0; index <= MAX_REMEMBERED_REFUSALS; index += 1) {
        await failureOf(provider, call(`${index} [stub:refuse:invalid_request]`));
      }
      assert.equal(provider.rememberedRefusals, MAX_REMEMBERED_REFUSALS);
      await failureOf(provider, call("0 [stub:refuse:invalid_request]"));
      assert.equal(chatRequests(stub), MAX_REMEMBERED_REFUSALS + 2);
    } finally {
      await stub.close();
    }
  });

  it("lets nothing of the server's message or data reach a sentence or a log", async () => {
    const server = await startScripted((_req, res) => {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "context_too_large",
            message: SECRET,
            data: { estimated_tokens: 50500, context_window: 32768, note: SECRET },
          },
        }),
      );
    });
    try {
      const host = new FakeHost(server.url);
      const provider = new ChatProvider(host);
      const sentences = [
        await failureOf(provider, call(`hello ${SECRET}`)),
        await failureOf(provider, call(`hello ${SECRET}`)),
      ];
      assert.equal(server.bodies.length, 1);
      assert.equal(JSON.stringify(sentences).includes(SECRET), false);
      assert.equal(JSON.stringify(host.logs).includes(SECRET), false);
      assert.equal(JSON.stringify(host.shown).includes(SECRET), false);
    } finally {
      await server.close();
    }
  });

  it("recognises a request by a digest, never by its text", () => {
    const digest = requestFingerprint("http://server.test", `{"text":"${SECRET}"}`);
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert.notEqual(digest, requestFingerprint("http://other.test", `{"text":"${SECRET}"}`));
    assert.notEqual(digest, requestFingerprint("http://server.test", `{"text":"other"}`));
  });
});

describe("the stub's refusals and its chat events", () => {
  it("answers each contract code with its status and tells onChat when it starts and ends", async () => {
    const events: ChatEvent[] = [];
    const stub = await startStub({ onChat: (event) => events.push(event) });
    try {
      for (const [code, status] of Object.entries(REFUSAL_STATUS)) {
        const reply = await open(
          { baseUrl: stub.url, timeoutSeconds: 5 },
          {
            method: "POST",
            path: "/ide/v1/chat/completions",
            body: JSON.stringify({
              model: "cabinet-code",
              messages: [{ role: "user", content: `[stub:refuse:${code}]` }],
            }),
            accept: "application/json",
          },
        );
        assert.equal(reply.status, status, code);
        const body = JSON.parse(await reply.text()) as { error: { code: string; data: unknown } };
        assert.equal(body.error.code, code);
        if (code === "context_too_large") {
          assert.deepEqual(body.error.data, { estimated_tokens: 50500, context_window: 32768 });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      const starts = events.filter((event) => event.phase === "start");
      const ends = events.filter((event) => event.phase === "end");
      assert.equal(starts.length, Object.keys(REFUSAL_STATUS).length);
      assert.equal(ends.length, starts.length);
      assert.equal(starts[0]?.scenario, "refuse");
      assert.equal(starts[0]?.code, Object.keys(REFUSAL_STATUS)[0]);
      assert.equal(ends[0]?.id, starts[0]?.id);
      assert.equal(ends[0]?.complete, true);
      assert.equal(typeof ends[0]?.ms, "number");
    } finally {
      await stub.close();
    }
  });
});
