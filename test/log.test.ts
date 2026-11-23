import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallLog, formatCallLine, type CallRecord } from "../src/log";

const NOW = new Date("2026-10-27T10:00:00.000Z");

describe("formatCallLine", () => {
  it("writes the allowed fields in a fixed order", () => {
    const line = formatCallLine(
      {
        call: "chat",
        status: 200,
        durationMs: 1234,
        alias: "cabinet-code",
        promptTokens: 812,
        completionTokens: 24,
        toolCalls: 1,
      },
      NOW,
    );
    assert.equal(
      line,
      "2026-10-27T10:00:00.000Z call=chat status=200 ms=1234 alias=cabinet-code prompt_tokens=812 completion_tokens=24 tool_calls=1",
    );
  });

  it("writes a machine code and leaves out what is unknown", () => {
    assert.equal(
      formatCallLine({ call: "models", durationMs: 5, code: "ide_surface_off", status: 404 }, NOW),
      "2026-10-27T10:00:00.000Z call=models status=404 ms=5 code=ide_surface_off",
    );
  });

  it("drops a value that does not have the expected shape, so text cannot get in", () => {
    const hostile = {
      call: "models",
      durationMs: -1,
      status: "SECRET-STATUS",
      alias: "has spaces SECRET-ALIAS",
      promptTokens: 1.5,
      toolCalls: "SECRET-COUNT",
      code: "SECRET-CODE",
      text: "SECRET-TEXT",
      key: "SECRET-KEY",
    } as unknown as CallRecord;
    const line = formatCallLine(hostile, NOW);
    assert.equal(line, "2026-10-27T10:00:00.000Z call=models");
    assert.equal(line.includes("SECRET"), false);
  });

  it("drops an unknown call name", () => {
    const line = formatCallLine(
      { call: "SECRET-CALL", durationMs: 1 } as unknown as CallRecord,
      NOW,
    );
    assert.equal(line, "2026-10-27T10:00:00.000Z ms=1");
  });
});

describe("CallLog", () => {
  it("sends one line per record to the sink", () => {
    const lines: string[] = [];
    const log = new CallLog(
      (line) => lines.push(line),
      () => NOW,
    );
    log.record({ call: "health", durationMs: 3, status: 200 });
    log.record({ call: "models", durationMs: 9, status: 200 });
    assert.deepEqual(lines, [
      "2026-10-27T10:00:00.000Z call=health status=200 ms=3",
      "2026-10-27T10:00:00.000Z call=models status=200 ms=9",
    ]);
  });
});
