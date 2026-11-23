/* global acquireVsCodeApi, document, window, setTimeout, clearTimeout, setInterval, clearInterval */
/**
 * The chat panel's webview. Plain JavaScript, no framework, no build step, no network: it talks to
 * the extension with postMessage only. It holds no sentence of its own (the labels come from the
 * extension) and keeps nothing: the extension redraws it whenever it is shown again.
 * Every element is built with createElement and every text is set with textContent, so nothing
 * the model or the user writes can become markup.
 */
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const DRAFT_DELAY_MS = 300;
  const NEAR_BOTTOM_PX = 48;

  let labels = {};
  let maxChars = 0;
  let tooLongSentence = "";
  let state = undefined;
  let showingHistory = false;
  let ticker = undefined;
  let draftTimer = undefined;
  let turnNodes = [];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function label(key) {
    return typeof labels[key] === "string" ? labels[key] : "";
  }

  // The skeleton, built once.
  const app = document.getElementById("app");
  const header = el("div", "header");
  const modelSelect = el("select", "model");
  const newButton = el("button", "secondary");
  const historyButton = el("button", "secondary");
  header.append(modelSelect, newButton, historyButton);
  const notice = el("div", "notice");
  const historyView = el("div", "history");
  const turnsView = el("div", "turns");
  const status = el("div", "status");
  const composer = el("div", "composer");
  const input = el("textarea", "input");
  input.rows = 3;
  const sendButton = el("button", "send");
  const localError = el("div", "local-error");
  composer.append(input, sendButton);
  app.append(header, notice, historyView, turnsView, status, localError, composer);

  function busy() {
    return state !== undefined && state.phase !== "idle";
  }

  function post(message) {
    vscode.postMessage(message);
  }

  // Blocks of an answer, as the extension's renderer built them.
  function appendInline(parent, parts, depth) {
    for (const part of parts || []) {
      if (part.kind === "text") {
        parent.append(document.createTextNode(part.text));
      } else if (part.kind === "code") {
        parent.append(el("code", "inline-code", part.text));
      } else if ((part.kind === "bold" || part.kind === "italic") && depth < 4) {
        const node = el(part.kind === "bold" ? "strong" : "em");
        appendInline(node, part.children, depth + 1);
        parent.append(node);
      }
    }
  }

  function blockNode(block) {
    if (block.kind === "heading") {
      const level = Math.min(6, Math.max(1, Number(block.level) || 1));
      const node = el("h" + level);
      appendInline(node, block.inlines, 0);
      return node;
    }
    if (block.kind === "list") {
      const node = el(block.ordered ? "ol" : "ul");
      if (block.ordered && Number.isInteger(block.start)) {
        node.start = block.start;
      }
      for (const item of block.items || []) {
        const indent = Math.min(4, Math.max(0, Number(item.indent) || 0));
        const li = el("li", "indent-" + indent);
        appendInline(li, item.inlines, 0);
        node.append(li);
      }
      return node;
    }
    if (block.kind === "code") {
      const wrapper = el("div", "code-block");
      if (block.language) {
        wrapper.append(el("div", "code-language", block.language));
      }
      const pre = el("pre");
      pre.append(el("code", undefined, block.text));
      wrapper.append(pre);
      return wrapper;
    }
    const paragraph = el("p");
    appendInline(paragraph, block.inlines, 0);
    return paragraph;
  }

  const NOTES = {
    stoppedReading: "stoppedReading",
    stoppedAnswering: "stoppedAnswering",
    interrupted: "interrupted",
    lengthReached: "lengthReached",
  };

  function turnNode(turn) {
    if (turn.role === "user") {
      const node = el("div", "turn user");
      node.append(el("div", "who", label("you")), el("div", "user-text", turn.text));
      return node;
    }
    const node = el("div", "turn assistant" + (turn.pending ? " pending" : ""));
    node.append(el("div", "who", turn.model));
    const body = el("div", "answer");
    for (const block of turn.blocks || []) {
      body.append(blockNode(block));
    }
    node.append(body);
    if (NOTES[turn.note]) {
      node.append(el("div", "note", label(NOTES[turn.note])));
    }
    if (turn.failure) {
      node.append(el("div", "failure", turn.failure));
    }
    return node;
  }

  function nearBottom() {
    return turnsView.scrollHeight - turnsView.scrollTop - turnsView.clientHeight < NEAR_BOTTOM_PX;
  }

  function scrollToEnd() {
    turnsView.scrollTop = turnsView.scrollHeight;
  }

  function drawTurns() {
    const follow = nearBottom();
    turnsView.replaceChildren();
    turnNodes = [];
    if (state.turns.length === 0) {
      turnsView.append(el("div", "empty", label("emptyConversation")));
    }
    for (const turn of state.turns) {
      const node = turnNode(turn);
      turnNodes.push(node);
      turnsView.append(node);
    }
    if (follow || busy()) {
      scrollToEnd();
    }
  }

  function drawHistory() {
    historyView.replaceChildren();
    historyView.hidden = !showingHistory;
    if (!showingHistory) {
      return;
    }
    historyView.append(el("div", "hint", label("historyHint")));
    if (state.history.length === 0) {
      historyView.append(el("div", "empty", label("historyEmpty")));
    }
    for (const entry of state.history) {
      const row = el("div", "entry" + (entry.id === state.conversationId ? " current" : ""));
      const open = el("button", "entry-open");
      open.append(
        el("span", "entry-title", entry.title || label("untitled")),
        el("span", "entry-date", new Date(entry.updatedAt).toLocaleString()),
      );
      open.disabled = busy();
      open.addEventListener("click", function () {
        showingHistory = false;
        post({ type: "openConversation", id: entry.id });
      });
      const remove = el("button", "entry-delete secondary", label("delete"));
      remove.disabled = busy();
      remove.addEventListener("click", function () {
        post({ type: "deleteConversation", id: entry.id });
      });
      row.append(open, remove);
      historyView.append(row);
    }
  }

  function drawModels() {
    modelSelect.replaceChildren();
    if (state.models.length === 0) {
      const option = el("option", undefined, label("noModel"));
      option.value = "";
      modelSelect.append(option);
    }
    for (const model of state.models) {
      const option = el("option", undefined, model);
      option.value = model;
      option.selected = model === state.model;
      modelSelect.append(option);
    }
    modelSelect.disabled = busy() || state.models.length === 0;
    modelSelect.title = label("model");
  }

  function drawStatus() {
    if (!busy()) {
      status.textContent = "";
      status.hidden = true;
      return;
    }
    const elapsed =
      typeof state.since === "number"
        ? Math.max(0, Math.floor((Date.now() - state.since) / 1000))
        : 0;
    status.hidden = false;
    status.textContent =
      label(state.phase === "reading" ? "reading" : "answering") +
      " (" +
      elapsed +
      " " +
      label("seconds") +
      ")";
  }

  function drawControls() {
    sendButton.textContent = busy() ? label("stop") : label("send");
    sendButton.classList.toggle("stop", busy());
    newButton.textContent = label("newConversation");
    newButton.title = label("newConversationTitle");
    newButton.disabled = busy();
    historyButton.textContent = showingHistory ? label("back") : label("history");
    historyButton.title = label("historyTitle");
    historyButton.disabled = busy() && !showingHistory;
    input.placeholder = label("placeholder");
    notice.textContent = state.notice || "";
    notice.hidden = !state.notice;
    if (busy() && ticker === undefined) {
      ticker = setInterval(drawStatus, 1000);
    } else if (!busy() && ticker !== undefined) {
      clearInterval(ticker);
      ticker = undefined;
    }
    drawStatus();
  }

  function drawAll() {
    if (state === undefined) {
      return;
    }
    drawModels();
    drawHistory();
    drawTurns();
    drawControls();
  }

  function onState(next) {
    state = next;
    if (typeof next.draft === "string") {
      input.value = next.draft;
    }
    drawAll();
  }

  function onAnswer(message) {
    if (state === undefined) {
      return;
    }
    state.turns[message.index] = message.turn;
    state.phase = message.phase;
    const follow = nearBottom();
    const node = turnNode(message.turn);
    const old = turnNodes[message.index];
    if (old) {
      old.replaceWith(node);
      turnNodes[message.index] = node;
    } else {
      drawTurns();
    }
    if (follow) {
      scrollToEnd();
    }
    drawControls();
  }

  function showLocalError(text) {
    localError.textContent = text;
    localError.hidden = text === "";
  }

  function sendDraft() {
    clearTimeout(draftTimer);
    draftTimer = undefined;
    post({ type: "draft", text: input.value.slice(0, maxChars || undefined) });
  }

  function submit() {
    if (busy()) {
      post({ type: "stop" });
      return;
    }
    const text = input.value;
    if (text.trim() === "") {
      return;
    }
    if (maxChars > 0 && text.length > maxChars) {
      showLocalError(tooLongSentence);
      return;
    }
    showLocalError("");
    post({ type: "send", text: text });
    input.value = "";
    sendDraft();
  }

  sendButton.addEventListener("click", submit);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!busy()) {
        submit();
      }
    }
  });
  input.addEventListener("input", function () {
    showLocalError("");
    clearTimeout(draftTimer);
    draftTimer = setTimeout(sendDraft, DRAFT_DELAY_MS);
  });
  newButton.addEventListener("click", function () {
    showingHistory = false;
    post({ type: "newConversation" });
  });
  historyButton.addEventListener("click", function () {
    showingHistory = !showingHistory;
    drawAll();
  });
  modelSelect.addEventListener("change", function () {
    if (modelSelect.value !== "") {
      post({ type: "selectModel", model: modelSelect.value });
    }
  });

  window.addEventListener("message", function (event) {
    const message = event.data;
    if (typeof message !== "object" || message === null) {
      return;
    }
    if (message.type === "labels") {
      labels = message.labels || {};
      maxChars = Number(message.maxChars) || 0;
      tooLongSentence = String(message.tooLong || "");
      drawAll();
    } else if (message.type === "state") {
      onState(message.state);
    } else if (message.type === "answer") {
      onAnswer(message);
    }
  });

  showLocalError("");
  notice.hidden = true;
  status.hidden = true;
  historyView.hidden = true;
  post({ type: "ready" });
})();
