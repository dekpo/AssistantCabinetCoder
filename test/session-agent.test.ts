/**
 * The chat panel with its agent loop and tools (Lot P0b), against the stub's scripted agent
 * scenarios and a real temporary project folder: steps, tool lines, a change accepted, rejected or
 * stopped while it waits, the step limit, a stop in the middle of the loop, the tools off, the
 * saved steps, the log, and the model list shared with the status bar.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { getModels } from "../src/client";
import { formatCallLine, type CallRecord } from "../src/log";
import { AGENT_PANEL, TOOL_NOTES } from "../src/messages";
import type { HostMessage, ViewCall, ViewState, ViewTurn } from "../src/protocol";
import {
  ChatSession,
  type SessionHost,
  type SessionResolution,
  type SessionWorkspace,
  type ToolsAvailability,
} from "../src/session";
import { FileStore, newConversationId, type ConversationStore } from "../src/store";
import { MAX_STEPS } from "../src/agent";
import type { EditDecision, EditProposal } from "../src/tools";
import { closeAgents } from "../src/transport";
import { nodeWorkspaceFs } from "../src/workspace";
import { STUB_EDIT_SUFFIX, startStub, type ChatEvent, type Stub } from "./stub-gateway/stub";

let parent: string;
let stub: Stub;
const events: ChatEvent[] = [];
const SECRET = "FILE-CONTENT-SECRET-7f3a";

before(async () => {
  parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "acc-agent-")));
  stub = await startStub({ loopStepMs: 30, onChat: (event) => events.push(event) });
});

const sessions: ChatSession[] = [];
const stores: FileStore[] = [];

after(async () => {
  await Promise.all(sessions.map((session) => session.flush()));
  await Promise.all(stores.map((store) => store.idle()));
  await stub.close();
  closeAgents();
  await fs.rm(parent, { recursive: true, force: true });
});

class FakeWorkspace implements SessionWorkspace {
  availabilityValue: ToolsAvailability = "on";
  readonly shown: EditProposal[] = [];
  readonly closed: EditProposal[] = [];
  readonly fs = nodeWorkspaceFs;
  constructor(private readonly root: string) {}

  availability(): ToolsAvailability {
    return this.availabilityValue;
  }

  roots(): string[] {
    return [this.root];
  }

  showProposal(proposal: EditProposal): Promise<void> {
    this.shown.push(proposal);
    return Promise.resolve();
  }

  closeProposal(proposal: EditProposal): Promise<void> {
    this.closed.push(proposal);
    return Promise.resolve();
  }

  /** What the editor's WorkspaceEdit does, played on the disk for the test. */
  async applyProposal(proposal: EditProposal): Promise<EditDecision> {
    const current = await fs.readFile(proposal.absolute, "utf8").catch(() => undefined);
    if ((current ?? "") !== proposal.before) {
      return "file_changed";
    }
    await fs.writeFile(proposal.absolute, proposal.after);
    return "applied";
  }
}

class Host implements SessionHost {
  readonly posted: HostMessage[] = [];
  readonly logs: CallRecord[] = [];
  readonly store: ConversationStore;
  readonly workspace: FakeWorkspace;
  now = 1_700_000_000_000;
  resolution: SessionResolution;

  constructor(store: FileStore, workspace: FakeWorkspace) {
    this.store = store;
    this.workspace = workspace;
    this.resolution = { ok: true, options: { baseUrl: stub.url, timeoutSeconds: 10 } };
  }

  resolve(): Promise<SessionResolution> {
    return Promise.resolve(this.resolution);
  }

  post(message: HostMessage): void {
    this.posted.push(message);
  }

  confirmDelete(): Promise<boolean> {
    return Promise.resolve(true);
  }

  log(record: CallRecord): void {
    this.logs.push(record);
  }

  preferredModel(): string | undefined {
    return undefined;
  }

  rememberModel(): void {
    // Not needed here.
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
    assert.ok(last !== undefined && last.type === "state");
    return last.state;
  }
}

let counter = 0;

interface Setup {
  host: Host;
  session: ChatSession;
  project: string;
  store: FileStore;
  storeRoot: string;
}

async function setup(model = "cabinet-chat"): Promise<Setup> {
  counter += 1;
  const project = path.join(parent, `project-${counter}`);
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(
    path.join(project, "src", "main.py"),
    `def add(a, b):\n    return a + b\n# ${SECRET}\n`,
  );
  await fs.writeFile(path.join(parent, "outside.txt"), `${SECRET}\n`);
  const storeRoot = path.join(parent, `store-${counter}`);
  const store = new FileStore(storeRoot);
  stores.push(store);
  const host = new Host(store, new FakeWorkspace(project));
  const session = new ChatSession(host, { answerUpdateMs: 5, saveEveryMs: 20 });
  sessions.push(session);
  await session.receive({ type: "ready" });
  await session.receive({ type: "selectModel", model });
  return { host, session, project, store, storeRoot };
}

function assistant(turn: ViewTurn | undefined): Extract<ViewTurn, { role: "assistant" }> {
  assert.ok(turn !== undefined && turn.role === "assistant");
  return turn;
}

function calls(state: ViewState): ViewCall[] {
  return (assistant(state.turns[1]).steps ?? []).flatMap((round) => round.calls);
}

async function until(condition: () => boolean, ms = 5000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function chatEventsSince(mark: number): ChatEvent[] {
  return events.slice(mark).filter((event) => event.phase === "start");
}

describe("the panel's agent loop", () => {
  it("takes several steps with tools and shows one line per call", async () => {
    const { host, session } = await setup();
    const mark = events.length;
    await session.receive({ type: "send", text: "[stub:agent-steps:src/main.py] explain" });
    const state = host.lastState();
    assert.equal(state.phase, "idle");
    const started = chatEventsSince(mark);
    assert.equal(started.length, 4, "three tool steps and the final answer");
    assert.ok(
      started.every((event) => event.tools === 4),
      "the four tools in every request",
    );
    assert.deepEqual(
      calls(state).map((call) => [call.icon, call.label, call.target, call.status]),
      [
        ["list", AGENT_PANEL.toolList, ".", "done"],
        ["read", AGENT_PANEL.toolRead, "src/main.py", "done"],
        ["search", AGENT_PANEL.toolSearch, "a", "done"],
      ],
    );
    assert.equal(calls(state)[1]?.note, TOOL_NOTES.lines(1, 3, 3));
    const answer = assistant(state.turns[1]);
    assert.equal(answer.note, "none");
    assert.equal(answer.blocks[0]?.kind, "paragraph");
    const chats = host.logs.filter((record) => record.call === "chat");
    assert.deepEqual(
      chats.map((record) => [record.step, record.tools]),
      [
        [1, ["list_files"]],
        [2, ["read_file"]],
        [3, ["search_text"]],
        [4, undefined],
      ],
    );
    assert.deepEqual(
      host.logs.filter((record) => record.call === "tool").map((record) => record.tool),
      ["list_files", "read_file", "search_text"],
    );
  });

  it("keeps the file's content, its name and the arguments out of the log", async () => {
    const { host, session } = await setup();
    await session.receive({ type: "send", text: "[stub:agent-steps:src/main.py] explain" });
    await session.receive({ type: "send", text: "[stub:agent-steps:../outside.txt] again" });
    const lines = host.logs.map((record) => formatCallLine(record, new Date(0))).join("\n");
    for (const forbidden of [SECRET, "main.py", "outside.txt", "explain", '"path"']) {
      assert.equal(lines.includes(forbidden), false, forbidden);
    }
    assert.match(lines, /call=tool ms=\d+ tool=read_file outcome=failed reason=outside_workspace/);
  });

  it("refuses a path outside the project and the model reads why", async () => {
    const { host, session } = await setup();
    await session.receive({ type: "send", text: "[stub:agent-steps:../outside.txt] read" });
    const read = calls(host.lastState())[1];
    assert.deepEqual(
      [read?.status, read?.note],
      ["failed", TOOL_NOTES.reason("outside_workspace")],
    );
    const turn = session.conversation.turns[1];
    assert.ok(turn?.role === "assistant");
    const result = turn.steps?.[1]?.calls[0]?.result ?? "";
    assert.match(result, /outside the project folder/);
    assert.equal(result.includes(SECRET), false);
  });

  it("turns malformed arguments into a result, and the loop goes on", async () => {
    const { host, session } = await setup();
    await session.receive({ type: "send", text: "[stub:agent-bad-args] go" });
    const [call] = calls(host.lastState());
    assert.deepEqual(
      [call?.status, call?.note],
      ["failed", TOOL_NOTES.reason("invalid_arguments")],
    );
    assert.equal(assistant(host.lastState().turns[1]).note, "none");
    assert.ok(host.logs.some((record) => record.reason === "invalid_arguments"));
  });

  it("shows a change, writes nothing before Accept, then applies it", async () => {
    const { host, session, project } = await setup();
    const file = path.join(project, "src", "main.py");
    const before = await fs.readFile(file, "utf8");
    const sending = session.receive({ type: "send", text: "[stub:agent-edit:src/main.py] edit" });
    await until(
      () => session.conversation.turns.length > 0 && host.lastState().phase === "approval",
    );
    const waiting = calls(host.lastState());
    assert.equal(waiting[1]?.status, "awaiting");
    assert.equal(waiting[1]?.icon, "edit");
    assert.equal(host.workspace.shown.length, 1);
    assert.equal(await fs.readFile(file, "utf8"), before, "nothing written while it waits");
    await session.receive({ type: "showDiff" });
    assert.equal(host.workspace.shown.length, 2, "the diff can be shown again");
    await session.receive({ type: "acceptEdit" });
    await sending;
    assert.equal(
      await fs.readFile(file, "utf8"),
      before.replace("def add(a, b):", `def add(a, b):${STUB_EDIT_SUFFIX}`),
    );
    const state = host.lastState();
    assert.deepEqual([calls(state)[1]?.status, calls(state)[1]?.note], ["accepted", "accepted"]);
    assert.equal(host.workspace.closed.length, 1, "the diff view is closed");
    assert.ok(
      host.logs.some((record) => record.tool === "propose_edit" && record.outcome === "accepted"),
    );
  });

  it("leaves the file unchanged on Reject and tells the model", async () => {
    const { host, session, project } = await setup();
    const file = path.join(project, "src", "main.py");
    const before = await fs.readFile(file, "utf8");
    const sending = session.receive({ type: "send", text: "[stub:agent-edit:src/main.py] edit" });
    await until(
      () => session.conversation.turns.length > 0 && host.lastState().phase === "approval",
    );
    await session.receive({ type: "rejectEdit" });
    await sending;
    assert.equal(await fs.readFile(file, "utf8"), before);
    assert.equal(calls(host.lastState())[1]?.status, "rejected");
    const turn = session.conversation.turns[1];
    assert.ok(turn?.role === "assistant");
    assert.match(turn.steps?.[1]?.calls[0]?.result ?? "", /^Rejected by the user/);
    assert.ok(host.logs.some((record) => record.outcome === "rejected"));
  });

  it("on Stop while a change waits, applies nothing and sends no further step", async () => {
    const { host, session, project } = await setup();
    const file = path.join(project, "src", "main.py");
    const before = await fs.readFile(file, "utf8");
    const mark = events.length;
    const sending = session.receive({ type: "send", text: "[stub:agent-edit:src/main.py] edit" });
    await until(
      () => session.conversation.turns.length > 0 && host.lastState().phase === "approval",
    );
    await session.receive({ type: "stop" });
    await sending;
    await session.receive({ type: "acceptEdit" });
    assert.equal(await fs.readFile(file, "utf8"), before);
    assert.equal(chatEventsSince(mark).length, 2, "no step after the stop");
    const state = host.lastState();
    assert.equal(state.phase, "idle");
    assert.equal(calls(state)[1]?.status, "stopped");
    assert.equal(assistant(state.turns[1]).note, "stoppedAnswering");
  });

  it("stops in the middle of the loop: no further step, open calls closed", async () => {
    const { host, session } = await setup();
    const mark = events.length;
    const sending = session.receive({ type: "send", text: "[stub:agent-loop:src/main.py] loop" });
    await until(() => host.logs.filter((record) => record.call === "tool").length >= 2);
    session.stop();
    await sending;
    const sent = chatEventsSince(mark).length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(chatEventsSince(mark).length, sent, "nothing is sent after the stop");
    const state = host.lastState();
    assert.equal(state.phase, "idle");
    assert.ok(calls(state).every((call) => call.status !== "running"));
    assert.match(assistant(state.turns[1]).note, /^stopped/);
  });

  it("follows the next message after a stopped loop (the stub reads it as a real message)", async () => {
    // Found in Part 2 of the human test: after a stopped loop the conversation ends with tool
    // messages, so the next user message directly follows a tool message.
    const { host, session } = await setup();
    const sending = session.receive({ type: "send", text: "[stub:agent-loop:src/main.py] loop" });
    await until(() => host.logs.filter((record) => record.call === "tool").length >= 1);
    session.stop();
    await sending;
    const mark = events.length;
    const next = session.receive({ type: "send", text: "[stub:agent-edit:src/main.py] edit" });
    await until(() => host.lastState().phase === "approval");
    assert.deepEqual(
      chatEventsSince(mark).map((event) => event.scenario),
      ["agent-edit", "agent-edit"],
    );
    await session.receive({ type: "rejectEdit" });
    await next;
  });

  it("stops at the step limit with a note", async () => {
    const { host, session } = await setup();
    const mark = events.length;
    await session.receive({ type: "send", text: "[stub:agent-loop:src/main.py] loop" });
    assert.equal(chatEventsSince(mark).length, MAX_STEPS);
    const state = host.lastState();
    assert.equal(assistant(state.turns[1]).note, "stepLimit");
    assert.equal(calls(state).length, MAX_STEPS);
  });

  it("saves the steps and a new window shows them again", async () => {
    const { host, session, store, storeRoot } = await setup();
    await session.receive({ type: "send", text: "[stub:agent-steps:src/main.py] explain" });
    await session.flush();
    await store.idle();
    const saved = JSON.parse(
      await fs.readFile(path.join(storeRoot, `${session.conversation.id}.json`), "utf8"),
    ) as { format: number };
    assert.equal(saved.format, 2);
    const host2 = new Host(new FileStore(storeRoot), host.workspace);
    const session2 = new ChatSession(host2);
    sessions.push(session2);
    await session2.receive({ type: "ready" });
    assert.deepEqual(host2.lastState().turns, host.lastState().turns);
  });

  it("closes a call that a closed window left running, when the conversation is read again", async () => {
    const { host, session, store, storeRoot } = await setup();
    const sending = session.receive({ type: "send", text: "[stub:agent-edit:src/main.py] edit" });
    await until(
      () => session.conversation.turns.length > 0 && host.lastState().phase === "approval",
    );
    // The window closes here: what is on disk is the conversation with the edit still waiting.
    await session.flush();
    await store.idle();
    const host2 = new Host(new FileStore(storeRoot), host.workspace);
    const session2 = new ChatSession(host2);
    sessions.push(session2);
    await session2.receive({ type: "ready" });
    const reopened = host2.lastState();
    assert.equal(assistant(reopened.turns[1]).note, "interrupted");
    assert.deepEqual(
      calls(reopened).map((call) => call.status),
      ["done", "stopped"],
    );
    const turn = session2.conversation.turns[1];
    assert.ok(turn?.role === "assistant");
    assert.equal(
      turn.steps?.[1]?.calls[0]?.result,
      "Not run: the editor window closed before it ran.",
    );
    await session.receive({ type: "rejectEdit" });
    await sending;
  });
});

describe("the tools off", () => {
  it("in an untrusted workspace: a plain chat, and the panel says why", async () => {
    const { host, session } = await setup();
    host.workspace.availabilityValue = "untrusted";
    const mark = events.length;
    await session.receive({ type: "send", text: "[stub:agent-steps:src/main.py] explain" });
    const started = chatEventsSince(mark);
    assert.equal(started.length, 1);
    assert.equal(started[0]?.tools, 0);
    assert.equal(host.lastState().toolsNote, AGENT_PANEL.toolsUntrusted);
    assert.equal(host.logs.find((record) => record.call === "chat")?.step, undefined);
  });

  it("with no folder open, and with a model that does not call tools", async () => {
    const noFolder = await setup();
    noFolder.host.workspace.availabilityValue = "no_folder";
    noFolder.session.toolsChanged();
    assert.equal(noFolder.host.lastState().toolsNote, AGENT_PANEL.toolsNoFolder);
    const plain = await setup("cabinet-plain");
    assert.equal(plain.host.lastState().toolsNote, AGENT_PANEL.toolsModel);
    const mark = events.length;
    await plain.session.receive({ type: "send", text: "hello" });
    assert.equal(chatEventsSince(mark)[0]?.tools, 0);
  });
});

describe("the model list shared with the status bar", () => {
  it("uses the request it is given instead of sending another", async () => {
    const { host, session } = await setup();
    const before = stub.requests.filter((request) => request.path === "/ide/v1/models").length;
    const shared = getModels({ baseUrl: stub.url, timeoutSeconds: 10 });
    await session.refreshModels(shared);
    const after = stub.requests.filter((request) => request.path === "/ide/v1/models").length;
    assert.equal(after - before, 1, "one request for both");
    assert.deepEqual(host.lastState().models, ["cabinet-chat", "cabinet-code", "cabinet-plain"]);
  });

  it("shows the shared request's failure like its own", async () => {
    const { host, session } = await setup();
    await session.refreshModels(Promise.reject(new Error("unreachable")));
    assert.ok(host.lastState().notice !== undefined);
  });
});
