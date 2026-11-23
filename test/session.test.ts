import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { beginTurn, newConversation } from "../src/conversation";
import type { CallRecord } from "../src/log";
import { PANEL, describeCode, describeNoServer } from "../src/messages";
import type { HostMessage, ViewState, ViewTurn } from "../src/protocol";
import { ChatSession, type SessionHost, type SessionResolution } from "../src/session";
import { FileStore, StoreError, newConversationId, type ConversationStore } from "../src/store";
import { closeAgents } from "../src/transport";
import { startStub, type ChatEvent, type Stub } from "./stub-gateway/stub";

let parent: string;
let stub: Stub;
const events: ChatEvent[] = [];

before(async () => {
  parent = await fs.mkdtemp(path.join(os.tmpdir(), "acc-session-"));
  stub = await startStub({
    longChunkMs: 20,
    longChunks: 400,
    onChat: (event) => events.push(event),
  });
});

/** Every store and session of the tests, so that no write is still running at the clean-up. */
const stores: ConversationStore[] = [];
const sessions: ChatSession[] = [];

after(async () => {
  await Promise.all(sessions.map((session) => session.flush()));
  await Promise.all(stores.map((store) => (store instanceof FileStore ? store.idle() : undefined)));
  await stub.close();
  closeAgents();
  await fs.rm(parent, { recursive: true, force: true });
});

function track(session: ChatSession): ChatSession {
  sessions.push(session);
  return session;
}

let counter = 0;

class FakeHost implements SessionHost {
  readonly posted: HostMessage[] = [];
  readonly logs: CallRecord[] = [];
  readonly remembered: string[] = [];
  readonly confirmations: string[] = [];
  confirm = true;
  preferred: string | undefined;
  resolution: SessionResolution;
  store: ConversationStore;
  now = 1_700_000_000_000;

  constructor(store: ConversationStore) {
    this.store = store;
    stores.push(store);
    this.resolution = { ok: true, options: { baseUrl: stub.url, timeoutSeconds: 10 } };
  }

  resolve(): Promise<SessionResolution> {
    return Promise.resolve(this.resolution);
  }

  post(message: HostMessage): void {
    this.posted.push(message);
  }

  confirmDelete(title: string): Promise<boolean> {
    this.confirmations.push(title);
    return Promise.resolve(this.confirm);
  }

  log(record: CallRecord): void {
    this.logs.push(record);
  }

  preferredModel(): string | undefined {
    return this.preferred;
  }

  rememberModel(model: string): void {
    this.remembered.push(model);
    this.preferred = model;
  }

  newId(now: number): string {
    return newConversationId(now);
  }

  clock(): number {
    this.now += 1;
    return this.now;
  }

  lastState(): ViewState {
    const states = this.posted.filter((message) => message.type === "state");
    const last = states[states.length - 1];
    assert.ok(last !== undefined && last.type === "state", "a state was posted");
    return last.state;
  }
}

async function setup(name = `case-${(counter += 1)}`): Promise<{
  host: FakeHost;
  session: ChatSession;
  store: FileStore;
  root: string;
}> {
  const root = path.join(parent, name, "conversations");
  const store = new FileStore(root);
  const host = new FakeHost(store);
  const session = track(new ChatSession(host, { answerUpdateMs: 5, saveEveryMs: 20 }));
  await session.receive({ type: "ready" });
  return { host, session, store, root };
}

async function until(condition: () => boolean, ms = 3000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function assistant(turn: ViewTurn | undefined): Extract<ViewTurn, { role: "assistant" }> {
  assert.ok(turn !== undefined && turn.role === "assistant");
  return turn;
}

describe("the chat session", () => {
  it("answers ready with the labels, the state and the server's models", async () => {
    const { host } = await setup();
    const labels = host.posted.find((message) => message.type === "labels");
    assert.ok(labels !== undefined && labels.type === "labels");
    assert.equal(labels.labels["send"], PANEL.send);
    assert.equal(labels.labels["stoppedReading"], PANEL.stoppedReading);
    const state = host.lastState();
    assert.deepEqual(state.models, ["cabinet-chat", "cabinet-code", "cabinet-plain"]);
    assert.equal(state.model, "cabinet-chat");
    assert.deepEqual(state.turns, []);
    assert.equal(state.phase, "idle");
    assert.equal(state.conversationId, undefined);
  });

  it("sends a message, streams the answer, saves it, and a new window finds it again", async () => {
    const { host, session, store, root } = await setup("persist");
    await session.receive({ type: "send", text: "[stub:markup] question" });
    const phases = host.posted
      .filter((message) => message.type === "state")
      .map((message) => (message.type === "state" ? message.state.phase : ""));
    assert.deepEqual([phases[phases.length - 2], phases[phases.length - 1]], ["reading", "idle"]);
    assert.ok(
      host.posted.some((message) => message.type === "answer" && message.phase === "answering"),
    );
    const state = host.lastState();
    assert.equal(state.turns.length, 2);
    const answer = assistant(state.turns[1]);
    assert.equal(answer.note, "none");
    assert.equal(answer.pending, false);
    assert.equal(answer.blocks[0]?.kind, "heading");
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0]?.title, "[stub:markup] question");
    await session.flush();
    await store.idle();

    const host2 = new FakeHost(new FileStore(root));
    const session2 = track(new ChatSession(host2));
    await session2.receive({ type: "ready" });
    const reopened = host2.lastState();
    assert.equal(reopened.conversationId, state.conversationId);
    assert.deepEqual(reopened.turns, state.turns);
  });

  it("logs the call with codes and counts only, never the text", async () => {
    const { host, session } = await setup();
    const secret = `SECRET-${Date.now()}`;
    await session.receive({ type: "send", text: secret });
    await session.flush();
    const chat = host.logs.filter((record) => record.call === "chat");
    assert.equal(chat.length, 1);
    assert.equal(JSON.stringify(host.logs).includes(secret), false);
  });

  it("allows one request at a time: a second send while answering is ignored", async () => {
    const { host, session } = await setup();
    const before = events.filter((event) => event.phase === "start").length;
    const first = session.receive({ type: "send", text: "[stub:long]" });
    await until(() => session.busy && host.posted.some((m) => m.type === "answer"));
    await session.receive({ type: "send", text: "second" });
    await session.receive({ type: "newConversation" });
    session.stop();
    await first;
    assert.equal(events.filter((event) => event.phase === "start").length - before, 1);
    assert.equal(session.conversation.turns.length, 2);
  });

  it("stops while answering: the words stay, marked stopped, saved as stopped", async () => {
    const { host, session, store } = await setup();
    const sending = session.receive({ type: "send", text: "[stub:long]" });
    await until(() => (session.conversation.turns[1]?.text.length ?? 0) > 10);
    await session.receive({ type: "stop" });
    await sending;
    const answer = assistant(host.lastState().turns[1]);
    assert.equal(answer.note, "stoppedAnswering");
    assert.ok(answer.blocks.length > 0);
    assert.equal(host.lastState().phase, "idle");
    await session.flush();
    const saved = await store.load(session.conversation.id);
    assert.ok(typeof saved === "object");
    const turn = saved.turns[1];
    assert.ok(
      turn?.role === "assistant" && turn.state === "stopped" && turn.stoppedWhile === "answering",
    );
    assert.ok(turn.text.startsWith("word0 "));
    await until(() => events.some((event) => event.phase === "end" && event.complete === false));
  });

  it("stops while the server reads: the reading sentence, no word", async () => {
    const { host, session } = await setup();
    const sending = session.receive({ type: "send", text: "[stub:slow]" });
    await until(() => host.lastState().phase === "reading");
    session.stop();
    await sending;
    const answer = assistant(host.lastState().turns[1]);
    assert.equal(answer.note, "stoppedReading");
    assert.deepEqual(answer.blocks, []);
  });

  it("shows a refusal once, with the sentence of messages.ts, after one request", async () => {
    const { host, session } = await setup();
    const before = events.filter((event) => event.phase === "start").length;
    await session.receive({ type: "send", text: "[stub:refuse:server_busy]" });
    assert.equal(events.filter((event) => event.phase === "start").length - before, 1);
    const answer = assistant(host.lastState().turns[1]);
    assert.equal(answer.failure, describeCode("server_busy"));
    assert.equal(answer.note, "failed");
  });

  it("starts, opens and deletes conversations, asking first", async () => {
    const { host, session, store } = await setup();
    await session.receive({ type: "send", text: "first" });
    const firstId = session.conversation.id;
    await session.receive({ type: "newConversation" });
    assert.deepEqual(host.lastState().turns, []);
    assert.equal(host.lastState().draft, "");
    await session.receive({ type: "send", text: "second" });
    const secondId = session.conversation.id;
    assert.notEqual(firstId, secondId);
    assert.deepEqual(
      host.lastState().history.map((entry) => entry.title),
      ["second", "first"],
    );
    await session.receive({ type: "openConversation", id: firstId });
    assert.equal(host.lastState().conversationId, firstId);
    host.confirm = false;
    await session.receive({ type: "deleteConversation", id: secondId });
    assert.equal(host.lastState().history.length, 2);
    host.confirm = true;
    await session.receive({ type: "deleteConversation", id: firstId });
    assert.deepEqual(host.confirmations, ["second", "first"]);
    assert.deepEqual(
      host.lastState().history.map((entry) => entry.id),
      [secondId],
    );
    assert.deepEqual(host.lastState().turns, [], "the deleted open conversation is replaced");
    await session.flush();
    await store.idle();
    assert.equal(await store.load(firstId), "missing");
  });

  it("marks an answer cut off by a closed window as interrupted when it is read again", async () => {
    const root = path.join(parent, "interrupted", "conversations");
    const store = new FileStore(root);
    const open = newConversation(
      newConversationId(1_700_000_000_000),
      1_700_000_000_000,
      "cabinet-chat",
    );
    beginTurn(open, "question", "cabinet-chat", 1_700_000_000_001);
    open.turns[1]!.text = "half an ans";
    await store.save(open);
    const host = new FakeHost(new FileStore(root));
    const session = track(new ChatSession(host));
    await session.receive({ type: "ready" });
    const answer = assistant(host.lastState().turns[1]);
    assert.equal(answer.note, "interrupted");
    assert.equal(answer.pending, false);
    assert.equal(host.lastState().phase, "idle");
    await session.flush();
    const saved = await new FileStore(root).load(open.id);
    assert.ok(typeof saved === "object" && saved.turns[1]?.role === "assistant");
    assert.equal(saved.turns[1].state, "interrupted");
  });

  it("drops a malformed message from the webview and only counts it", async () => {
    const { host, session } = await setup();
    const posted = host.posted.length;
    const secret = `SECRET-${Date.now()}`;
    await session.receive({ type: "send", text: secret, extra: secret });
    await session.receive({ type: "openConversation", id: "../../etc/passwd" });
    await session.receive(secret);
    assert.equal(host.posted.length, posted);
    const dropped = host.logs.filter((record) => record.call === "webview");
    assert.equal(dropped.length, 3);
    assert.ok(dropped.every((record) => record.dropped === 1));
    assert.equal(JSON.stringify(host.logs).includes(secret), false);
  });

  it("keeps the message in the input when no server is configured", async () => {
    const { host, session } = await setup();
    host.resolution = { ok: false, reason: "no_installation" };
    await session.receive({ type: "send", text: "keep me" });
    const state = host.lastState();
    assert.equal(state.draft, "keep me");
    assert.equal(state.notice, describeNoServer("no_installation"));
    assert.deepEqual(state.turns, []);
  });

  it("keeps the draft in memory for a webview shown again", async () => {
    const { host, session } = await setup();
    await session.receive({ type: "draft", text: "half typed" });
    await session.receive({ type: "ready" });
    assert.equal(host.lastState().draft, "half typed");
  });

  it("selects only a model the server offers, and remembers it", async () => {
    const { host, session } = await setup();
    await session.receive({ type: "selectModel", model: "cabinet-code" });
    assert.equal(host.lastState().model, "cabinet-code");
    await session.receive({ type: "selectModel", model: "not-offered" });
    assert.equal(host.lastState().model, "cabinet-code");
    assert.deepEqual(host.remembered, ["cabinet-code"]);
    await session.receive({ type: "send", text: "hi" });
    assert.equal(assistant(host.lastState().turns[1]).model, "cabinet-code");
  });

  it("says when the server cannot give its models", async () => {
    const off = await startStub({ mode: "off" });
    try {
      const store = new FileStore(path.join(parent, "off", "conversations"));
      const host = new FakeHost(store);
      host.resolution = { ok: true, options: { baseUrl: off.url, timeoutSeconds: 5 } };
      const session = track(new ChatSession(host));
      await session.receive({ type: "ready" });
      assert.equal(host.lastState().notice, describeCode("ide_surface_off"));
      assert.deepEqual(host.lastState().models, []);
    } finally {
      await off.close();
    }
  });

  it("shows a store failure once and logs its Node code, keeping the conversation open", async () => {
    const failing: ConversationStore = {
      list: () => Promise.resolve([]),
      load: () => Promise.resolve("missing"),
      save: () => Promise.reject(new StoreError("ENOSPC")),
      remove: () => Promise.reject(new StoreError("EACCES")),
    };
    const host = new FakeHost(failing);
    const session = track(new ChatSession(host));
    await session.receive({ type: "ready" });
    await session.receive({ type: "send", text: "hello" });
    await session.flush();
    assert.equal(host.lastState().notice, PANEL.saveFailed);
    assert.equal(host.lastState().turns.length, 2);
    const store = host.logs.filter((record) => record.call === "store");
    assert.ok(store.length >= 1);
    assert.equal(store[0]?.detail, "ENOSPC");
  });

  it("tells the user when a saved conversation cannot be read, and leaves it alone", async () => {
    const { host, session, root } = await setup();
    const id = newConversationId(1_700_000_000_000);
    await fs.writeFile(path.join(root, `${id}.json`), "{ damaged");
    await session.receive({ type: "openConversation", id });
    assert.equal(host.lastState().notice, PANEL.unreadableConversation);
    assert.deepEqual(host.lastState().turns, []);
    // A new window lists it without a title and does not open it at start.
    const host2 = new FakeHost(new FileStore(root));
    const session2 = track(new ChatSession(host2));
    await session2.receive({ type: "ready" });
    assert.deepEqual(
      host2.lastState().history.map((entry) => [entry.id, entry.title]),
      [[id, ""]],
    );
    assert.equal(host2.lastState().notice, undefined);
    assert.equal(await fs.readFile(path.join(root, `${id}.json`), "utf8"), "{ damaged");
  });
});

describe("the model list at start", () => {
  class CountingHost extends FakeHost {
    resolves = 0;
    override resolve(): Promise<SessionResolution> {
      this.resolves += 1;
      return super.resolve();
    }
  }

  it("is asked for once when the webview opens while the extension's own refresh is on its way", async () => {
    const root = path.join(parent, "models-once", "conversations");
    const host = new CountingHost(new FileStore(root));
    const session = track(new ChatSession(host));
    const refresh = session.refreshModels();
    await session.receive({ type: "ready" });
    await refresh;
    assert.equal(host.resolves, 1);
    assert.deepEqual(host.lastState().models, ["cabinet-chat", "cabinet-code", "cabinet-plain"]);
  });

  it("is asked for when the webview opens and no refresh is on its way", async () => {
    const root = path.join(parent, "models-ready", "conversations");
    const host = new CountingHost(new FileStore(root));
    const session = track(new ChatSession(host));
    await session.receive({ type: "ready" });
    assert.equal(host.resolves, 1);
    assert.deepEqual(host.lastState().models, ["cabinet-chat", "cabinet-code", "cabinet-plain"]);
  });
});
