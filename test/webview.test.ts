/**
 * The chat panel's script (`media/panel.js`) run in a fake document: what it draws from the
 * extension's messages and what it posts back. No editor, no browser, no network.
 */
import assert from "node:assert/strict";
import * as vm from "node:vm";
import { describe, it } from "node:test";
import { PANEL } from "../src/messages";
import { MAX_MESSAGE_CHARS, type ViewState } from "../src/protocol";
import { labels, viewTurn } from "../src/session";
import { MARKUP_TEXT } from "./stub-gateway/stub";
import { FakeElement, fakeWindow, type FakeWindow } from "./support/fake-dom";
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
    conversationId: undefined,
    turns: [],
    phase: "idle",
    since: undefined,
    models: ["cabinet-chat", "cabinet-code"],
    model: "cabinet-code",
    history: [],
    notice: undefined,
    draft: undefined,
    ...overrides,
  };
}

function one(page: FakeWindow, className: string): FakeElement {
  const found = page.app.byClass(className)[0];
  assert.ok(found !== undefined, className);
  return found;
}

/** The icon a button shows (its copy of the page's icon). */
function iconOf(element: FakeElement): string | null {
  const svg = element.children[0];
  return svg instanceof FakeElement ? svg.getAttribute("data-icon") : null;
}

function assistantTurn(
  text: string,
  extra: Partial<{
    state: "pending" | "complete" | "stopped";
    stoppedWhile: "reading" | "answering";
  }> = {},
) {
  return viewTurn({
    role: "assistant",
    text,
    at: 1,
    model: "cabinet-code",
    state: extra.state ?? "complete",
    ...(extra.stoppedWhile === undefined ? {} : { stoppedWhile: extra.stoppedWhile }),
  });
}

describe("the webview script", () => {
  it("says it is ready, then draws the labels, the models and the empty conversation", () => {
    const page = start();
    assert.deepEqual(page.posted[0], { type: "ready" });
    page.receive({ type: "state", state: state() });
    const select = one(page, "model");
    assert.deepEqual(
      select.children.map((option) => option.textContent),
      ["cabinet-chat", "cabinet-code"],
    );
    assert.equal((select.children[1] as FakeElement).selected, true);
    assert.equal(iconOf(one(page, "send")), "send");
    assert.equal(one(page, "send").textContent, "");
    assert.equal(one(page, "turns").children.length, 0);
    assert.equal(one(page, "input").placeholder, PANEL.placeholder);
    assert.equal(one(page, "input").rows, 1);
  });

  it("lays out the header's icons at the top and the model with the send button in the composer", () => {
    const page = start();
    page.receive({ type: "state", state: state() });
    const header = one(page, "header");
    assert.deepEqual(
      header.children.map((child) => (child as FakeElement).className),
      ["title", "icon-button new", "icon-button history-toggle"],
    );
    assert.equal(iconOf(one(page, "new")), "new");
    assert.equal(iconOf(one(page, "history-toggle")), "history");
    const composer = one(page, "composer");
    assert.equal((composer.children[0] as FakeElement).className, "input");
    const toolbar = composer.children[1] as FakeElement;
    assert.deepEqual(
      toolbar.children.map((child) => (child as FakeElement).className),
      ["model", "spacer", "send"],
    );
  });

  it("shows no word on its buttons: each icon has its label as tooltip and for screen readers", () => {
    const page = start();
    page.receive({
      type: "state",
      state: state({ history: [{ id: "mi9xk2ab-0123abcd", title: "first", updatedAt: 2 }] }),
    });
    one(page, "history-toggle").dispatch("click");
    const expected: [string, string][] = [
      ["send", PANEL.send],
      ["new", PANEL.newConversation],
      ["history-toggle", PANEL.back],
      ["entry-delete", PANEL.delete],
    ];
    for (const [className, text] of expected) {
      const element = one(page, className);
      assert.equal(element.textContent, "", className);
      assert.equal(element.title, text, className);
      assert.equal(element.getAttribute("aria-label"), text, className);
    }
    assert.equal(one(page, "model").getAttribute("aria-label"), PANEL.model);
  });

  it("starts the input on one line, grows it with the text, and enables send only with text", () => {
    const page = start();
    page.receive({ type: "state", state: state() });
    const input = one(page, "input");
    const send = one(page, "send");
    assert.equal(send.disabled, true);
    input.scrollHeight = 64;
    input.value = "first line\nsecond line";
    input.dispatch("input");
    assert.equal(input.style["height"], "64px");
    assert.equal(send.disabled, false);
    input.value = "   ";
    input.dispatch("input");
    assert.equal(send.disabled, true);
  });

  it("names the open conversation in the header", () => {
    const page = start();
    page.receive({
      type: "state",
      state: state({
        conversationId: "mi9xk2ab-0123abcd",
        history: [{ id: "mi9xk2ab-0123abcd", title: "first", updatedAt: 2 }],
      }),
    });
    assert.equal(one(page, "title").textContent, "first");
    one(page, "history-toggle").dispatch("click");
    assert.equal(one(page, "title").textContent, PANEL.history);
  });

  it("shows the model's markup as text: no element is made from the answer's text", () => {
    const page = start();
    page.receive({
      type: "state",
      state: state({ turns: [{ role: "user", text: "<b>hi</b>" }, assistantTurn(MARKUP_TEXT)] }),
    });
    const tags = new Set(page.created);
    for (const tag of ["script", "img", "a", "b", "iframe", "style"]) {
      assert.equal(tags.has(tag), false, tag);
    }
    const answer = one(page, "answer");
    assert.ok(answer.textContent.includes('<script>document.title = "stub-markup"</script>'));
    assert.ok(answer.textContent.includes('<img src="x" onerror="document.title = 1">'));
    assert.ok(answer.find((element) => element.tagName === "H1") !== undefined);
    assert.ok(answer.find((element) => element.tagName === "UL") !== undefined);
    assert.ok(answer.find((element) => element.tagName === "OL") !== undefined);
    assert.deepEqual(
      page.app.byClass("code-language").map((element) => element.textContent),
      ["ts", "html"],
    );
    assert.equal(one(page, "user-text").textContent, "<b>hi</b>");
  });

  it("sends with Enter, keeps Shift+Enter for a new line, and clears the input", () => {
    const page = start();
    page.receive({ type: "state", state: state() });
    const input = one(page, "input");
    input.value = "question";
    input.dispatch("keydown", { key: "Enter", shiftKey: true });
    assert.equal(
      page.posted.filter((message) => (message as { type: string }).type === "send").length,
      0,
    );
    input.dispatch("keydown", { key: "Enter", shiftKey: false });
    assert.deepEqual(
      page.posted.find((message) => (message as { type: string }).type === "send"),
      { type: "send", text: "question" },
    );
    assert.equal(input.value, "");
  });

  it("refuses a message over the limit with the extension's sentence, and sends nothing", () => {
    const page = start();
    page.receive({ type: "state", state: state() });
    const input = one(page, "input");
    input.value = "x".repeat(MAX_MESSAGE_CHARS + 1);
    one(page, "send").dispatch("click");
    assert.equal(one(page, "local-error").textContent, PANEL.tooLong(MAX_MESSAGE_CHARS));
    assert.equal(
      page.posted.some((message) => (message as { type: string }).type === "send"),
      false,
    );
  });

  it("turns Send into Stop while a request is open, shows the phase in the answer, and posts stop", () => {
    const page = start();
    page.receive({
      type: "state",
      state: state({
        phase: "reading",
        since: Date.now() - 3000,
        turns: [{ role: "user", text: "q" }, assistantTurn("", { state: "pending" })],
      }),
    });
    const send = one(page, "send");
    assert.equal(iconOf(send), "stop");
    assert.equal(send.title, PANEL.stop);
    assert.equal(send.disabled, false);
    // The phase is inside the answer that is coming, where its words will appear.
    const pending = one(page, "pending");
    const phase = pending.byClass("phase")[0];
    assert.ok(phase !== undefined);
    assert.equal(phase.className, "phase reading");
    assert.ok(one(page, "phase-text").textContent.startsWith(`${PANEL.reading} (3 `));
    assert.equal(one(page, "new").disabled, true);
    send.dispatch("click");
    assert.deepEqual(page.posted[page.posted.length - 1], { type: "stop" });
    page.receive({
      type: "answer",
      index: 1,
      turn: assistantTurn("word0 ", { state: "pending" }),
      phase: "answering",
    });
    assert.equal(one(page, "phase").className, "phase answering");
    assert.ok(one(page, "phase-text").textContent.startsWith(PANEL.answering));
    assert.equal(one(page, "answer").textContent, "word0 ");
    page.receive({
      type: "state",
      state: state({
        turns: [
          { role: "user", text: "q" },
          assistantTurn("word0 ", { state: "stopped", stoppedWhile: "reading" }),
        ],
      }),
    });
    assert.equal(iconOf(one(page, "send")), "send");
    assert.equal(one(page, "note").textContent, PANEL.stoppedReading);
    assert.equal(page.app.byClass("phase").length, 0);
  });

  it("lists the history, opens and deletes by id, and starts a new conversation", () => {
    const page = start();
    const history = [
      { id: "mi9xk2ab-0123abcd", title: "first", updatedAt: 2 },
      { id: "mi9xk2ac-0123abce", title: "", updatedAt: 1 },
    ];
    page.receive({ type: "state", state: state({ history }) });
    one(page, "history-toggle").dispatch("click");
    assert.equal(iconOf(one(page, "history-toggle")), "back");
    assert.equal(one(page, "history").hidden, false);
    assert.deepEqual(
      page.app.byClass("entry-title").map((element) => element.textContent),
      ["first", PANEL.untitled],
    );
    page.app.byClass("entry-delete")[1]?.dispatch("click");
    assert.deepEqual(page.posted[page.posted.length - 1], {
      type: "deleteConversation",
      id: "mi9xk2ac-0123abce",
    });
    page.app.byClass("entry-open")[0]?.dispatch("click");
    assert.deepEqual(page.posted[page.posted.length - 1], {
      type: "openConversation",
      id: "mi9xk2ab-0123abcd",
    });
    one(page, "new").dispatch("click");
    assert.deepEqual(page.posted[page.posted.length - 1], { type: "newConversation" });
  });

  it("puts back a draft only when the extension sends one, and shows a notice", () => {
    const page = start();
    page.receive({ type: "state", state: state({ draft: "kept" }) });
    const input = one(page, "input");
    assert.equal(input.value, "kept");
    input.value = "typing";
    page.receive({ type: "state", state: state({ notice: PANEL.saveFailed }) });
    assert.equal(input.value, "typing");
    assert.equal(one(page, "notice").textContent, PANEL.saveFailed);
    assert.equal(one(page, "notice").hidden, false);
  });

  it("posts the chosen model", () => {
    const page = start();
    page.receive({ type: "state", state: state() });
    const select = one(page, "model");
    select.value = "cabinet-chat";
    select.dispatch("change");
    assert.deepEqual(page.posted[page.posted.length - 1], {
      type: "selectModel",
      model: "cabinet-chat",
    });
  });
});
