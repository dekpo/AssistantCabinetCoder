import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { beginTurn, finishAnswer, newConversation, type Conversation } from "../src/conversation";
import { CONVERSATION_ID_PATTERN } from "../src/protocol";
import { FileStore, StoreError, newConversationId } from "../src/store";

const T0 = 1_700_000_000_000;
let parent: string;

before(async () => {
  parent = await fs.mkdtemp(path.join(os.tmpdir(), "acc-store-"));
});

after(async () => {
  await fs.rm(parent, { recursive: true, force: true });
});

async function freshRoot(name: string): Promise<string> {
  return path.join(parent, name, "conversations");
}

function conversation(id: string, text: string, at = T0): Conversation {
  const value = newConversation(id, at, "cabinet-chat");
  beginTurn(value, text, "cabinet-chat", at);
  value.turns[1]!.text = `answer to ${text}`;
  finishAnswer(value, { outcome: "complete", phase: "answering" }, at + 1);
  return value;
}

/** Every file below a folder, as paths relative to it. */
async function filesBelow(folder: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        found.push(path.relative(folder, full));
      }
    }
  };
  await walk(folder);
  return found.sort();
}

describe("newConversationId", () => {
  it("makes ids of the shape the protocol accepts, all different", () => {
    const ids = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const id = newConversationId(T0 + index);
      assert.match(id, CONVERSATION_ID_PATTERN);
      ids.add(id);
    }
    assert.equal(ids.size, 200);
    assert.match(newConversationId(0), CONVERSATION_ID_PATTERN);
  });
});

describe("FileStore", () => {
  it("saves, lists newest first, loads and removes, inside its own folder only", async () => {
    const root = await freshRoot("basic");
    const store = new FileStore(root);
    assert.deepEqual(await store.list(), []);
    const first = conversation("aaaaaa-00000001", "first", T0);
    const second = conversation("bbbbbb-00000002", "second", T0 + 10);
    await store.save(first);
    await store.save(second);
    await store.idle();
    assert.deepEqual(
      (await store.list()).map((entry) => entry.title),
      ["second", "first"],
    );
    assert.deepEqual(await store.load(first.id), first);
    assert.deepEqual(await filesBelow(parent), [
      "basic/conversations/aaaaaa-00000001.json",
      "basic/conversations/bbbbbb-00000002.json",
      "basic/conversations/index.json",
    ]);
    await store.remove(first.id);
    assert.equal(await store.load(first.id), "missing");
    assert.deepEqual(
      (await new FileStore(root).list()).map((entry) => entry.id),
      ["bbbbbb-00000002"],
    );
    await store.remove(first.id);
  });

  it("keeps its files private to the user", async (context) => {
    if (process.platform === "win32") {
      context.skip("POSIX permissions only");
      return;
    }
    const root = await freshRoot("modes");
    const store = new FileStore(root);
    await store.save(conversation("aaaaaa-00000001", "private"));
    assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(root, "aaaaaa-00000001.json"))).mode & 0o777, 0o600);
  });

  it("refuses an id that is not one it creates, before touching the disk", async () => {
    const root = await freshRoot("hostile");
    const store = new FileStore(root);
    for (const id of ["../outside", "/etc/passwd", "a/b-00000000", "index", "", "x.json"]) {
      assert.throws(() => store.fileOf(id), StoreError, id);
      await assert.rejects(store.load(id), StoreError);
      await assert.rejects(store.remove(id), StoreError);
      await assert.rejects(store.save({ ...conversation("aaaaaa-00000001", "x"), id }), StoreError);
    }
    assert.throws(() => new FileStore("relative/folder"), StoreError);
    await assert.rejects(fs.stat(path.join(parent, "outside.json")));
  });

  it("writes in order: the last save of a conversation wins", async () => {
    const root = await freshRoot("order");
    const store = new FileStore(root);
    const value = conversation("aaaaaa-00000001", "v0");
    const saves: Promise<void>[] = [];
    for (let index = 1; index <= 20; index += 1) {
      const copy = structuredClone(value);
      copy.turns[1]!.text = `version ${index}`;
      saves.push(store.save(copy));
    }
    await Promise.all(saves);
    await store.idle();
    const loaded = await store.load("aaaaaa-00000001");
    assert.ok(typeof loaded === "object");
    assert.equal(loaded.turns[1]?.text, "version 20");
    assert.deepEqual(await filesBelow(root), ["aaaaaa-00000001.json", "index.json"]);
  });

  it("rebuilds a lost or stale index from the files, listing a damaged file without a title", async () => {
    const root = await freshRoot("rebuild");
    const store = new FileStore(root);
    await store.save(conversation("aaaaaa-00000001", "kept"));
    await store.save(conversation("bbbbbb-00000002", "damaged"));
    await fs.writeFile(path.join(root, "bbbbbb-00000002.json"), "{ half a file");
    await fs.writeFile(path.join(root, "index.json"), "garbage");
    const listed = await new FileStore(root).list();
    assert.deepEqual(listed.map((entry) => [entry.id, entry.title]).sort(), [
      ["aaaaaa-00000001", "kept"],
      ["bbbbbb-00000002", ""],
    ]);
    assert.equal(await store.load("bbbbbb-00000002"), "unreadable");
    // A file added behind the store's back (another window) makes the index stale: rebuilt.
    await fs.writeFile(
      path.join(root, "cccccc-00000003.json"),
      JSON.stringify({
        ...JSON.parse(await fs.readFile(path.join(root, "aaaaaa-00000001.json"), "utf8")),
        id: "cccccc-00000003",
        title: "added",
      }),
    );
    const again = await new FileStore(root).list();
    assert.ok(again.some((entry) => entry.title === "added"));
    // The damaged file is never rewritten or removed by listing.
    assert.equal(
      await fs.readFile(path.join(root, "bbbbbb-00000002.json"), "utf8"),
      "{ half a file",
    );
  });

  it("never leaves a half-written file: an old temporary is cleaned, the real file is intact", async () => {
    const root = await freshRoot("temporaries");
    const store = new FileStore(root);
    await store.save(conversation("aaaaaa-00000001", "safe"));
    const stale = path.join(root, ".aaaaaa-00000001.json.0badc0de.tmp");
    const fresh = path.join(root, ".aaaaaa-00000001.json.0000beef.tmp");
    await fs.writeFile(stale, "{ partial");
    await fs.writeFile(fresh, "{ partial");
    const old = new Date(Date.now() - 10 * 60_000);
    await fs.utimes(stale, old, old);
    await new FileStore(root).list();
    await assert.rejects(fs.stat(stale));
    await fs.stat(fresh);
    const loaded = await store.load("aaaaaa-00000001");
    assert.ok(typeof loaded === "object" && loaded.title === "safe");
  });

  it("reports a disk failure with a Node code only, never a path or a text", async () => {
    const blocker = path.join(parent, "blocker-SECRET-PATH");
    await fs.writeFile(blocker, "a file where a folder should be");
    const store = new FileStore(path.join(blocker, "conversations"));
    const error = await store.save(conversation("aaaaaa-00000001", "SECRET-TEXT")).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    assert.ok(error instanceof StoreError);
    assert.match(error.detail ?? "", /^[A-Z0-9_]+$/);
    const shown = [error.message, String(error), error.stack ?? "", JSON.stringify(error)].join(
      "\n",
    );
    assert.equal(shown.includes("SECRET"), false);
  });
});
