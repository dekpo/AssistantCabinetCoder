import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConvertError,
  ResponseReader,
  buildChatRequest,
  convertMessages,
  parseArguments,
  type BuildInput,
  type ChatPart,
  type ConvertReason,
} from "../src/convert";
import { CONVERSION_MESSAGES, CONVERSION_NOTES, describeConversionFailure } from "../src/messages";
import {
  fixtureMessages,
  image,
  message,
  opening,
  sampleTools,
  text,
  toolCall,
  toolResult,
  type ConversionFixture,
} from "./support/editor";
import { readJson } from "./support/repo";

function build(extra: Partial<BuildInput> = {}) {
  return buildChatRequest({
    alias: "cabinet-code",
    vision: true,
    messages: opening(),
    toolMode: "auto",
    ...extra,
  });
}

function refusal(action: () => unknown): ConvertError {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof ConvertError, "a ConvertError is thrown");
    return error;
  }
  assert.fail("nothing was thrown");
}

describe("golden requests", () => {
  const names = [
    "ask",
    "agent-parallel",
    "plan",
    "system-user-user",
    "image-turn",
    "tool-result-image",
  ];
  for (const name of names) {
    it(`builds the expected body for ${name}`, () => {
      const fixture = readJson<ConversionFixture>(`test/fixtures/convert/${name}.json`);
      const built = buildChatRequest({
        alias: fixture.alias,
        vision: fixture.vision,
        messages: fixtureMessages(fixture),
        tools: fixture.tools,
        toolMode: fixture.toolMode,
      });
      assert.deepEqual(built.body, fixture.expected);
      assert.equal(built.skippedTools, 0);
    });
  }
});

describe("the request body", () => {
  it("always streams with usage, and never sends max_tokens", () => {
    const { body } = build();
    assert.equal(body.stream, true);
    assert.deepEqual(body.stream_options, { include_usage: true });
    assert.equal("max_tokens" in body, false);
    assert.equal("max_completion_tokens" in body, false);
    assert.equal("temperature" in body, false);
    assert.equal("tools" in body, false);
    assert.equal("tool_choice" in body, false);
  });

  it("sends temperature, top_p and stop only when they are given and well formed", () => {
    const given = build({
      modelOptions: { temperature: 0.2, top_p: 0.9, stop: ["END", "", 4], _conversationId: "x" },
    }).body;
    assert.equal(given.temperature, 0.2);
    assert.equal(given.top_p, 0.9);
    assert.deepEqual(given.stop, ["END"]);
    const single = build({ modelOptions: { stop: "END" } }).body;
    assert.equal(single.stop, "END");
    const privateOnly = build({
      modelOptions: { _enableThinking: true, temperature: "hot", top_p: Number.NaN, stop: [] },
    }).body;
    assert.equal("temperature" in privateOnly, false);
    assert.equal("top_p" in privateOnly, false);
    assert.equal("stop" in privateOnly, false);
  });

  it("maps the tool mode, and omits tool_choice when no tool remains", () => {
    assert.equal(build({ tools: sampleTools, toolMode: "required" }).body.tool_choice, "required");
    assert.equal(build({ tools: sampleTools, toolMode: "auto" }).body.tool_choice, "auto");
    const none = build({ tools: [{ name: "not valid!" }], toolMode: "required" });
    assert.equal("tools" in none.body, false);
    assert.equal("tool_choice" in none.body, false);
  });

  it("leaves out a tool whose name the server would refuse, and counts it", () => {
    const built = build({
      tools: [
        { name: "read_file" },
        { name: "has space" },
        { name: "x".repeat(129) },
        { name: "" },
        { name: "ok.name:v1/a-b" },
      ],
    });
    assert.deepEqual(
      built.body.tools?.map((tool) => tool.function.name),
      ["read_file", "ok.name:v1/a-b"],
    );
    assert.equal(built.skippedTools, 3);
    assert.deepEqual([...built.toolNames], ["read_file", "ok.name:v1/a-b"]);
  });

  it("omits an empty description and a schema that is not an object", () => {
    const built = build({
      tools: [{ name: "a", description: "", inputSchema: undefined }, { name: "b" }],
    });
    assert.deepEqual(built.body.tools, [
      { type: "function", function: { name: "a" } },
      { type: "function", function: { name: "b" } },
    ]);
  });
});

describe("roles", () => {
  it("maps System, User and Assistant by name", () => {
    const out = convertMessages(
      [message("System", text("s")), message("User", text("u")), message("Assistant", text("a"))],
      false,
    );
    assert.deepEqual(
      out.map((entry) => entry.role),
      ["system", "user", "assistant"],
    );
  });

  it("refuses a role it does not know, by its name or as a number", () => {
    for (const role of ["Tool", "3", "", "user", "unknown"]) {
      const error = refusal(() => convertMessages([message(role, text("x"))], false));
      assert.equal(error.reason, "unknown_role");
      assert.equal(error.code, "invalid_request");
      assert.equal(error.message, "unknown_role");
    }
  });
});

describe("user messages", () => {
  it("puts the tool messages first, then the text", () => {
    const out = convertMessages(
      [
        message("Assistant", toolCall("c1", "read_file", {})),
        message("User", text("after"), toolResult("c1", [text("result")])),
      ],
      false,
    );
    assert.deepEqual(out, [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "read_file", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "result" },
      { role: "user", content: "after" },
    ]);
  });

  it("keeps the text of a single part as a string and several parts as a list", () => {
    assert.deepEqual(convertMessages([message("User", text("one"))], false), [
      { role: "user", content: "one" },
    ]);
    assert.deepEqual(convertMessages([message("User", text("one"), text("two"))], false), [
      {
        role: "user",
        content: [
          { type: "text", text: "one" },
          { type: "text", text: "two" },
        ],
      },
    ]);
  });

  it("skips a message with no content, and a system or assistant message with no text", () => {
    assert.deepEqual(
      convertMessages(
        [message("User"), message("System"), message("Assistant"), message("Assistant", text(""))],
        false,
      ),
      [],
    );
  });

  it("turns each image type into a data URL and refuses any other data part", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp", "image/gif", "IMAGE/PNG"]) {
      const out = convertMessages([message("User", image(mime, [1, 2, 3]))], true);
      assert.deepEqual(out, [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mime.toLowerCase()};base64,AQID` } },
          ],
        },
      ]);
    }
    for (const mime of [
      "application/pdf",
      "text/plain",
      "image/svg+xml",
      "image/bmp",
      "cache_control",
    ]) {
      assert.equal(
        refusal(() => convertMessages([message("User", image(mime))], true)).reason,
        "unsupported_part",
        mime,
      );
    }
    assert.equal(
      refusal(() => convertMessages([message("User", image("image/png", []))], true)).reason,
      "unsupported_part",
    );
  });

  it("uses the exact bytes of a view into a larger buffer", () => {
    const whole = Uint8Array.from([9, 9, 1, 2, 3, 9]);
    const part = { mimeType: "image/png", data: whole.subarray(2, 5) };
    const out = convertMessages([message("User", part)], true);
    assert.deepEqual(out, [
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AQID" } }],
      },
    ]);
  });

  it("refuses a part it cannot place, instead of dropping it", () => {
    const cases = [
      message("User", { somethingElse: 1 }),
      message("User", toolCall("c", "n", {})),
      message("Assistant", toolResult("c", [])),
      message("Assistant", image()),
      message("System", image()),
      message("System", toolCall("c", "n", {})),
    ];
    for (const entry of cases) {
      assert.equal(refusal(() => convertMessages([entry], true)).reason, "unsupported_part");
    }
  });
});

describe("tool results", () => {
  it("joins the text parts with a line break", () => {
    const out = convertMessages(
      [message("User", toolResult("c", [text("a"), text("b"), text("c")]))],
      false,
    );
    assert.deepEqual(out, [{ role: "tool", tool_call_id: "c", content: "a\nb\nc" }]);
  });

  it("puts an image of a result in the user message after all the tool messages, naming the tool", () => {
    const out = convertMessages(
      [
        message(
          "Assistant",
          toolCall("c1", "view_image", {}),
          toolCall("c2", "read_file", {}),
          toolCall("c3", "bad name!", {}),
        ),
        message(
          "User",
          toolResult("c1", [image("image/png", [1, 2, 3])]),
          toolResult("c2", [text("text")]),
          toolResult("c3", [image("image/jpeg", [1, 2, 3])]),
          text("go on"),
        ),
      ],
      true,
    );
    assert.deepEqual(out.slice(1), [
      { role: "tool", tool_call_id: "c1", content: CONVERSION_NOTES.resultIsImage },
      { role: "tool", tool_call_id: "c2", content: "text" },
      { role: "tool", tool_call_id: "c3", content: CONVERSION_NOTES.resultIsImage },
      {
        role: "user",
        content: [
          { type: "text", text: "Image returned by the tool view_image." },
          { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
          { type: "text", text: "Image returned by a tool." },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,AQID" } },
        ],
      },
      { role: "user", content: "go on" },
    ]);
  });

  it("replaces a part of another kind by a note, and an empty result by another", () => {
    const out = convertMessages(
      [
        message(
          "User",
          toolResult("c1", [text("kept"), { value: { tsx: true } }, image("application/pdf")]),
          toolResult("c2", [{ value: { tsx: true } }]),
          toolResult("c3", []),
        ),
      ],
      false,
    );
    assert.deepEqual(out, [
      {
        role: "tool",
        tool_call_id: "c1",
        content: [
          "kept",
          CONVERSION_NOTES.resultPartLeftOut,
          CONVERSION_NOTES.resultPartLeftOut,
        ].join("\n"),
      },
      { role: "tool", tool_call_id: "c2", content: CONVERSION_NOTES.resultPartLeftOut },
      { role: "tool", tool_call_id: "c3", content: CONVERSION_NOTES.resultEmpty },
    ]);
  });

  it("serialises the arguments of an earlier call, and survives input that cannot be serialised", () => {
    const loop: Record<string, unknown> = {};
    loop["self"] = loop;
    const out = convertMessages(
      [
        message(
          "Assistant",
          text("t"),
          toolCall("a", "x", { n: 1, s: "\u00e4" }),
          toolCall("b", "y", loop),
        ),
      ],
      false,
    );
    assert.deepEqual(out, [
      {
        role: "assistant",
        content: "t",
        tool_calls: [
          { id: "a", type: "function", function: { name: "x", arguments: '{"n":1,"s":"\u00e4"}' } },
          { id: "b", type: "function", function: { name: "y", arguments: "{}" } },
        ],
      },
    ]);
  });
});

describe("images and vision", () => {
  it("refuses an image for a model without vision, before anything is sent", () => {
    for (const entry of [
      message("User", text("look"), image()),
      message("User", toolResult("c", [image()])),
    ]) {
      const error = refusal(() => build({ vision: false, messages: [entry] }));
      assert.equal(error.reason, "image_without_vision");
      assert.equal(error.code, "provider_capability_unsupported");
    }
  });

  it("accepts text for a model without vision", () => {
    assert.doesNotThrow(() => build({ vision: false }));
  });

  it("keeps every image of the history, in order", () => {
    const body = build({
      messages: [
        message("User", image("image/png", [1])),
        message("Assistant", text("seen")),
        message("User", image("image/png", [2])),
      ],
    }).body;
    const urls = body.messages.flatMap((entry) =>
      entry.role === "user" && Array.isArray(entry.content)
        ? entry.content.flatMap((part) => (part.type === "image_url" ? [part.image_url.url] : []))
        : [],
    );
    assert.deepEqual(urls, ["data:image/png;base64,AQ==", "data:image/png;base64,Ag=="]);
  });
});

describe("messages of the refusals", () => {
  it("has one sentence per reason, and names a tool only when it is given", () => {
    const reasons: ConvertReason[] = [
      "unknown_role",
      "unsupported_part",
      "image_without_vision",
      "bad_tool_call",
      "bad_tool_arguments",
    ];
    assert.deepEqual(Object.keys(CONVERSION_MESSAGES).sort(), [...reasons].sort());
    for (const reason of reasons) {
      assert.match(describeConversionFailure(reason, undefined), /^[A-Z].*[.]$/);
    }
    assert.match(describeConversionFailure("bad_tool_arguments", "read_file"), /tool read_file /);
    assert.equal(
      describeConversionFailure("unknown_role", "read_file"),
      CONVERSION_MESSAGES.unknown_role,
    );
  });
});

function reader(...tools: string[]): ResponseReader {
  return new ResponseReader(new Set(tools));
}

function delta(content: unknown, finish: string | null = null) {
  return { choices: [{ index: 0, delta: content, finish_reason: finish }] };
}

function call(index: number, id: string | undefined, name: string | undefined, args: string) {
  return {
    tool_calls: [
      {
        index,
        ...(id === undefined ? {} : { id, type: "function" }),
        function: { ...(name === undefined ? {} : { name }), arguments: args },
      },
    ],
  };
}

function drain(source: ResponseReader, chunks: unknown[]): ChatPart[] {
  return [...chunks.flatMap((chunk) => source.accept(chunk)), ...source.finish()];
}

describe("reading an answer", () => {
  it("reports text as it arrives and ignores empty deltas", () => {
    const source = reader();
    assert.deepEqual(source.accept(delta({ role: "assistant", content: "" })), []);
    assert.deepEqual(source.accept(delta({ content: "Hel" })), [{ kind: "text", value: "Hel" }]);
    assert.deepEqual(source.accept(delta({ content: "lo" })), [{ kind: "text", value: "lo" }]);
    assert.deepEqual(source.accept(delta({}, "stop")), []);
    assert.deepEqual(source.finish(), []);
  });

  it("reports a whole tool call when the answer is finished", () => {
    const source = reader("read_file");
    const parts = drain(source, [
      delta({ role: "assistant", content: "" }),
      delta(call(0, "call_a", "read_file", '{"path":"a.py"}')),
      delta({}, "tool_calls"),
    ]);
    assert.deepEqual(parts, [
      { kind: "toolCall", callId: "call_a", name: "read_file", input: { path: "a.py" } },
    ]);
    assert.equal(source.toolCalls, 1);
  });

  it("accumulates a split call by index, with several calls interleaved", () => {
    const source = reader("a", "b");
    const parts = drain(source, [
      delta(call(1, "id_b", "b", '{"y":')),
      delta(call(0, "id_a", "a", '{"x"')),
      delta(call(0, undefined, undefined, ":1}")),
      delta(call(1, undefined, undefined, "2}")),
      delta({}, "tool_calls"),
    ]);
    assert.deepEqual(parts, [
      { kind: "toolCall", callId: "id_a", name: "a", input: { x: 1 } },
      { kind: "toolCall", callId: "id_b", name: "b", input: { y: 2 } },
    ]);
    assert.equal(source.toolCalls, 2);
  });

  it("flushes a call when the stream ends without a finish reason", () => {
    const parts = drain(reader("a"), [delta(call(0, "id", "a", "{}"))]);
    assert.deepEqual(parts, [{ kind: "toolCall", callId: "id", name: "a", input: {} }]);
  });

  it("reads empty arguments as an empty object and invents an id when none is given", () => {
    const parts = drain(reader("a"), [delta(call(0, undefined, "a", "")), delta({}, "stop")]);
    assert.deepEqual(parts, [{ kind: "toolCall", callId: "call_0", name: "a", input: {} }]);
  });

  it("accepts every finish reason", () => {
    for (const finish of ["stop", "length", "tool_calls", "content_filter"]) {
      const source = reader();
      assert.deepEqual(source.accept(delta({ content: "x" }, finish)), [
        { kind: "text", value: "x" },
      ]);
    }
  });

  it("reads usage from the last chunk, which has no choices", () => {
    const source = reader();
    source.accept({ choices: [], usage: { prompt_tokens: 812, completion_tokens: 24 } });
    assert.equal(source.promptTokens, 812);
    assert.equal(source.completionTokens, 24);
    const none = reader();
    none.accept({ usage: { prompt_tokens: -1, completion_tokens: "x" } });
    assert.equal(none.promptTokens, undefined);
    assert.equal(none.completionTokens, undefined);
  });

  it("ignores chunks that are not objects or have no choices", () => {
    const source = reader();
    for (const value of [
      null,
      3,
      "x",
      [],
      {},
      { choices: [] },
      { choices: [null] },
      { choices: "no" },
    ]) {
      assert.deepEqual(source.accept(value), []);
    }
  });

  it("refuses invalid arguments and names the tool only when it is in the request's own list", () => {
    const known = refusal(() =>
      drain(reader("read_file"), [
        delta(call(0, "i", "read_file", "{not json")),
        delta({}, "stop"),
      ]),
    );
    assert.equal(known.reason, "bad_tool_arguments");
    assert.equal(known.toolName, "read_file");
    assert.equal(known.code, "bad_response");
    assert.equal(known.message, "bad_tool_arguments");

    const unknown = refusal(() =>
      drain(reader("other"), [delta(call(0, "i", "read_file", "{not json")), delta({}, "stop")]),
    );
    assert.equal(unknown.toolName, undefined);

    const badShape = refusal(() =>
      drain(reader("bad name!"), [delta(call(0, "i", "bad name!", "{x")), delta({}, "stop")]),
    );
    assert.equal(badShape.toolName, undefined);
  });

  it("refuses arguments that are not an object, and a call without a name", () => {
    for (const args of ["[1]", "3", "null", '"text"']) {
      assert.equal(
        refusal(() => drain(reader("a"), [delta(call(0, "i", "a", args)), delta({}, "stop")]))
          .reason,
        "bad_tool_arguments",
        args,
      );
    }
    assert.equal(
      refusal(() => drain(reader(), [delta(call(0, "i", undefined, "{}")), delta({}, "stop")]))
        .reason,
      "bad_tool_call",
    );
  });

  it("parses arguments with a blank text as empty", () => {
    assert.deepEqual(parseArguments("  ", undefined), {});
    assert.deepEqual(parseArguments('{"a":[1]}', undefined), { a: [1] });
  });

  it("never carries the arguments in the error", () => {
    const secret = "SECRET-ARGUMENT-VALUE";
    const error = refusal(() => parseArguments(`{"a": "${secret}`, "read_file"));
    assert.equal(JSON.stringify(error).includes(secret), false);
    assert.equal(String(error).includes(secret), false);
    assert.equal((error.stack ?? "").includes(secret), false);
  });
});
