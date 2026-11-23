/**
 * The chat panel's logic, against an injected host, so it needs no editor: the open conversation,
 * the saved ones, the model list, one request at a time, the stop, and what the webview is told.
 * The conversation lives here, in the extension; the webview only draws what it receives and is
 * redrawn from here when it is shown again. Conversations are saved through the store (decision
 * D-027); nothing of them reaches the log, which gets codes, durations and counts only.
 */
import { streamChat, type ChatResult } from "./chat";
import { getModels, type ClientOptions } from "./client";
import { codeOf } from "./codes";
import {
  beginTurn,
  closeInterrupted,
  finishAnswer,
  newConversation,
  noteOf,
  pendingAnswer,
  requestBody,
  type Conversation,
  type Turn,
} from "./conversation";
import type { NoServerReason } from "./discovery";
import { sortSummaries, summaryOf, type ConversationSummary } from "./history";
import type { CallRecord } from "./log";
import { PANEL, describeCode, describeNoServer, describeOverflow } from "./messages";
import {
  MAX_MESSAGE_CHARS,
  parseWebviewMessage,
  type HostMessage,
  type Phase,
  type ViewState,
  type ViewTurn,
  type WebviewMessage,
} from "./protocol";
import { renderBlocks } from "./render";
import { StoreError, type ConversationStore } from "./store";

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
  private answerTimer: ReturnType<typeof setTimeout> | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();

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

  /** Stops the open request, if any. */
  stop(): void {
    this.controller?.abort();
  }

  /** Waits for every save started so far (tests, and the adapter when the view goes away). */
  async flush(): Promise<void> {
    await this.saving;
  }

  /** The model list again (start, a changed connection, a refused alias). */
  async refreshModels(): Promise<void> {
    const ticket = ++this.modelTicket;
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
      const result = await getModels(resolved.options);
      if (ticket !== this.modelTicket) {
        return;
      }
      this.models = result.models.map((model) => model.id);
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
          await this.refreshModels();
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
    }
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

    const result: ChatResult = await this.send(
      resolved.options,
      requestBody(conversation, model),
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
      (record) => this.host.log(record),
      () => this.host.clock(),
    );

    this.clearTimers();
    finishAnswer(
      conversation,
      {
        outcome: result.outcome,
        phase: result.phase,
        code: result.code,
        overflow: result.overflow,
        finish: result.finish,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: result.durationMs,
        firstMs: result.firstMs,
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
      this.host.post({ type: "answer", index, turn: viewTurn(turn), phase: this.phase });
    }
  }

  private postState(draft?: string): void {
    const state: ViewState = {
      conversationId: this.current.turns.length > 0 ? this.current.id : undefined,
      turns: this.current.turns.map(viewTurn),
      phase: this.phase,
      since: this.since,
      models: [...this.models],
      model: this.model,
      history: this.history.map((entry) => ({ ...entry })),
      notice: this.notice ?? this.connectionNotice,
      draft,
    };
    this.host.post({ type: "state", state });
  }
}

/** The panel's labels for the webview (the sentences that take a number are sent apart). */
export function labels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(PANEL)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

/** One turn as the webview draws it. */
export function viewTurn(turn: Turn): ViewTurn {
  if (turn.role === "user") {
    return { role: "user", text: turn.text };
  }
  return {
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
}
