/**
 * The chat panel's logic, against an injected host, so it needs no editor: the open conversation,
 * the saved ones, the model list, one request at a time, the stop, and what the webview is told.
 * The conversation lives here, in the extension; the webview only draws what it receives and is
 * redrawn from here when it is shown again. Conversations are saved through the store (decision
 * D-027); nothing of them reaches the log, which gets codes, durations and counts only.
 */
import { runAgent, type AgentEnd } from "./agent";
import { streamChat, type ChatResult } from "./chat";
import { getModels, type ClientOptions, type ModelsResult } from "./client";
import { codeOf } from "./codes";
import {
  agentRequestBody,
  beginTurn,
  closeInterrupted,
  closeOpenCalls,
  finishAnswer,
  newConversation,
  noteOf,
  pendingAnswer,
  recordCalls,
  requestBody,
  type AssistantTurn,
  type Conversation,
  type RawToolCall,
  type ToolStep,
  type Turn,
} from "./conversation";
import type { NoServerReason } from "./discovery";
import { sortSummaries, summaryOf, type ConversationSummary } from "./history";
import { toolNamesForLog, type CallRecord } from "./log";
import {
  AGENT_PANEL,
  PANEL,
  TOOL_NOTES,
  describeCode,
  describeNoServer,
  describeOverflow,
} from "./messages";
import {
  MAX_MESSAGE_CHARS,
  parseWebviewMessage,
  type HostMessage,
  type Phase,
  type ToolIcon,
  type ViewCall,
  type ViewState,
  type ViewTurn,
  type WebviewMessage,
} from "./protocol";
import { renderBlocks } from "./render";
import { StoreError, type ConversationStore } from "./store";
import {
  INTERRUPTED_RESULT,
  STOPPED_RESULT,
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  runToolCall,
  targetOf,
  type EditDecision,
  type EditProposal,
  type ToolOutcome,
} from "./tools";
import type { WorkspaceFs } from "./workspace";

/** Whether the panel's tools may run: on, or why they are off. */
export type ToolsAvailability = "on" | "untrusted" | "no_folder";

/**
 * The workspace side of the panel's tools (Lot P0b), given by the adapter. Nothing here writes
 * except `applyProposal`, which the session calls only after the user's click on Accept.
 */
export interface SessionWorkspace {
  availability(): ToolsAvailability;
  /** The open workspace folders, absolute. */
  roots(): string[];
  fs: WorkspaceFs;
  /** Opens the editor's diff view of a proposed change (it may be called again). */
  showProposal(proposal: EditProposal): Promise<void>;
  /** Closes that diff view once the user decided. */
  closeProposal(proposal: EditProposal): Promise<void>;
  /** Applies the change through the editor (so Undo reverts it). */
  applyProposal(proposal: EditProposal): Promise<EditDecision>;
}

/** A change waiting for the user's decision. */
interface Awaiting {
  callId: string;
  proposal: EditProposal;
  settle(decision: EditDecision): void;
  applying: boolean;
}

export type SessionResolution =
  { ok: true; options: ClientOptions } | { ok: false; reason: NoServerReason };

export interface SessionHost {
  /** The connection now (settings and key are read again at every call). */
  resolve(): Promise<SessionResolution>;
  store: ConversationStore;
  /** To the webview, when one is shown; dropped otherwise. */
  post(message: HostMessage): void;
  /** Asks the user to confirm a deletion (a modal of the editor). */
  confirmDelete(title: string): Promise<boolean>;
  log(record: CallRecord): void;
  /** The model chosen last in this workspace, and the place to remember a new choice. */
  preferredModel(): string | undefined;
  rememberModel(model: string): void;
  newId(now: number): string;
  clock(): number;
  /** The workspace for the panel's tools; without it the panel is a plain chat (Lot P0a). */
  workspace?: SessionWorkspace;
}

export interface SessionOptions {
  /** The streamed call (the real one by default). */
  send?: typeof streamChat;
  /** The longest wait before the webview sees new words. */
  answerUpdateMs?: number;
  /** How often an answer still coming is saved. */
  saveEveryMs?: number;
}

const ANSWER_UPDATE_MS = 50;
const SAVE_EVERY_MS = 2000;

export class ChatSession {
  private readonly send: typeof streamChat;
  private readonly answerUpdateMs: number;
  private readonly saveEveryMs: number;
  private current: Conversation;
  private history: ConversationSummary[] = [];
  private models: string[] = [];
  private model: string | undefined;
  private phase: Phase = "idle";
  private since: number | undefined;
  private controller: AbortController | undefined;
  private connectionNotice: string | undefined;
  private notice: string | undefined;
  private draft = "";
  private starting: Promise<void> | undefined;
  private modelTicket = 0;
  /** The model refresh on its way, so the webview opening at start does not ask a second time. */
  private refreshing: Promise<void> | undefined;
  private answerTimer: ReturnType<typeof setTimeout> | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();
  /** The models that report tool calling (only they are offered the tools). */
  private toolModels = new Set<string>();
  /** The change waiting for the user's decision, if any. */
  private awaiting: Awaiting | undefined;

  constructor(
    private readonly host: SessionHost,
    options: SessionOptions = {},
  ) {
    this.send = options.send ?? streamChat;
    this.answerUpdateMs = options.answerUpdateMs ?? ANSWER_UPDATE_MS;
    this.saveEveryMs = options.saveEveryMs ?? SAVE_EVERY_MS;
    this.model = host.preferredModel();
    this.current = newConversation(host.newId(host.clock()), host.clock(), this.model);
  }

  /** Loads the saved conversations and opens the newest; runs once. */
  start(): Promise<void> {
    this.starting ??= this.load();
    return this.starting;
  }

  /** A message from the webview: validated first, dropped and counted when it is not one. */
  async receive(raw: unknown): Promise<void> {
    const message = parseWebviewMessage(raw);
    if (message === undefined) {
      this.host.log({ call: "webview", durationMs: 0, dropped: 1 });
      return;
    }
    await this.handle(message);
  }

  /** The open conversation (for tests and the adapter). */
  get conversation(): Conversation {
    return this.current;
  }

  get busy(): boolean {
    return this.phase !== "idle";
  }

  /** The workspace's trust or folders changed: the line about the tools is drawn again. */
  toolsChanged(): void {
    this.postState();
  }

  /** Stops the open request, if any. */
  stop(): void {
    this.controller?.abort();
  }

  /** Waits for every save started so far (tests, and the adapter when the view goes away). */
  async flush(): Promise<void> {
    await this.saving;
  }

  /**
   * The model list again (start, a changed connection, a refused alias). `prefetched` is a list
   * request already sent by the caller (the status bar's check at start), shared instead of a
   * second one.
   */
  refreshModels(prefetched?: Promise<ModelsResult>): Promise<void> {
    const run = this.fetchModels(prefetched);
    this.refreshing = run;
    const clear = (): void => {
      if (this.refreshing === run) {
        this.refreshing = undefined;
      }
    };
    run.then(clear, clear);
    return run;
  }

  private async fetchModels(prefetched?: Promise<ModelsResult>): Promise<void> {
    const ticket = ++this.modelTicket;
    // A shared request is joined first, so its failure is never left unobserved.
    const shared = prefetched?.then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const resolved = await this.host.resolve();
    if (ticket !== this.modelTicket) {
      return;
    }
    if (!resolved.ok) {
      this.connectionNotice = describeNoServer(resolved.reason);
      this.postState();
      return;
    }
    try {
      let result: ModelsResult;
      if (shared === undefined) {
        result = await getModels(resolved.options);
      } else {
        const outcome = await shared;
        if (!outcome.ok) {
          throw outcome.error;
        }
        result = outcome.result;
      }
      if (ticket !== this.modelTicket) {
        return;
      }
      this.models = result.models.map((model) => model.id);
      this.toolModels = new Set(
        result.models.filter((model) => model.tools).map((model) => model.id),
      );
      this.connectionNotice = undefined;
      this.chooseModel(this.model);
    } catch (error) {
      if (ticket === this.modelTicket) {
        this.connectionNotice = describeCode(codeOf(error));
      }
    }
    this.postState();
  }

  private async handle(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.start();
        this.host.post({
          type: "labels",
          labels: labels(),
          maxChars: MAX_MESSAGE_CHARS,
          tooLong: PANEL.tooLong(MAX_MESSAGE_CHARS),
        });
        this.postState(this.draft);
        if (this.models.length === 0) {
          await (this.refreshing ?? this.refreshModels());
        }
        return;
      case "draft":
        this.draft = message.text;
        return;
      case "send":
        await this.sendMessage(message.text);
        return;
      case "stop":
        this.stop();
        return;
      case "newConversation":
        this.openNew();
        return;
      case "openConversation":
        await this.open(message.id);
        return;
      case "deleteConversation":
        await this.remove(message.id);
        return;
      case "selectModel":
        if (this.models.includes(message.model)) {
          this.model = message.model;
          this.host.rememberModel(message.model);
          this.notice = undefined;
        }
        this.postState();
        return;
      case "acceptEdit":
        await this.decide(true);
        return;
      case "rejectEdit":
        await this.decide(false);
        return;
      case "showDiff":
        if (this.awaiting !== undefined) {
          await this.host.workspace?.showProposal(this.awaiting.proposal).catch(() => undefined);
        }
        return;
    }
  }

  /** The user's click on Accept or Reject of the change waiting, if one is. */
  private async decide(accept: boolean): Promise<void> {
    const awaiting = this.awaiting;
    const workspace = this.host.workspace;
    if (awaiting === undefined || awaiting.applying || workspace === undefined) {
      return;
    }
    if (!accept) {
      awaiting.settle("rejected");
      return;
    }
    awaiting.applying = true;
    let decision: EditDecision;
    try {
      decision = await workspace.applyProposal(awaiting.proposal);
    } catch {
      decision = "not_applied";
    }
    awaiting.settle(decision);
  }

  /** Shows a proposed change and waits for Accept, Reject or Stop. Nothing is written before. */
  private waitForDecision(
    callId: string,
    proposal: EditProposal,
    signal: AbortSignal,
  ): Promise<EditDecision> {
    const workspace = this.host.workspace;
    return new Promise<EditDecision>((resolve) => {
      let settled = false;
      const settle = (decision: EditDecision): void => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        if (this.awaiting?.callId === callId) {
          this.awaiting = undefined;
        }
        void workspace?.closeProposal(proposal).catch(() => undefined);
        resolve(decision);
      };
      const onAbort = (): void => {
        // A click on Accept already applying finishes first: what it did is what the model reads.
        if (this.awaiting?.applying !== true) {
          settle("stopped");
        }
      };
      this.awaiting = { callId, proposal, settle, applying: false };
      if (signal.aborted) {
        settle("stopped");
        return;
      }
      signal.addEventListener("abort", onAbort);
      this.phase = "approval";
      this.postState();
      void workspace?.showProposal(proposal).catch(() => undefined);
    });
  }

  private async load(): Promise<void> {
    try {
      this.history = await this.host.store.list();
    } catch (error) {
      this.storeFailed(error, PANEL.loadFailed);
      return;
    }
    const newest = this.history[0];
    if (newest !== undefined) {
      await this.open(newest.id, true);
    }
  }

  private chooseModel(wanted: string | undefined): void {
    const preferred = this.host.preferredModel();
    this.model =
      wanted !== undefined && this.models.includes(wanted)
        ? wanted
        : preferred !== undefined && this.models.includes(preferred)
          ? preferred
          : this.models[0];
  }

  private openNew(): void {
    if (this.busy) {
      return;
    }
    this.current = newConversation(
      this.host.newId(this.host.clock()),
      this.host.clock(),
      this.model,
    );
    this.notice = undefined;
    this.draft = "";
    this.postState("");
  }

  private async open(id: string, quiet = false): Promise<void> {
    if (this.busy) {
      return;
    }
    let loaded: Awaited<ReturnType<ConversationStore["load"]>>;
    try {
      // A save still on its way must land first, or a fresh conversation would look missing.
      await this.saving;
      loaded = await this.host.store.load(id);
    } catch (error) {
      this.storeFailed(error, PANEL.loadFailed);
      return;
    }
    if (loaded === "missing") {
      this.history = this.history.filter((entry) => entry.id !== id);
      this.postState();
      return;
    }
    if (loaded === "unreadable") {
      if (!quiet) {
        this.notice = PANEL.unreadableConversation;
        this.postState();
      }
      return;
    }
    // A call that a closed window left without a result gets one, before its answer is closed.
    closeOpenCalls(loaded, INTERRUPTED_RESULT, TOOL_NOTES.stopped);
    if (closeInterrupted(loaded)) {
      this.save(loaded);
    }
    this.current = loaded;
    this.notice = undefined;
    if (
      loaded.model !== undefined &&
      this.models.length > 0 &&
      !this.models.includes(loaded.model)
    ) {
      this.notice = PANEL.modelGone;
    } else if (loaded.model !== undefined) {
      this.model = loaded.model;
    }
    this.postState();
  }

  private async remove(id: string): Promise<void> {
    if (this.busy) {
      return;
    }
    const entry = this.history.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      return;
    }
    if (!(await this.host.confirmDelete(entry.title === "" ? PANEL.untitled : entry.title))) {
      return;
    }
    try {
      // A save still on its way would write the file again after its deletion.
      await this.saving;
      await this.host.store.remove(id);
    } catch (error) {
      this.storeFailed(error, PANEL.deleteFailed);
      return;
    }
    this.history = this.history.filter((candidate) => candidate.id !== id);
    if (this.current.id === id) {
      this.openNew();
      return;
    }
    this.postState();
  }

  private async sendMessage(text: string): Promise<void> {
    if (this.busy) {
      return;
    }
    this.notice = undefined;
    if (this.model === undefined) {
      await this.refreshModels();
    }
    const model = this.model;
    const resolved = await this.host.resolve();
    if (!resolved.ok || model === undefined) {
      if (!resolved.ok) {
        this.connectionNotice = describeNoServer(resolved.reason);
      } else if (this.connectionNotice === undefined) {
        this.notice = PANEL.noModels;
      }
      this.postState(text);
      return;
    }
    const now = this.host.clock();
    if (!beginTurn(this.current, text, model, now)) {
      this.postState(text);
      return;
    }
    const conversation = this.current;
    const answer = pendingAnswer(conversation);
    this.draft = "";
    this.phase = "reading";
    this.since = now;
    const controller = new AbortController();
    this.controller = controller;
    this.upsertSummary(conversation);
    this.save(conversation);
    this.postState();

    let result: ChatResult;
    let outcome: ChatResult["outcome"];
    let phase: ChatResult["phase"];
    let stepLimit = false;
    if (!this.toolsFor(model)) {
      result = await this.sendStep(resolved.options, conversation, answer, model, controller);
      outcome = result.outcome;
      phase = result.phase;
    } else {
      const end: AgentEnd = await this.runLoop(
        resolved.options,
        conversation,
        answer,
        model,
        controller,
      );
      result = end.last;
      outcome = end.outcome;
      // A stop between two requests (a tool running, a change waiting) came after the first word.
      phase = result.outcome === "stopped" ? result.phase : "answering";
      stepLimit = end.stepLimit;
      closeOpenCalls(conversation, STOPPED_RESULT, TOOL_NOTES.stopped);
    }

    this.clearTimers();
    finishAnswer(
      conversation,
      {
        outcome,
        phase,
        code: result.code,
        overflow: result.overflow,
        finish: result.finish,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: result.durationMs,
        firstMs: result.firstMs,
        stepLimit,
      },
      this.host.clock(),
    );
    this.phase = "idle";
    this.since = undefined;
    this.controller = undefined;
    this.upsertSummary(conversation);
    this.save(conversation);
    this.postState();
    if (result.code === "model_alias_not_allowed") {
      await this.refreshModels();
    }
  }

  /** Whether this message goes with the tools: a workspace that allows them, a model that calls them. */
  private toolsFor(model: string): boolean {
    return this.host.workspace?.availability() === "on" && this.toolModels.has(model);
  }

  /** Why the tools are off, for the line under the conversation; `undefined` when they are on. */
  private toolsNote(): string | undefined {
    const workspace = this.host.workspace;
    if (workspace === undefined) {
      return undefined;
    }
    const availability = workspace.availability();
    if (availability === "untrusted") {
      return AGENT_PANEL.toolsUntrusted;
    }
    if (availability === "no_folder") {
      return AGENT_PANEL.toolsNoFolder;
    }
    return this.model !== undefined &&
      this.models.includes(this.model) &&
      !this.toolModels.has(this.model)
      ? AGENT_PANEL.toolsModel
      : undefined;
  }

  /** One request to the model, sent once, streaming its text into the open answer. */
  private sendStep(
    options: ClientOptions,
    conversation: Conversation,
    answer: AssistantTurn | undefined,
    model: string,
    controller: AbortController,
    step?: number,
  ): Promise<ChatResult> {
    const body =
      step === undefined
        ? requestBody(conversation, model)
        : agentRequestBody(conversation, model, SYSTEM_PROMPT, TOOL_DEFINITIONS);
    return this.send(
      options,
      body,
      {
        onFirstEvent: () => {
          this.phase = "answering";
          this.postAnswer(conversation);
        },
        onText: (delta) => {
          if (answer !== undefined) {
            answer.text += delta;
          }
          this.scheduleAnswer(conversation);
          this.scheduleSave(conversation);
        },
      },
      controller.signal,
      (record) => this.host.log(step === undefined ? record : { ...record, step }),
      () => this.host.clock(),
    );
  }

  /** The agent loop of one message: steps, tool calls, changes waiting for the user. */
  private runLoop(
    options: ClientOptions,
    conversation: Conversation,
    answer: AssistantTurn | undefined,
    model: string,
    controller: AbortController,
  ): Promise<AgentEnd> {
    const workspace = this.host.workspace as SessionWorkspace;
    const signal = controller.signal;
    // The calls of the current step; a model may repeat an id, so a call is found in order.
    let current: ToolStep[] = [];
    return runAgent(
      {
        send: (step) => {
          if (step > 1) {
            this.phase = "reading";
            this.since = this.host.clock();
            this.postState();
          }
          return this.sendStep(options, conversation, answer, model, controller, step);
        },
        recordCalls: (calls) => {
          this.clearTimers();
          current = recordCalls(conversation, calls);
          this.save(conversation);
        },
        runCall: async (call: RawToolCall): Promise<ToolOutcome> => {
          this.phase = "tool";
          this.postState();
          const started = this.host.clock();
          const outcome = await runToolCall(call.name, call.arguments, {
            fs: workspace.fs,
            roots: workspace.roots(),
            proposeEdit: (proposal) => this.waitForDecision(call.id, proposal, signal),
          });
          this.host.log({
            call: "tool",
            durationMs: this.host.clock() - started,
            tool: toolNamesForLog([call.name])[0],
            outcome: outcome.status,
            reason: outcome.reason,
          });
          return outcome;
        },
        recordOutcome: (call, outcome) => {
          const step = current.find(
            (candidate) => candidate.id === call.id && candidate.status === undefined,
          );
          if (step !== undefined) {
            step.result = outcome.result;
            step.status = outcome.status;
            step.note = outcome.note;
          }
          this.phase = "tool";
          this.save(conversation);
          this.postState();
        },
      },
      signal,
    );
  }

  private upsertSummary(conversation: Conversation): void {
    const summary = summaryOf(conversation);
    this.history = sortSummaries([
      summary,
      ...this.history.filter((entry) => entry.id !== summary.id),
    ]);
  }

  /** Saves in the background, in order; a failure is shown once and logged with its code. */
  private save(conversation: Conversation): void {
    const started = this.host.clock();
    this.saving = this.saving
      .then(() => this.host.store.save(conversation))
      .catch((error: unknown) => this.storeFailed(error, PANEL.saveFailed, started));
  }

  private storeFailed(error: unknown, sentence: string, started = this.host.clock()): void {
    const detail = error instanceof StoreError ? error.detail : undefined;
    this.host.log({ call: "store", durationMs: this.host.clock() - started, detail });
    this.notice = sentence;
    this.postState();
  }

  private scheduleAnswer(conversation: Conversation): void {
    this.answerTimer ??= setTimeout(() => {
      this.answerTimer = undefined;
      this.postAnswer(conversation);
    }, this.answerUpdateMs);
  }

  private scheduleSave(conversation: Conversation): void {
    this.saveTimer ??= setTimeout(() => {
      this.saveTimer = undefined;
      this.save(conversation);
    }, this.saveEveryMs);
  }

  private clearTimers(): void {
    clearTimeout(this.answerTimer);
    clearTimeout(this.saveTimer);
    this.answerTimer = undefined;
    this.saveTimer = undefined;
  }

  private postAnswer(conversation: Conversation): void {
    if (conversation !== this.current) {
      return;
    }
    const index = conversation.turns.length - 1;
    const turn = conversation.turns[index];
    if (turn !== undefined) {
      this.host.post({
        type: "answer",
        index,
        turn: viewTurn(turn, this.awaiting?.callId),
        phase: this.phase,
      });
    }
  }

  private postState(draft?: string): void {
    const awaitingCallId = this.awaiting?.callId;
    const state: ViewState = {
      conversationId: this.current.turns.length > 0 ? this.current.id : undefined,
      turns: this.current.turns.map((turn) => viewTurn(turn, awaitingCallId)),
      phase: this.phase,
      since: this.since,
      models: [...this.models],
      model: this.model,
      history: this.history.map((entry) => ({ ...entry })),
      notice: this.notice ?? this.connectionNotice,
      draft,
    };
    const toolsNote = this.toolsNote();
    if (toolsNote !== undefined) {
      state.toolsNote = toolsNote;
    }
    this.host.post({ type: "state", state });
  }
}

/** The panel's labels for the webview (the sentences that take a number are sent apart). */
export function labels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of [...Object.entries(PANEL), ...Object.entries(AGENT_PANEL)]) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

/**
 * One turn as the webview draws it. `awaitingCallId` is the call whose change waits for the
 * user's decision, if any.
 */
export function viewTurn(turn: Turn, awaitingCallId?: string): ViewTurn {
  if (turn.role === "user") {
    return { role: "user", text: turn.text };
  }
  const view: ViewTurn = {
    role: "assistant",
    model: turn.model,
    blocks: renderBlocks(turn.text),
    pending: turn.state === "pending",
    note: noteOf(turn),
    failure:
      turn.state !== "failed"
        ? undefined
        : turn.overflow !== undefined
          ? describeOverflow(turn.overflow)
          : describeCode(turn.code ?? "unexpected_response"),
  };
  if (turn.steps !== undefined && turn.steps.length > 0) {
    view.steps = turn.steps.map((round) => ({
      blocks: renderBlocks(round.text),
      calls: round.calls.map((call) =>
        viewCall(call, turn.state === "pending" && call.id === awaitingCallId),
      ),
    }));
  }
  return view;
}

const TOOL_VIEWS: Record<string, { icon: ToolIcon; label: string }> = {
  read_file: { icon: "read", label: AGENT_PANEL.toolRead },
  list_files: { icon: "list", label: AGENT_PANEL.toolList },
  search_text: { icon: "search", label: AGENT_PANEL.toolSearch },
  propose_edit: { icon: "edit", label: AGENT_PANEL.toolEdit },
};

/** The longest target shown on a tool line, in characters. */
const MAX_TARGET_CHARS = 200;

/** One tool call as a line of the panel: never the arguments' content beyond a path or a query. */
export function viewCall(call: ToolStep, awaiting = false): ViewCall {
  const known = Object.prototype.hasOwnProperty.call(TOOL_VIEWS, call.name)
    ? TOOL_VIEWS[call.name]
    : undefined;
  const target = targetOf(call.name, call.arguments).replace(/\s+/g, " ");
  return {
    icon: known?.icon ?? "tool",
    label: known?.label ?? AGENT_PANEL.toolOther,
    target:
      target.length > MAX_TARGET_CHARS ? `${target.slice(0, MAX_TARGET_CHARS - 3)}...` : target,
    status: call.status ?? (awaiting && call.result === undefined ? "awaiting" : "running"),
    note: call.note,
  };
}
