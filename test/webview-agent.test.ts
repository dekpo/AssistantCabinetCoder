/**
 * The webview's drawing of the agent loop (Lot P0b): one line per tool call, the decision icons of
 * a change waiting, what they post, the phases between steps, the note of the step limit and the
 * line that says why the tools are off. Run in the fake document, like test/webview.test.ts.
 */
import assert from "node:assert/strict";
import * as vm from "node:vm";
import { describe, it } from "node:test";
import { AGENT_PANEL, PANEL } from "../src/messages";
import { MAX_MESSAGE_CHARS, type ViewState, type ViewTurn } from "../src/protocol";
import { labels, viewTurn } from "../src/session";
import { fakeWindow, type FakeElement, type FakeWindow } from "./support/fake-dom";
import { readText } from "./support/repo";

const SCRIPT = readText("media/panel.js");

function start(): FakeWindow {
  const page = fakeWindow();
  vm.runInNewContext(SCRIPT, page.sandbox);
  page.receive({
    type: "labels",
    labels: labels(),
    maxChars: MAX_MESSAGE_CHARS,
    tooLong: PANEL.tooLong(MAX_MESSAGE_CHARS),
  });
  return page;
}

function state(overrides: Partial<ViewState> = {}): ViewState {
  return {
    conversationId: "mi9xk2ab-0123abcd",
    turns: [],
    phase: "idle",
    since: undefined,
    models: ["cabinet-chat"],
    model: "cabinet-chat",
    history: [],
    notice: undefined,
    draft: undefined,
    ...overrides,
  };
}

const HOSTILE = '<img src=x onerror="document.title=1">';

function agentTurn(pending: boolean, awaiting: string | undefined): ViewTurn {
  return viewTurn(
    {
      role: "assistant",
      text: "Done.",
      at: 1,
      model: "cabinet-chat",
      state: pending ? "pending" : "complete",
      steps: [
        {
          text: "Looking first.",
          calls: [
            {
              id: "c1",
              name: "read_file",
              arguments: JSON.stringify({ path: HOSTILE }),
              result: "x",
              status: "done",
              note: "lines 1-2 of 2",
            },
            { id: "c2", name: "made_up", arguments: "{}", result: "x", status: "failed" },
          ],
        },
        {
          text: "",
          calls: [
            {
              id: "c3",
              name: "propose_edit",
              arguments: JSON.stringify({ path: "a.py", old_text: "SECRET", new_text: "x" }),
            },
          ],
        },
      ],
    },
    awaiting,
  );
}

function one(page: FakeWindow, className: string): FakeElement {
  const found = page.app.byClass(className)[0];
  assert.ok(found !== undefined, className);
  return found;
}

describe("the webview's agent loop", () => {
  it("draws the text before the calls, one line per call, then the final text", () => {
    const page = start();
    page.receive({
      type: "state",
      state: state({ turns: [{ role: "user", text: "q" }, agentTurn(false, undefined)] }),
    });
    const answer = one(page, "answer");
    assert.deepEqual(
      answer.children.map((child) => (child as FakeElement).className || child.textContent),
      ["Looking first.", "tool-calls", "tool-calls", "Done."],
    );
    const lines = page.app.byClass("tool-call");
    assert.deepEqual(
      lines.map((line) => line.className),
      ["tool-call done", "tool-call failed", "tool-call running"],
    );
    assert.equal(one(page, "tool-label").textContent, AGENT_PANEL.toolRead);
    assert.equal(one(page, "tool-target").textContent, HOSTILE, "a hostile path stays text");
    assert.equal(
      page.app.find((element) => element.tagName === "IMG"),
      undefined,
    );
    assert.equal(page.app.byClass("tool-label")[1]?.textContent, AGENT_PANEL.toolOther);
    assert.equal(answer.textContent.includes("SECRET"), false, "an edit's text is never shown");
    assert.equal(page.app.byClass("decisions").length, 0);
  });

  it("offers Show, Reject and Accept as icons on a change waiting, and posts the choice", () => {
    const page = start();
    page.receive({
      type: "state",
      state: state({
        phase: "approval",
        since: Date.now(),
        turns: [{ role: "user", text: "q" }, agentTurn(true, "c3")],
      }),
    });
    assert.equal(page.app.byClass("tool-call")[2]?.className, "tool-call awaiting");
    const buttons = one(page, "decisions").children as FakeElement[];
    assert.deepEqual(
      buttons.map((button) => [
        button.getAttribute("data-action"),
        button.title,
        button.textContent,
      ]),
      [
        ["diff", AGENT_PANEL.showDiff, ""],
        ["reject", AGENT_PANEL.reject, ""],
        ["accept", AGENT_PANEL.accept, ""],
      ],
    );
    for (const button of buttons) {
      button.dispatch("click");
    }
    assert.deepEqual(page.posted.slice(-3), [
      { type: "showDiff" },
      { type: "rejectEdit" },
      { type: "acceptEdit" },
    ]);
    assert.equal(
      one(page, "phase-text").textContent.startsWith(AGENT_PANEL.awaitingDecision),
      true,
    );
  });

  it("names the phase of a tool running, and keeps the stop button", () => {
    const page = start();
    page.receive({
      type: "state",
      state: state({
        phase: "tool",
        since: Date.now(),
        turns: [{ role: "user", text: "q" }, agentTurn(true, undefined)],
      }),
    });
    assert.equal(one(page, "phase-text").textContent.startsWith(AGENT_PANEL.runningTool), true);
    assert.equal(one(page, "send").getAttribute("data-action"), "stop");
  });

  it("shows the step limit's note and the line about the tools being off", () => {
    const page = start();
    const limited = viewTurn({
      role: "assistant",
      text: "",
      at: 1,
      model: "cabinet-chat",
      state: "complete",
      stepLimit: true,
    });
    page.receive({
      type: "state",
      state: state({
        turns: [{ role: "user", text: "q" }, limited],
        toolsNote: AGENT_PANEL.toolsUntrusted,
      }),
    });
    assert.equal(one(page, "note").textContent, AGENT_PANEL.stepLimit);
    const note = one(page, "tools-note");
    assert.equal(note.hidden, false);
    assert.equal(note.textContent, AGENT_PANEL.toolsUntrusted);
    page.receive({ type: "state", state: state() });
    assert.equal(one(page, "tools-note").hidden, true);
  });
});
