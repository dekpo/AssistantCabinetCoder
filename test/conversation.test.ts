import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_TITLE_CHARS,
  beginTurn,
  closeInterrupted,
  finishAnswer,
  newConversation,
  noteOf,
  pendingAnswer,
  phaseAfter,
  requestBody,
  titleFrom,
  type AssistantTurn,
} from "../src/conversation";
import { PANEL } from "../src/messages";

const T0 = 1_700_000_000_000;

function lastAnswer(turns: { role: string }[]): AssistantTurn {
  const last = turns[turns.length - 1] as AssistantTurn;
  assert.equal(last.role, "assistant");
  return last;
}

describe("the conversation", () => {
  it("builds the request body from the turns, with no system prompt", () => {
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, "cabinet-chat");
    assert.equal(beginTurn(conversation, "first question", "cabinet-chat", T0 + 1), true);
    assert.deepEqual(requestBody(conversation, "cabinet-chat"), {
      model: "cabinet-chat",
      messages: [{ role: "user", content: "first question" }],
      stream: true,
      stream_options: { include_usage: true },
    });
    pendingAnswer(conversation)!.text = "first answer";
    finishAnswer(conversation, { outcome: "complete", phase: "answering" }, T0 + 2);
    beginTurn(conversation, "second question", "cabinet-code", T0 + 3);
    assert.deepEqual(requestBody(conversation, "cabinet-code").messages, [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question" },
    ]);
    assert.equal(conversation.model, "cabinet-code");
  });

  it("allows one request at a time", () => {
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, undefined);
    assert.equal(beginTurn(conversation, "one", "m", T0), true);
    assert.equal(beginTurn(conversation, "two", "m", T0), false);
    assert.equal(conversation.turns.length, 2);
    finishAnswer(conversation, { outcome: "complete", phase: "answering" }, T0);
    assert.equal(beginTurn(conversation, "two", "m", T0), true);
  });

  it("keeps a stopped answer's words, marked stopped, and sends them again", () => {
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, "m");
    beginTurn(conversation, "question", "m", T0);
    pendingAnswer(conversation)!.text = "partial words";
    finishAnswer(conversation, { outcome: "stopped", phase: "answering", durationMs: 900 }, T0 + 9);
    const answer = lastAnswer(conversation.turns);
    assert.equal(answer.state, "stopped");
    assert.equal(answer.stoppedWhile, "answering");
    assert.equal(answer.text, "partial words");
    assert.equal(answer.durationMs, 900);
    assert.equal(conversation.updatedAt, T0 + 9);
    beginTurn(conversation, "go on", "m", T0 + 10);
    assert.deepEqual(
      requestBody(conversation, "m").messages.map((message) => message.content),
      ["question", "partial words", "go on"],
    );
  });

  it("leaves out an answer that failed with no words", () => {
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, "m");
    beginTurn(conversation, "question", "m", T0);
    finishAnswer(conversation, { outcome: "failed", phase: "reading", code: "server_busy" }, T0);
    assert.equal(lastAnswer(conversation.turns).code, "server_busy");
    beginTurn(conversation, "again", "m", T0);
    assert.deepEqual(requestBody(conversation, "m").messages, [
      { role: "user", content: "question" },
      { role: "user", content: "again" },
    ]);
  });

  it("names the two phases of a request and the stop sentence each gives", () => {
    assert.equal(phaseAfter(false), "reading");
    assert.equal(phaseAfter(true), "answering");
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, "m");
    beginTurn(conversation, "q", "m", T0);
    finishAnswer(conversation, { outcome: "stopped", phase: "reading" }, T0);
    const reading = lastAnswer(conversation.turns);
    assert.equal(noteOf(reading), "stoppedReading");
    assert.match(PANEL[noteOf(reading) as "stoppedReading"], /before the first word/);
    beginTurn(conversation, "q", "m", T0);
    finishAnswer(conversation, { outcome: "stopped", phase: "answering" }, T0);
    const answering = lastAnswer(conversation.turns);
    assert.equal(noteOf(answering), "stoppedAnswering");
    assert.equal(PANEL.stoppedAnswering, "Stopped.");
  });

  it("notes an answer cut by the output ceiling, and a complete one has no note", () => {
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, "m");
    beginTurn(conversation, "q", "m", T0);
    finishAnswer(conversation, { outcome: "complete", phase: "answering", finish: "length" }, T0);
    assert.equal(noteOf(lastAnswer(conversation.turns)), "lengthReached");
    beginTurn(conversation, "q", "m", T0);
    finishAnswer(conversation, { outcome: "complete", phase: "answering", finish: "stop" }, T0);
    assert.equal(noteOf(lastAnswer(conversation.turns)), "none");
  });

  it("marks an answer left open by a closed window as interrupted", () => {
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, "m");
    beginTurn(conversation, "q", "m", T0);
    pendingAnswer(conversation)!.text = "half";
    assert.equal(closeInterrupted(conversation), true);
    assert.equal(lastAnswer(conversation.turns).state, "interrupted");
    assert.equal(noteOf(lastAnswer(conversation.turns)), "interrupted");
    assert.equal(closeInterrupted(conversation), false);
    assert.equal(pendingAnswer(conversation), undefined);
  });

  it("titles a conversation with its first message on one line", () => {
    assert.equal(titleFrom("  How do I\n\nsort   a list?  "), "How do I sort a list?");
    const long = titleFrom("word ".repeat(100));
    assert.equal(long.length, MAX_TITLE_CHARS);
    assert.ok(long.endsWith("..."));
    const conversation = newConversation("mi9xk2ab-0123abcd", T0, "m");
    beginTurn(conversation, "first", "m", T0);
    finishAnswer(conversation, { outcome: "complete", phase: "answering" }, T0);
    beginTurn(conversation, "second", "m", T0);
    assert.equal(conversation.title, "first");
  });
});
