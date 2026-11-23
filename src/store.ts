/**
 * The saved conversations of the chat panel on disk (decision D-027). **The only module of the
 * extension that writes files**, and only inside the folder it is given: the private storage that
 * VS Code gives the extension for the workspace. A file name is built from a checked id only.
 * Every write goes to a temporary file that is flushed to the disk and then renamed over the old
 * one, so a crash or a full disk never leaves a half-written conversation. Writes to one file are
 * queued in order. Nothing here logs or throws text: a failure carries a Node error code only.
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Conversation } from "./conversation";
import {
  isConversationId,
  parseConversation,
  parseIndex,
  serializeConversation,
  serializeIndex,
  sortSummaries,
  summaryOf,
  type ConversationSummary,
} from "./history";

/** A conversation file larger than this is not read (it is reported unreadable). */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
const INDEX_FILE = "index.json";
const TEMPORARY = /^\..+\.[a-f0-9]{8}\.tmp$/;
/** A temporary file older than this was left by a crash and is removed. */
const STALE_TEMPORARY_MS = 60_000;

export type LoadResult = Conversation | "missing" | "unreadable";

export interface ConversationStore {
  list(): Promise<ConversationSummary[]>;
  load(id: string): Promise<LoadResult>;
  save(conversation: Conversation): Promise<void>;
  remove(id: string): Promise<void>;
}

/** A failed disk operation. `detail` is a Node error code such as `ENOSPC`, never a path. */
export class StoreError extends Error {
  readonly detail: string | undefined;

  constructor(detail: string | undefined) {
    super("store_failed");
    this.name = "StoreError";
    this.detail = detail;
  }
}

function nodeCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : undefined;
}

function storeError(error: unknown): StoreError {
  return error instanceof StoreError ? error : new StoreError(nodeCode(error));
}

/** A new id: the time in base 36 and eight random hexadecimal digits. */
export function newConversationId(now: number): string {
  return `${Math.max(0, Math.floor(now)).toString(36).padStart(6, "0")}-${randomBytes(4).toString("hex")}`;
}

export class FileStore implements ConversationStore {
  private readonly root: string;
  private index: Map<string, ConversationSummary> | undefined;
  private loading: Promise<void> | undefined;
  private readonly queues = new Map<string, Promise<void>>();

  /** `root` must be an absolute folder; it is created when needed. */
  constructor(root: string) {
    if (!path.isAbsolute(root)) {
      throw new StoreError(undefined);
    }
    this.root = path.resolve(root);
  }

  /** The file of a conversation. An id that is not one the store creates is refused. */
  fileOf(id: string): string {
    if (!isConversationId(id)) {
      throw new StoreError(undefined);
    }
    return path.join(this.root, `${id}.json`);
  }

  async list(): Promise<ConversationSummary[]> {
    try {
      await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
      const names = await fs.readdir(this.root);
      await this.removeStaleTemporaries(names);
      const ids = names
        .filter((name) => name.endsWith(".json") && name !== INDEX_FILE)
        .map((name) => name.slice(0, -".json".length))
        .filter(isConversationId);
      const cached = await this.readIndex();
      const same =
        cached !== undefined &&
        cached.length === ids.length &&
        cached.every((entry) => ids.includes(entry.id));
      const entries = same ? cached : await this.rebuild(ids);
      this.index = new Map(entries.map((entry) => [entry.id, entry]));
      if (!same) {
        // The index is only a cache: its rewrite is queued, not awaited, so that a save waiting
        // for this listing is never waited for in turn.
        this.enqueue(INDEX_FILE, () => this.writeIndex()).catch(() => undefined);
      }
      return sortSummaries(entries);
    } catch (error) {
      throw storeError(error);
    }
  }

  async load(id: string): Promise<LoadResult> {
    const file = this.fileOf(id);
    try {
      const info = await fs.stat(file);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) {
        return "unreadable";
      }
      const conversation = parseConversation(await fs.readFile(file, "utf8"));
      return conversation !== undefined && conversation.id === id ? conversation : "unreadable";
    } catch (error) {
      if (nodeCode(error) === "ENOENT") {
        return "missing";
      }
      throw storeError(error);
    }
  }

  /**
   * Saves a conversation. The order of the writes is fixed when this is called (the text is taken
   * now), so the last call always wins, even before the index was first read.
   */
  async save(conversation: Conversation): Promise<void> {
    const name = path.basename(this.fileOf(conversation.id));
    const text = serializeConversation(conversation);
    const summary = summaryOf(conversation);
    const ready = this.ensureIndex();
    const written = this.enqueue(name, async () => {
      await ready;
      await this.writeAtomic(name, text);
    });
    const indexed = this.enqueue(INDEX_FILE, async () => {
      await written;
      this.index?.set(summary.id, summary);
      await this.writeIndex();
    });
    try {
      await indexed;
    } catch (error) {
      throw storeError(error);
    }
  }

  async remove(id: string): Promise<void> {
    const file = this.fileOf(id);
    const ready = this.ensureIndex();
    const removed = this.enqueue(path.basename(file), async () => {
      await ready;
      try {
        await fs.unlink(file);
      } catch (error) {
        if (nodeCode(error) !== "ENOENT") {
          throw error;
        }
      }
    });
    const indexed = this.enqueue(INDEX_FILE, async () => {
      await removed;
      this.index?.delete(id);
      await this.writeIndex();
    });
    try {
      await indexed;
    } catch (error) {
      throw storeError(error);
    }
  }

  /** Resolves when every queued write has ended (tests, and before the window closes). */
  async idle(): Promise<void> {
    while (this.queues.size > 0) {
      await Promise.all([...this.queues.values()]);
    }
  }

  /** Reads the index once; a failed read is tried again at the next call. */
  private ensureIndex(): Promise<void> {
    if (this.index !== undefined) {
      return Promise.resolve();
    }
    this.loading ??= this.list().then(
      () => undefined,
      (error: unknown) => {
        this.loading = undefined;
        throw error;
      },
    );
    return this.loading;
  }

  /** Runs `task` after every earlier task on the same file name, even a failed one. */
  private enqueue(name: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(name) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    const settled = next.catch(() => undefined);
    this.queues.set(name, settled);
    void settled.then(() => {
      if (this.queues.get(name) === settled) {
        this.queues.delete(name);
      }
    });
    return next;
  }

  private async writeAtomic(name: string, text: string): Promise<void> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.root, `.${name}.${randomBytes(4).toString("hex")}.tmp`);
    try {
      const handle = await fs.open(temporary, "w", 0o600);
      try {
        await handle.writeFile(text, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, path.join(this.root, name));
    } catch (error) {
      await fs.unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  private writeIndex(): Promise<void> {
    return this.writeAtomic(INDEX_FILE, serializeIndex([...(this.index?.values() ?? [])]));
  }

  private async readIndex(): Promise<ConversationSummary[] | undefined> {
    try {
      return parseIndex(await fs.readFile(path.join(this.root, INDEX_FILE), "utf8"));
    } catch {
      return undefined;
    }
  }

  /** The index from the files themselves; a file that cannot be read is listed without a title. */
  private async rebuild(ids: readonly string[]): Promise<ConversationSummary[]> {
    const entries: ConversationSummary[] = [];
    for (const id of ids) {
      const loaded = await this.load(id).catch(() => "unreadable" as const);
      if (loaded === "missing") {
        continue;
      }
      if (loaded === "unreadable") {
        const info = await fs.stat(this.fileOf(id)).catch(() => undefined);
        entries.push({ id, title: "", updatedAt: Math.floor(info?.mtimeMs ?? 0) });
        continue;
      }
      entries.push(summaryOf(loaded));
    }
    return entries;
  }

  private async removeStaleTemporaries(names: readonly string[]): Promise<void> {
    const now = Date.now();
    for (const name of names.filter((candidate) => TEMPORARY.test(candidate))) {
      const file = path.join(this.root, name);
      const info = await fs.stat(file).catch(() => undefined);
      if (info !== undefined && now - info.mtimeMs > STALE_TEMPORARY_MS) {
        await fs.unlink(file).catch(() => undefined);
      }
    }
  }
}
