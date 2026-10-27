import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { failureFromResponse } from "../src/client";
import { parseSse, type SseEvent } from "../src/sse";
import { closeAgents, open } from "../src/transport";
import { startStub, type Scenario } from "./stub-gateway/stub";

after(() => closeAgents());

async function chat(url: string, scenario: Scenario, stream = true) {
  return open(
    { baseUrl: url, timeoutSeconds: 5 },
    {
      method: "POST",
      path: "/ide/v1/chat/completions",
      body: JSON.stringify({
        model: "cabinet-code",
        stream,
        messages: [],
        stub_scenario: scenario,
      }),
      accept: stream ? "text/event-stream" : "application/json",
    },
  );
}

async function events(url: string, scenario: Scenario): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const event of parseSse((await chat(url, scenario)).chunks())) {
    out.push(event);
  }
  return out;
}

describe("stub gateway scripts", () => {
  it("streams a scripted text answer", async () => {
    const stub = await startStub();
    try {
      const all = await events(stub.url, "text");
      assert.equal(all.at(-1)?.kind, "done");
      assert.equal(all.filter((event) => event.kind === "error").length, 0);
    } finally {
      await stub.close();
    }
  });

  it("streams a scripted tool call with a whole call in one chunk", async () => {
    const stub = await startStub();
    try {
      const all = await events(stub.url, "tool-call");
      const calls = all.flatMap((event) =>
        event.kind === "data"
          ? ((event.value as { choices: { delta: { tool_calls?: unknown[] } }[] }).choices[0]?.delta
              .tool_calls ?? [])
          : [],
      );
      assert.equal(calls.length, 1);
      assert.deepEqual((calls[0] as { function: { name: string } }).function.name, "read_file");
    } finally {
      await stub.close();
    }
  });

  it("streams a scripted error event, then ends", async () => {
    const stub = await startStub();
    try {
      const all = await events(stub.url, "error");
      assert.deepEqual(all.at(-1), { kind: "error", code: "provider_error" });
    } finally {
      await stub.close();
    }
  });

  it("answers a scripted HTTP error with the contract's envelope", async () => {
    const stub = await startStub();
    try {
      const reply = await chat(stub.url, "error-http");
      assert.equal(reply.status, 503);
      assert.equal(
        failureFromResponse(reply.status, await reply.text(), "ide").code,
        "provider_unreachable",
      );
    } finally {
      await stub.close();
    }
  });

  it("answers a non-streaming call in the contract's shape", async () => {
    const stub = await startStub();
    try {
      const reply = await chat(stub.url, "tool-call", false);
      const body = JSON.parse(await reply.text()) as {
        choices: { finish_reason: string; message: { content: unknown; tool_calls: unknown[] } }[];
      };
      assert.equal(body.choices[0]?.finish_reason, "tool_calls");
      assert.equal(body.choices[0]?.message.content, null);
      assert.equal(body.choices[0]?.message.tool_calls.length, 1);
    } finally {
      await stub.close();
    }
  });

  it("delays the first byte of the slow scenario", async () => {
    const stub = await startStub({ slowFirstByteMs: 200 });
    try {
      const started = Date.now();
      const all = await events(stub.url, "slow");
      assert.ok(Date.now() - started >= 180);
      assert.equal(all.at(-1)?.kind, "done");
    } finally {
      await stub.close();
    }
  });

  it("serves 404 for an unknown path and for the editor surface when off", async () => {
    const off = await startStub({ mode: "off" });
    try {
      assert.equal(
        (await open({ baseUrl: off.url, timeoutSeconds: 5 }, { method: "GET", path: "/nope" }))
          .status,
        404,
      );
      assert.equal(
        (
          await open(
            { baseUrl: off.url, timeoutSeconds: 5 },
            { method: "GET", path: "/ide/v1/models" },
          )
        ).status,
        404,
      );
    } finally {
      await off.close();
    }
  });
});
