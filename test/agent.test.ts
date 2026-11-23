/**
 * The panel's agent loop (Lot P0b) with a scripted driver: steps, tool calls in order, failures,
 * the step limit and Stop. No network, no editor.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_STEPS, runAgent, type AgentDriver } from "../src/agent";
import type { ChatResult } from "../src/chat";
import type { RawToolCall } from "../src/conversation";
import type { ToolOutcome } from "../src/tools";

function answer(calls: RawToolCall[] = [], extra: Partial<ChatResult> = {}): ChatResult {
  return {
    outcome: "complete",
    phase: "answering",
    durationMs: 1,
    ...(calls.length > 0 ? { toolCalls: calls } : {}),
    ...extra,
  };
}

function call(id: string, name = "read_file"): RawToolCall {
  return { id, name, arguments: '{"path":"a"}' };
}

const DONE: ToolOutcome = { status: "done", result: "ok", note: "n" };

class Script implements AgentDriver {
  readonly events: string[] = [];
  constructor(
    private readonly answers: ChatResult[],
    private readonly onRun: (call: RawToolCall) => Promise<ToolOutcome> = () =>
      Promise.resolve(DONE),
  ) {}

  send(step: number): Promise<ChatResult> {
    this.events.push(`send ${step}`);
    const next = this.answers.shift() ?? answer([call(`again-${step}`)]);
    return Promise.resolve(next);
  }

  recordCalls(calls: readonly RawToolCall[]): void {
    this.events.push(`record ${calls.map((entry) => entry.id).join(",")}`);
  }

  runCall(entry: RawToolCall): Promise<ToolOutcome> {
    this.events.push(`run ${entry.id}`);
    return this.onRun(entry);
  }

  recordOutcome(entry: RawToolCall, outcome: ToolOutcome): void {
    this.events.push(`outcome ${entry.id} ${outcome.status}`);
  }
}

describe("the agent loop", () => {
  it("ends at once on a final answer", async () => {
    const script = new Script([answer()]);
    const end = await runAgent(script, new AbortController().signal);
    assert.deepEqual(
      [end.outcome, end.steps, end.stepLimit, end.toolsRan],
      ["complete", 1, false, false],
    );
    assert.deepEqual(script.events, ["send 1"]);
  });

  it("records the calls, runs them in order, then sends again", async () => {
    const script = new Script([answer([call("a"), call("b")]), answer([call("c")]), answer()]);
    const end = await runAgent(script, new AbortController().signal);
    assert.deepEqual([end.outcome, end.steps, end.toolsRan], ["complete", 3, true]);
    assert.deepEqual(script.events, [
      "send 1",
      "record a,b",
      "run a",
      "outcome a done",
      "run b",
      "outcome b done",
      "send 2",
      "record c",
      "run c",
      "outcome c done",
      "send 3",
    ]);
  });

  it("stops at a failed step and keeps its code, with no retry", async () => {
    const failed = answer([], { outcome: "failed", code: "context_too_large" });
    const script = new Script([answer([call("a")]), failed]);
    const end = await runAgent(script, new AbortController().signal);
    assert.equal(end.outcome, "failed");
    assert.equal(end.last.code, "context_too_large");
    assert.equal(script.events.filter((event) => event.startsWith("send")).length, 2);
  });

  it("ignores tool calls of an answer that did not complete", async () => {
    const stopped = answer([call("a")], { outcome: "stopped", phase: "reading" });
    const script = new Script([stopped]);
    const end = await runAgent(script, new AbortController().signal);
    assert.equal(end.outcome, "stopped");
    assert.deepEqual(script.events, ["send 1"]);
  });

  it("stops after the step limit with the model still calling tools", async () => {
    const script = new Script([]);
    const end = await runAgent(script, new AbortController().signal);
    assert.equal(MAX_STEPS, 12);
    assert.deepEqual([end.outcome, end.steps, end.stepLimit], ["complete", MAX_STEPS, true]);
    assert.equal(script.events.filter((event) => event.startsWith("send")).length, MAX_STEPS);
  });

  it("on Stop during a tool, runs no further call and sends no further step", async () => {
    const controller = new AbortController();
    const script = new Script([answer([call("a"), call("b")])], (entry) => {
      controller.abort();
      return Promise.resolve({ ...DONE, status: entry.id === "a" ? "stopped" : "done" });
    });
    const end = await runAgent(script, controller.signal);
    assert.deepEqual([end.outcome, end.steps, end.toolsRan], ["stopped", 1, true]);
    assert.deepEqual(script.events, ["send 1", "record a,b", "run a", "outcome a stopped"]);
  });
});
