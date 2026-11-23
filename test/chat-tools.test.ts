/**
 * The tool calls of a streamed answer, as the panel reads them (Lot P0b): pieces joined by index,
 * a call without an id, the result and the log line (the count and the extension's own names only).
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { ToolCallCollector, readToolCallDeltas, streamChat } from "../src/chat";
import type { ChatBody } from "../src/conversation";
import { formatCallLine, toolNamesForLog, type CallRecord } from "../src/log";
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from "../src/tools";
import { closeAgents } from "../src/transport";
import { startStub } from "./stub-gateway/stub";

after(() => closeAgents());

describe("reading tool calls from the stream", () => {
  it("reads the pieces of a chunk, and ignores a chunk without calls", () => {
    assert.deepEqual(
      readToolCallDeltas({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"pa' } },
                { function: { arguments: 5 } },
                "junk",
              ],
            },
          },
        ],
      }),
      [
        { index: 0, id: "call_1", name: "read_file", arguments: '{"pa' },
        { index: 1, id: undefined, name: undefined, arguments: "" },
      ],
    );
    assert.deepEqual(readToolCallDeltas({ choices: [{ delta: { content: "x" } }] }), []);
    assert.deepEqual(readToolCallDeltas(null), []);
  });

  it("joins split calls by index, keeps the first id and name, and names a call without id", () => {
    const collector = new ToolCallCollector();
    collector.add([{ index: 1, id: undefined, name: "list_files", arguments: "{" }]);
    collector.add([{ index: 0, id: "call_a", name: "read_file", arguments: '{"path":' }]);
    collector.add([{ index: 0, id: "other", name: "other", arguments: '"a"}' }]);
    collector.add([{ index: 1, id: undefined, name: undefined, arguments: "}" }]);
    assert.deepEqual(collector.done(), [
      { id: "call_a", name: "read_file", arguments: '{"path":"a"}' },
      { id: "call_1", name: "list_files", arguments: "{}" },
    ]);
  });

  it("gives the loop the stub's call and logs its count and name, never its arguments", async () => {
    const stub = await startStub();
    const logs: CallRecord[] = [];
    const body: ChatBody = {
      model: "cabinet-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "[stub:tool-call:search_text] find" },
      ],
      stream: true,
      stream_options: { include_usage: true },
      tools: TOOL_DEFINITIONS,
    };
    try {
      const result = await streamChat(
        { baseUrl: stub.url, timeoutSeconds: 10 },
        body,
        { onFirstEvent: () => undefined, onText: () => undefined },
        new AbortController().signal,
        (record) => logs.push(record),
      );
      assert.equal(result.outcome, "complete");
      assert.equal(result.finish, "tool_calls");
      assert.deepEqual(result.toolCalls, [
        { id: "call_000000000000000000000001", name: "search_text", arguments: '{"query":"stub"}' },
      ]);
      const line = formatCallLine(logs[0] as CallRecord, new Date(0));
      assert.match(line, / tool_calls=1 /);
      assert.match(line, / tools=search_text$/);
      assert.equal(line.includes('stub"'), false);
    } finally {
      await stub.close();
    }
  });

  it("writes a name the model invents as other", () => {
    assert.deepEqual(toolNamesForLog(["read_file", "rm -rf", "other", "propose_edit"]), [
      "read_file",
      "other",
      "other",
      "propose_edit",
    ]);
    const line = formatCallLine(
      {
        call: "tool",
        durationMs: 2,
        tool: "/Users/x/secret",
        outcome: "some text",
        reason: "a reason with words",
        tools: ["read_file", "SECRET"],
        step: 3,
      },
      new Date(0),
    );
    assert.equal(line, "1970-01-01T00:00:00.000Z call=tool ms=2 step=3 tools=read_file,other");
  });
});
