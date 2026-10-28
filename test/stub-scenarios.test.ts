import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { failureFromResponse } from "../src/client";
import { parseSse, type SseEvent } from "../src/sse";
import { closeAgents, open } from "../src/transport";
import { minimalArguments, pickTool, startStub, type StubOptions } from "./stub-gateway/stub";

after(() => closeAgents());

type Message = { role: string; content?: unknown; tool_calls?: unknown };

const user = (content: unknown): Message => ({ role: "user", content });
const tool = (id: string): Message => ({ role: "tool", content: `result of ${id}` });

const READ_FILE = {
  type: "function",
  function: {
    name: "read_file",
    parameters: {
      type: "object",
      properties: { filePath: { type: "string" }, startLine: { type: "number" } },
      required: ["filePath", "startLine"],
    },
  },
};

async function ask(
  options: StubOptions,
  body: Record<string, unknown>,
  action: (reply: Awaited<ReturnType<typeof open>>, url: string) => Promise<void>,
): Promise<number> {
  const stub = await startStub(options);
  try {
    const reply = await open(
      { baseUrl: stub.url, timeoutSeconds: 5 },
      {
        method: "POST",
        path: "/ide/v1/chat/completions",
        body: JSON.stringify({ model: "cabinet-code", stream: true, ...body }),
        accept: "text/event-stream",
      },
    );
    await action(reply, stub.url);
    return stub.aborted;
  } finally {
    await stub.close();
  }
}

async function events(reply: Awaited<ReturnType<typeof open>>): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  try {
    for await (const event of parseSse(reply.chunks())) {
      out.push(event);
    }
  } catch {
    // A connection destroyed mid-answer ends the list.
  }
  return out;
}

interface Chunk {
  choices: {
    delta: { content?: string; tool_calls?: { function: { name: string; arguments: string } }[] };
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function chunks(all: SseEvent[]): Chunk[] {
  return all.flatMap((event) => (event.kind === "data" ? [event.value as Chunk] : []));
}

const textOf = (all: SseEvent[]): string =>
  chunks(all)
    .map((chunk) => chunk.choices[0]?.delta.content ?? "")
    .join("");

const callOf = (all: SseEvent[]) =>
  chunks(all).flatMap((chunk) => chunk.choices[0]?.delta.tool_calls ?? [])[0]?.function;

describe("the helpers ported from the probe", () => {
  it("builds the smallest valid arguments for the required properties", () => {
    assert.deepEqual(
      minimalArguments({
        properties: {
          a: { type: "string" },
          b: { type: "number" },
          c: { type: "integer" },
          d: { type: "boolean" },
          e: { type: "array" },
          f: { type: "object" },
          g: {},
          optional: { type: "string" },
        },
        required: ["a", "b", "c", "d", "e", "f", "g", 3],
      }),
      { a: "stub", b: 1, c: 1, d: false, e: [], f: {}, g: "stub" },
    );
    assert.deepEqual(minimalArguments(undefined), {});
    assert.deepEqual(minimalArguments({ properties: {} }), {});
    assert.deepEqual(minimalArguments("not a schema"), {});
  });

  it("picks the first tool named like read_file, otherwise the first, otherwise a fixed one", () => {
    assert.equal(
      pickTool([
        { name: "list_dir", parameters: undefined },
        { name: "copilot_read_file_x", parameters: undefined },
      ]).name,
      "copilot_read_file_x",
    );
    assert.equal(pickTool([{ name: "list_dir", parameters: undefined }]).name, "list_dir");
    assert.deepEqual(pickTool([]), { name: "read_file", args: { path: "a.py" } });
  });
});

describe("choosing the script", () => {
  it("reads a marker in the last real user message", async () => {
    await ask(
      {},
      { messages: [user("[stub:tool-call] go")], tools: [READ_FILE] },
      async (reply) => {
        assert.equal(callOf(await events(reply))?.name, "read_file");
      },
    );
  });

  it("reads a marker among several text parts", async () => {
    const content = [
      { type: "text", text: "context" },
      { type: "text", text: "now [stub:split] please" },
    ];
    await ask({}, { messages: [user(content)] }, async (reply) => {
      assert.match(textOf(await events(reply)), /^Hello from the stub/);
    });
  });

  it("lets the body field win over a marker", async () => {
    await ask(
      {},
      { stub_scenario: "text", messages: [user("[stub:error-http]")] },
      async (reply) => {
        assert.equal(reply.status, 200);
      },
    );
  });

  it("ignores a marker in an earlier message and an unknown marker", async () => {
    await ask(
      {},
      {
        messages: [user("[stub:error-http]"), { role: "assistant", content: "ok" }, user("next")],
      },
      async (reply) => {
        assert.equal(reply.status, 200);
      },
    );
    await ask({}, { messages: [user("[stub:nonsense]")] }, async (reply) => {
      assert.equal(reply.status, 200);
      assert.equal(textOf(await events(reply)).startsWith("Hello"), true);
    });
  });
});

describe("the tool-call scenario", () => {
  it("calls a tool of the request's own list with the smallest valid arguments", async () => {
    const other = { type: "function", function: { name: "list_dir" } };
    await ask(
      {},
      { messages: [user("[stub:tool-call]")], tools: [other, READ_FILE] },
      async (reply) => {
        const call = callOf(await events(reply));
        assert.equal(call?.name, "read_file");
        assert.deepEqual(JSON.parse(call?.arguments ?? "{}"), { filePath: "stub", startLine: 1 });
      },
    );
    await ask({}, { messages: [user("[stub:tool-call]")], tools: [other] }, async (reply) => {
      assert.equal(callOf(await events(reply))?.name, "list_dir");
    });
  });

  it("calls the tool a marker names when the request offers it, and falls back when it does not", async () => {
    const create = {
      type: "function",
      function: {
        name: "create_file",
        parameters: {
          type: "object",
          properties: { filePath: { type: "string" }, content: { type: "string" } },
          required: ["filePath", "content"],
        },
      },
    };
    await ask(
      {},
      { messages: [user("[stub:tool-call:create_file] make it")], tools: [READ_FILE, create] },
      async (reply) => {
        const call = callOf(await events(reply));
        assert.equal(call?.name, "create_file");
        assert.deepEqual(JSON.parse(call?.arguments ?? "{}"), {
          filePath: "stub",
          content: "stub",
        });
      },
    );
    await ask(
      {},
      { messages: [user("[stub:tool-call:create_file] make it")], tools: [READ_FILE] },
      async (reply) => {
        assert.equal(callOf(await events(reply))?.name, "read_file");
      },
    );
  });

  it("answers with a closing text once a tool message follows the last real user message", async () => {
    const messages = [
      user("[stub:tool-call]"),
      { role: "assistant", content: null, tool_calls: [] },
      tool("c1"),
      user([{ type: "text", text: "Image returned by the tool read_file." }]),
    ];
    await ask({}, { messages, tools: [READ_FILE] }, async (reply) => {
      const all = await events(reply);
      assert.equal(callOf(all), undefined);
      assert.equal(textOf(all), "Closing answer from the stub.");
    });
  });

  it("calls the tool again for a new real user message after an earlier tool round", async () => {
    const messages = [
      user("[stub:tool-call]"),
      { role: "assistant", content: null, tool_calls: [] },
      tool("c1"),
      { role: "assistant", content: "done" },
      user("[stub:tool-call] again"),
    ];
    await ask({}, { messages, tools: [READ_FILE] }, async (reply) => {
      assert.equal(callOf(await events(reply))?.name, "read_file");
    });
  });

  it("answers a non-streaming closing too", async () => {
    await ask(
      {},
      { stream: false, messages: [user("[stub:tool-call]"), tool("c1")], tools: [READ_FILE] },
      async (reply) => {
        const body = JSON.parse(await reply.text()) as {
          choices: { message: { content: string } }[];
        };
        assert.equal(body.choices[0]?.message.content, "Closing answer from the stub.");
      },
    );
  });
});

describe("usage", () => {
  it("ends the stream with a usage chunk that depends on the size of the request", async () => {
    const usage: number[] = [];
    for (const size of [400, 4000]) {
      await ask(
        {},
        {
          stream_options: { include_usage: true },
          messages: [user("x".repeat(size))],
        },
        async (reply) => {
          const all = await events(reply);
          const last = chunks(all).at(-1);
          assert.deepEqual(last?.choices, []);
          assert.equal(last?.usage?.prompt_tokens, size / 4);
          assert.equal(
            last?.usage?.total_tokens,
            (last?.usage?.prompt_tokens ?? 0) + (last?.usage?.completion_tokens ?? 0),
          );
          assert.equal(all.at(-1)?.kind, "done");
          usage.push(last?.usage?.prompt_tokens ?? 0);
        },
      );
    }
    assert.deepEqual(usage, [100, 1000]);
  });

  it("counts the arguments of an earlier tool call, and sends no usage unless asked", async () => {
    const messages = [
      user("x".repeat(40)),
      {
        role: "assistant",
        content: null,
        tool_calls: [{ function: { arguments: "y".repeat(40) } }],
      },
    ];
    await ask({}, { stream_options: { include_usage: true }, messages }, async (reply) => {
      assert.equal(chunks(await events(reply)).at(-1)?.usage?.prompt_tokens, 20);
    });
    await ask({}, { messages }, async (reply) => {
      assert.equal(
        chunks(await events(reply)).some((chunk) => chunk.usage !== undefined),
        false,
      );
    });
  });
});

describe("the other scenarios", () => {
  it("answers the empty scenario with the contract's empty_answer 502", async () => {
    await ask({}, { messages: [user("[stub:empty]")] }, async (reply) => {
      assert.equal(reply.status, 502);
      assert.equal(
        failureFromResponse(reply.status, await reply.text(), "ide").code,
        "empty_answer",
      );
    });
  });

  it("trickles text in the long scenario and ends it properly", async () => {
    await ask(
      { longChunkMs: 5, longChunks: 4 },
      { messages: [user("[stub:long]")] },
      async (reply) => {
        const all = await events(reply);
        assert.equal(textOf(all), "word0 word1 word2 word3 ");
        assert.equal(all.at(-1)?.kind, "done");
      },
    );
  });

  it("notices when the client of the long scenario goes away", async () => {
    const aborted = await ask(
      { longChunkMs: 10 },
      { messages: [user("[stub:long]")] },
      async (reply) => {
        for await (const event of parseSse(reply.chunks())) {
          if (event.kind === "data") {
            reply.destroy();
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    );
    assert.equal(aborted, 1);
  });

  it("destroys the connection after two chunks in the cut scenario", async () => {
    const aborted = await ask({}, { messages: [user("[stub:cut]")] }, async (reply) => {
      const all = await events(reply);
      assert.equal(textOf(all), "Partial ");
      assert.equal(
        all.some((event) => event.kind === "done"),
        false,
      );
    });
    assert.equal(aborted, 1);
  });
});

describe("images", () => {
  const picture = [
    { type: "text", text: "look" },
    { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw==" } },
  ];

  it("refuses an image for a model without vision like the server does", async () => {
    for (const model of ["cabinet-plain", "cabinet-chat"]) {
      await ask({}, { model, messages: [user(picture)] }, async (reply) => {
        assert.equal(reply.status, 400);
        const body = await reply.text();
        assert.equal(
          failureFromResponse(reply.status, body, "ide").code,
          "provider_capability_unsupported",
        );
        assert.equal(
          (JSON.parse(body) as { error: { data: { capability: string } } }).error.data.capability,
          "vision",
        );
      });
    }
  });

  it("accepts an image for a model with vision, and plain text for any model", async () => {
    await ask({}, { model: "cabinet-code", messages: [user(picture)] }, async (reply) => {
      assert.equal(reply.status, 200);
      await events(reply);
    });
    await ask({}, { model: "cabinet-plain", messages: [user("just text")] }, async (reply) => {
      assert.equal(reply.status, 200);
      await events(reply);
    });
  });
});
