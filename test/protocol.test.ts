import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_MESSAGE_CHARS, parseWebviewMessage } from "../src/protocol";

const ID = "mi9xk2ab-0123abcd";

describe("parseWebviewMessage", () => {
  it("accepts every valid message as it is", () => {
    const valid = [
      { type: "ready" },
      { type: "stop" },
      { type: "newConversation" },
      { type: "send", text: "hello" },
      { type: "send", text: "x".repeat(MAX_MESSAGE_CHARS) },
      { type: "draft", text: "" },
      { type: "draft", text: "half a sentence" },
      { type: "openConversation", id: ID },
      { type: "deleteConversation", id: ID },
      { type: "selectModel", model: "qwen2.5-coder:14b" },
    ];
    for (const message of valid) {
      assert.deepEqual(parseWebviewMessage(message), message, JSON.stringify(message).slice(0, 80));
    }
  });

  it("drops unknown types and values that are not messages", () => {
    for (const value of [
      undefined,
      null,
      "ready",
      42,
      [],
      [{ type: "ready" }],
      {},
      { type: "eval" },
      { type: "READY" },
      { type: 1 },
      { kind: "ready" },
    ]) {
      assert.equal(parseWebviewMessage(value), undefined, String(JSON.stringify(value)));
    }
  });

  it("drops missing fields, wrong types and extra fields", () => {
    for (const value of [
      { type: "send" },
      { type: "send", text: 5 },
      { type: "send", text: ["a"] },
      { type: "send", text: "a", model: "x" },
      { type: "ready", extra: true },
      { type: "stop", id: ID },
      { type: "draft" },
      { type: "openConversation" },
      { type: "openConversation", id: 7 },
      { type: "selectModel", model: null },
    ]) {
      assert.equal(parseWebviewMessage(value), undefined, JSON.stringify(value));
    }
  });

  it("drops empty and oversized text", () => {
    assert.equal(parseWebviewMessage({ type: "send", text: "" }), undefined);
    assert.equal(parseWebviewMessage({ type: "send", text: " \n\t " }), undefined);
    assert.equal(
      parseWebviewMessage({ type: "send", text: "x".repeat(MAX_MESSAGE_CHARS + 1) }),
      undefined,
    );
    assert.equal(
      parseWebviewMessage({ type: "draft", text: "x".repeat(MAX_MESSAGE_CHARS + 1) }),
      undefined,
    );
  });

  it("drops ids and model names that could name a path or carry text", () => {
    for (const id of ["../index", "a/b", "", "MI9XK2AB-0123ABCD", `${ID}.json`, "x".repeat(200)]) {
      assert.equal(parseWebviewMessage({ type: "openConversation", id }), undefined, id);
      assert.equal(parseWebviewMessage({ type: "deleteConversation", id }), undefined, id);
    }
    for (const model of ["", "has space", "a\nb", "x".repeat(129), "<script>"]) {
      assert.equal(parseWebviewMessage({ type: "selectModel", model }), undefined, model);
    }
  });
});
