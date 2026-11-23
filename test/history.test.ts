import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beginTurn, finishAnswer, newConversation, type Conversation } from "../src/conversation";
import {
  HISTORY_FORMAT,
  parseConversation,
  parseIndex,
  serializeConversation,
  serializeIndex,
  sortSummaries,
} from "../src/history";

const T0 = 1_700_000_000_000;

function sample(): Conversation {
  const conversation = newConversation("mi9xk2ab-0123abcd", T0, "cabinet-chat");
  beginTurn(conversation, "question", "cabinet-chat", T0 + 1);
  conversation.turns[1]!.text = "answer";
  finishAnswer(
    conversation,
    {
      outcome: "failed",
      phase: "answering",
      code: "context_too_large",
      overflow: { kind: "tokens", estimatedTokens: 50500, contextWindow: 32768 },
      promptTokens: 12,
      completionTokens: 3,
      durationMs: 40,
      firstMs: 5,
    },
    T0 + 2,
  );
  beginTurn(conversation, "again", "cabinet-chat", T0 + 3);
  finishAnswer(conversation, { outcome: "stopped", phase: "reading" }, T0 + 4);
  beginTurn(conversation, "third", "cabinet-chat", T0 + 5);
  return conversation;
}

describe("the conversation file", () => {
  it("reads back exactly what was written, an open answer included", () => {
    const conversation = sample();
    assert.deepEqual(parseConversation(serializeConversation(conversation)), conversation);
  });

  it("writes the format number and no field beyond the conversation's own", () => {
    const parsed = JSON.parse(serializeConversation(sample())) as Record<string, unknown>;
    assert.equal(parsed["format"], HISTORY_FORMAT);
    assert.deepEqual(Object.keys(parsed).sort(), [
      "createdAt",
      "format",
      "id",
      "model",
      "title",
      "turns",
      "updatedAt",
    ]);
  });

  it("refuses a newer format, a damaged file and any turn of an unknown shape", () => {
    const good = JSON.parse(serializeConversation(sample())) as Record<string, unknown>;
    const variants: unknown[] = [
      { ...good, format: HISTORY_FORMAT + 1 },
      { ...good, id: "../escape" },
      { ...good, turns: "nope" },
      { ...good, turns: [{ role: "system", text: "x", at: 1 }] },
      { ...good, turns: [{ role: "assistant", text: "x", at: 1, model: "m", state: "odd" }] },
      {
        ...good,
        turns: [{ role: "assistant", text: "x", at: 1, model: "bad model", state: "complete" }],
      },
      { ...good, turns: [{ role: "user", text: 5, at: 1 }] },
      { ...good, createdAt: -1 },
      { ...good, model: 42 },
    ];
    for (const variant of variants) {
      assert.equal(
        parseConversation(JSON.stringify(variant)),
        undefined,
        JSON.stringify(variant).slice(0, 120),
      );
    }
    assert.equal(parseConversation("{ not json"), undefined);
    assert.equal(parseConversation(""), undefined);
    assert.equal(parseConversation("[]"), undefined);
  });

  it("drops an unknown machine code and malformed numbers instead of trusting them", () => {
    const good = JSON.parse(serializeConversation(sample())) as {
      turns: Record<string, unknown>[];
    };
    good.turns[1] = {
      ...good.turns[1],
      code: "SECRET-CODE",
      overflow: { kind: "tokens" },
      durationMs: 1.5,
    };
    const parsed = parseConversation(JSON.stringify(good));
    assert.ok(parsed !== undefined);
    const turn = parsed.turns[1];
    assert.ok(turn?.role === "assistant");
    assert.equal(turn.code, undefined);
    assert.equal(turn.overflow, undefined);
    assert.equal(turn.durationMs, undefined);
  });
});

describe("the index", () => {
  it("reads back its entries, newest first", () => {
    const entries = [
      { id: "aaaaaa-00000001", title: "old", updatedAt: 1 },
      { id: "bbbbbb-00000002", title: "new", updatedAt: 3 },
      { id: "cccccc-00000003", title: "tie", updatedAt: 3 },
    ];
    assert.deepEqual(parseIndex(serializeIndex(entries)), sortSummaries(entries));
    assert.deepEqual(
      sortSummaries(entries).map((entry) => entry.title),
      ["new", "tie", "old"],
    );
  });

  it("is unreadable when any entry is malformed", () => {
    assert.equal(
      parseIndex(JSON.stringify({ format: 1, entries: [{ id: "../x", title: "", updatedAt: 1 }] })),
      undefined,
    );
    assert.equal(parseIndex(JSON.stringify({ format: 2, entries: [] })), undefined);
    assert.equal(parseIndex("garbage"), undefined);
  });
});
