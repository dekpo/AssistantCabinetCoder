import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { test } from "node:test";
import { makePng16 } from "../src/png";
import { CLOSING_SENTENCE, PLAIN_SENTENCE, minimalArguments, pickReply } from "../src/script";
import { describeMessage, describePart, hasToolResult, textChars } from "../src/structure";

test("the generated PNG is a valid 16 x 16 RGB image", () => {
  const png = Buffer.from(makePng16());
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 16);
  assert.equal(png.readUInt32BE(20), 16);
  const idatLength = png.readUInt32BE(33);
  assert.equal(png.toString("ascii", 37, 41), "IDAT");
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  assert.equal(raw.length, 16 * (1 + 16 * 3));
  assert.equal(png.toString("ascii", png.length - 8, png.length - 4), "IEND");
});

test("a plain turn gets the fixed sentence", () => {
  assert.deepEqual(pickReply({ tools: [], lastIsToolResult: false, lastUserText: "hello" }), {
    kind: "text",
    text: PLAIN_SENTENCE,
  });
});

test("tools present: the first tool whose name contains read is called", () => {
  const reply = pickReply({
    tools: [
      { name: "edit_file" },
      {
        name: "read_file",
        inputSchema: { required: ["path"], properties: { path: { type: "string" } } },
      },
    ],
    lastIsToolResult: false,
    lastUserText: "",
  });
  assert.deepEqual(reply, { kind: "toolCall", name: "read_file", input: { path: "spike" } });
});

test("the user naming spike_image gets that tool", () => {
  const reply = pickReply({
    tools: [{ name: "read_file" }, { name: "spike_image" }],
    lastIsToolResult: false,
    lastUserText: "please call spike_image",
  });
  assert.deepEqual(reply, { kind: "toolCall", name: "spike_image", input: {} });
});

test("a tool result in the history gets the closing sentence", () => {
  assert.deepEqual(
    pickReply({ tools: [{ name: "read_file" }], lastIsToolResult: true, lastUserText: "" }),
    { kind: "text", text: CLOSING_SENTENCE },
  );
});

test("tools without a read tool give the fixed sentence", () => {
  assert.deepEqual(
    pickReply({ tools: [{ name: "edit_file" }], lastIsToolResult: false, lastUserText: "" }),
    { kind: "text", text: PLAIN_SENTENCE },
  );
});

test("minimal arguments follow the required types", () => {
  assert.deepEqual(
    minimalArguments({
      required: ["a", "b", "c", "d", "e"],
      properties: {
        a: { type: "number" },
        b: { type: "boolean" },
        c: { type: "array" },
        d: { type: "object" },
      },
    }),
    { a: 1, b: false, c: [], d: {}, e: "spike" },
  );
  assert.deepEqual(minimalArguments(undefined), {});
});

test("structure description never contains the text itself", () => {
  const secret = "SECRET-TEXT-4711";
  const parts = [
    { value: secret },
    { callId: "c1", name: "read_file", input: { path: secret } },
    {
      callId: "c1",
      content: [{ mimeType: "image/png", data: new Uint8Array(7) }, { value: secret }],
    },
    { mimeType: "image/jpeg", data: new Uint8Array(3) },
  ];
  const line = describeMessage(0, "User", parts);
  assert.equal(
    line,
    "msg[0] role=User parts=[text:16, toolCall, toolResult[data:image/png:7b,text:16], data:image/jpeg:3b]",
  );
  assert.ok(!line.includes(secret));
  assert.equal(describePart(new Date()), "other:Date");
  assert.equal(textChars(parts), 16);
  assert.ok(hasToolResult(parts));
  assert.ok(!hasToolResult([{ value: "x" }]));
});
