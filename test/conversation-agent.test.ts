/**
 * The conversation with the agent loop's steps (Lot P0b): the request body of the loop, the steps
 * recorded in the open answer, the saved format 2 and the reading of format 1.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentRequestBody,
  beginTurn,
  closeOpenCalls,
  finishAnswer,
  newConversation,
  noteOf,
  recordCalls,
  requestBody,
  type AssistantTurn,
  type Conversation,
} from "../src/conversation";
import {
  HISTORY_FORMAT,
  INDEX_FORMAT,
  parseConversation,
  parseIndex,
  serializeConversation,
  serializeIndex,
} from "../src/history";

const T0 = 1_700_000_000_000;

function withSteps(): Conversation {
  const conversation = newConversation("mi9xk2ab-0123abcd", T0, "cabinet-chat");
  beginTurn(conversation, "explain main.py", "cabinet-chat", T0 + 1);
  const answer = conversation.turns[1] as AssistantTurn;
  answer.text = "Let me look.";
  const [first] = recordCalls(conversation, [
    { id: "call_1", name: "read_file", arguments: '{"path":"main.py"}' },
  ]);
  assert.ok(first !== undefined);
  first.result = "File main.py (lines 1-1 of 1):\n1\tprint(1)";
  first.status = "done";
  first.note = "lines 1-1 of 1";
  recordCalls(conversation, [
    { id: "call_2", name: "list_files", arguments: "{}" },
    { id: "call_3", name: "search_text", arguments: '{"query":"x"}' },
  ]);
  return conversation;
}

describe("the steps of an answer", () => {
  it("move the text before the calls into a step, and start the next text empty", () => {
    const conversation = withSteps();
    const answer = conversation.turns[1] as AssistantTurn;
    assert.equal(answer.text, "");
    assert.equal(answer.steps?.length, 2);
    assert.equal(answer.steps?.[0]?.text, "Let me look.");
    assert.equal(answer.steps?.[1]?.text, "");
  });

  it("go into the loop's request: system first, the calls, one tool message per call", () => {
    const conversation = withSteps();
    closeOpenCalls(conversation, "Not run.", "stopped");
    const body = agentRequestBody(conversation, "cabinet-chat", "SYSTEM", [{ type: "function" }]);
    assert.deepEqual(body.tools, [{ type: "function" }]);
    assert.deepEqual(body.messages, [
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "explain main.py" },
      {
        role: "assistant",
        content: "Let me look.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"main.py"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "File main.py (lines 1-1 of 1):\n1\tprint(1)",
      },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_2", type: "function", function: { name: "list_files", arguments: "{}" } },
          {
            id: "call_3",
            type: "function",
            function: { name: "search_text", arguments: '{"query":"x"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_2", content: "Not run." },
      { role: "tool", tool_call_id: "call_3", content: "Not run." },
    ]);
  });

  it("give a call that never ran the stopped result, and keep a finished one", () => {
    const conversation = withSteps();
    closeOpenCalls(conversation, "Not run.", "stopped");
    const steps = (conversation.turns[1] as AssistantTurn).steps ?? [];
    assert.equal(steps[0]?.calls[0]?.status, "done");
    assert.deepEqual(
      steps[1]?.calls.map((call) => [call.status, call.result, call.note]),
      [
        ["stopped", "Not run.", "stopped"],
        ["stopped", "Not run.", "stopped"],
      ],
    );
  });

  it("stay in the next message's request once the answer ended", () => {
    const conversation = withSteps();
    closeOpenCalls(conversation, "Not run.", "stopped");
    (conversation.turns[1] as AssistantTurn).text = "Done.";
    finishAnswer(conversation, { outcome: "complete", phase: "answering" }, T0 + 2);
    beginTurn(conversation, "next", "cabinet-chat", T0 + 3);
    const messages = requestBody(conversation, "cabinet-chat").messages;
    assert.equal(messages.length, 8);
    assert.deepEqual(messages[6], { role: "assistant", content: "Done." });
    assert.deepEqual(messages[7], { role: "user", content: "next" });
  });

  it("leave the plain chat's body unchanged when there are no steps", () => {
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, "m");
    beginTurn(conversation, "hello", "m", T0 + 1);
    assert.deepEqual(requestBody(conversation, "m"), {
      model: "m",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it("note the step limit under the answer", () => {
    const conversation = withSteps();
    finishAnswer(
      conversation,
      { outcome: "complete", phase: "answering", stepLimit: true },
      T0 + 2,
    );
    assert.equal(noteOf(conversation.turns[1] as AssistantTurn), "stepLimit");
  });
});

describe("the saved format 2", () => {
  it("is written, and reads back exactly with its steps and the step limit", () => {
    const conversation = withSteps();
    closeOpenCalls(conversation, "Not run.", "stopped");
    finishAnswer(
      conversation,
      { outcome: "complete", phase: "answering", stepLimit: true },
      T0 + 2,
    );
    const text = serializeConversation(conversation);
    assert.equal((JSON.parse(text) as { format: number }).format, 2);
    assert.equal(HISTORY_FORMAT, 2);
    assert.deepEqual(parseConversation(text), conversation);
  });

  it("still reads a conversation saved in format 1 by version 0.3.0", () => {
    const format1 = JSON.stringify({
      format: 1,
      id: "mi9xk2ab-0123abcd",
      title: "hello",
      createdAt: T0,
      updatedAt: T0 + 2,
      model: "cabinet-chat",
      turns: [
        { role: "user", text: "hello", at: T0 + 1 },
        {
          role: "assistant",
          text: "Hi.",
          at: T0 + 1,
          model: "cabinet-chat",
          state: "complete",
          promptTokens: 31,
        },
      ],
    });
    const read = parseConversation(format1);
    assert.ok(read !== undefined);
    assert.equal((read.turns[1] as AssistantTurn).text, "Hi.");
    assert.equal((read.turns[1] as AssistantTurn).steps, undefined);
  });

  it("refuses steps of a wrong shape and a newer format", () => {
    const good = JSON.parse(serializeConversation(withSteps())) as {
      turns: Record<string, unknown>[];
    };
    const broken = (steps: unknown): string =>
      JSON.stringify({ ...good, turns: [good.turns[0], { ...good.turns[1], steps }] });
    for (const steps of [
      "no",
      [{ text: 1, calls: [] }],
      [{ text: "", calls: "no" }],
      [{ text: "", calls: [{ id: "a", name: "b" }] }],
      [{ text: "", calls: [{ id: "a", name: "b", arguments: "{}", result: 5 }] }],
      [{ text: "", calls: [{ id: "x".repeat(300), name: "b", arguments: "{}" }] }],
    ]) {
      assert.equal(parseConversation(broken(steps)), undefined, JSON.stringify(steps).slice(0, 80));
    }
    assert.equal(parseConversation(JSON.stringify({ ...good, format: 3 })), undefined);
  });

  it("keeps the index at its own format 1", () => {
    assert.equal(INDEX_FORMAT, 1);
    const index = serializeIndex([{ id: "mi9xk2ab-0123abcd", title: "t", updatedAt: 1 }]);
    assert.equal((JSON.parse(index) as { format: number }).format, 1);
    assert.equal(parseIndex(index)?.length, 1);
  });
});
