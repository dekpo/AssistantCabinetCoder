/**
 * The workspace rules of the panel's tools (Lot P0b), on real temporary folders: containment with
 * `realpath`, symbolic links that escape, sizes, binary files, listing, plain text search and the
 * planning of an edit (which writes nothing).
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  MAX_FILE_BYTES,
  MAX_LIST_ENTRIES,
  MAX_READ_LINES,
  MAX_SEARCH_RESULTS,
  WorkspaceError,
  decodeText,
  listFolder,
  nodeWorkspaceFs,
  planEdit,
  readFileExcerpt,
  resolvePath,
  searchText,
  splitLines,
  type WorkspaceReason,
} from "../src/workspace";

let parent: string;
let root: string;
let outside: string;

before(async () => {
  parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "acc-workspace-")));
  root = path.join(parent, "project");
  outside = path.join(parent, "outside");
  await fs.mkdir(path.join(root, "src", "deep"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(root, "README.md"), "# Title\nSome text\n");
  await fs.writeFile(
    path.join(root, "src", "main.py"),
    "def add(a, b):\n    return a + b\n\nprint(add(1, 2))\n",
  );
  await fs.writeFile(path.join(root, "src", "deep", "util.ts"), "export const Add = 1; // a.b*\n");
  await fs.writeFile(path.join(root, ".git", "config"), "def add hidden\n");
  await fs.writeFile(path.join(root, "node_modules", "pkg", "index.js"), "def add hidden\n");
  await fs.writeFile(path.join(root, "name with spaces & accents.txt"), "def add here\n");
  await fs.writeFile(path.join(root, "binary.bin"), Buffer.from([0x64, 0x65, 0x66, 0x00, 0x01]));
  await fs.writeFile(path.join(root, "latin1.txt"), Buffer.from([0x64, 0x65, 0x66, 0xe9, 0x0a]));
  await fs.writeFile(path.join(root, "big.txt"), "def add\n".repeat(MAX_FILE_BYTES / 8 + 1));
  await fs.writeFile(path.join(outside, "secret.txt"), "OUTSIDE-SECRET\n");
  await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "escape-link.txt"));
  await fs.symlink(outside, path.join(root, "escape-folder"));
  await fs.symlink(path.join(root, "src", "main.py"), path.join(root, "inner-link.py"));
});

after(async () => {
  await fs.rm(parent, { recursive: true, force: true });
});

async function refusal(promise: Promise<unknown>): Promise<WorkspaceReason> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof WorkspaceError, String(error));
    assert.equal(error.message, error.reason, "the message is the reason, never a path");
    return error.reason;
  }
  assert.fail("expected a refusal");
}

describe("resolvePath", () => {
  it("resolves a relative path inside the first folder, and an absolute one inside any", async () => {
    const relative = await resolvePath(nodeWorkspaceFs, [root], "src/main.py");
    assert.equal(relative.absolute, path.join(root, "src", "main.py"));
    assert.equal(relative.display, "src/main.py");
    assert.equal(relative.exists, true);
    const absolute = await resolvePath(
      nodeWorkspaceFs,
      [outside, root],
      path.join(root, "README.md"),
    );
    assert.equal(absolute.display, "README.md");
    assert.equal((await resolvePath(nodeWorkspaceFs, [root], ".")).display, ".");
    assert.equal((await resolvePath(nodeWorkspaceFs, [root], "  src  ")).display, "src");
  });

  it("refuses what leads outside, by dots, by an absolute path or by a symbolic link", async () => {
    for (const wanted of [
      "../outside/secret.txt",
      "src/../../outside/secret.txt",
      path.join(outside, "secret.txt"),
      "escape-link.txt",
      "escape-folder/secret.txt",
      "/",
      "../missing-outside.txt",
    ]) {
      assert.equal(
        await refusal(resolvePath(nodeWorkspaceFs, [root], wanted)),
        "outside_workspace",
        wanted,
      );
    }
  });

  it("follows a symbolic link that stays inside", async () => {
    const target = await resolvePath(nodeWorkspaceFs, [root], "inner-link.py");
    assert.equal(target.display, "src/main.py");
  });

  it("says not found inside, refuses no folder, a NUL byte and a very long path", async () => {
    assert.equal(await refusal(resolvePath(nodeWorkspaceFs, [root], "nope.txt")), "not_found");
    assert.equal(await refusal(resolvePath(nodeWorkspaceFs, [], "a")), "no_workspace");
    assert.equal(
      await refusal(resolvePath(nodeWorkspaceFs, [path.join(parent, "gone")], "a")),
      "no_workspace",
    );
    assert.equal(await refusal(resolvePath(nodeWorkspaceFs, [root], "a\0b")), "invalid_path");
    assert.equal(
      await refusal(resolvePath(nodeWorkspaceFs, [root], "a".repeat(2000))),
      "invalid_path",
    );
  });

  it("resolves a file to create through its nearest existing parent, never outside", async () => {
    const created = await resolvePath(nodeWorkspaceFs, [root], "src/new/deeper/file.ts", true);
    assert.equal(created.exists, false);
    assert.equal(created.display, "src/new/deeper/file.ts");
    assert.equal(
      await refusal(resolvePath(nodeWorkspaceFs, [root], "escape-folder/new.txt", true)),
      "outside_workspace",
    );
    assert.equal(
      await refusal(resolvePath(nodeWorkspaceFs, [root], "../new.txt", true)),
      "outside_workspace",
    );
  });
});

describe("reading a file", () => {
  it("numbers the lines and reads a range", async () => {
    const whole = await readFileExcerpt(nodeWorkspaceFs, [root], "src/main.py");
    assert.deepEqual(whole.numbered, [
      "1\tdef add(a, b):",
      "2\t    return a + b",
      "3\t",
      "4\tprint(add(1, 2))",
    ]);
    assert.deepEqual([whole.from, whole.to, whole.total, whole.more], [1, 4, 4, false]);
    const part = await readFileExcerpt(nodeWorkspaceFs, [root], "src/main.py", 2, 3);
    assert.deepEqual(part.numbered, ["2\t    return a + b", "3\t"]);
    assert.equal(part.more, true);
    const beyond = await readFileExcerpt(nodeWorkspaceFs, [root], "src/main.py", 9);
    assert.deepEqual(beyond.numbered, []);
  });

  it("returns a long file in parts of a bounded number of lines", async () => {
    const file = path.join(root, "long.txt");
    await fs.writeFile(file, Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n"));
    const first = await readFileExcerpt(nodeWorkspaceFs, [root], "long.txt");
    assert.equal(first.numbered.length, MAX_READ_LINES);
    assert.equal(first.more, true);
    const next = await readFileExcerpt(nodeWorkspaceFs, [root], "long.txt", first.to + 1);
    assert.equal(next.from, MAX_READ_LINES + 1);
    await fs.rm(file);
  });

  it("refuses a folder, a large file, a binary file and bytes that are not UTF-8", async () => {
    assert.equal(await refusal(readFileExcerpt(nodeWorkspaceFs, [root], "src")), "not_a_file");
    assert.equal(await refusal(readFileExcerpt(nodeWorkspaceFs, [root], "big.txt")), "too_large");
    assert.equal(await refusal(readFileExcerpt(nodeWorkspaceFs, [root], "binary.bin")), "binary");
    assert.equal(await refusal(readFileExcerpt(nodeWorkspaceFs, [root], "latin1.txt")), "binary");
  });

  it("reads a name with spaces and symbols", async () => {
    const excerpt = await readFileExcerpt(
      nodeWorkspaceFs,
      [root],
      "name with spaces & accents.txt",
    );
    assert.deepEqual(excerpt.numbered, ["1\tdef add here"]);
  });

  it("splits lines without an empty last line, and decodes a final CRLF", () => {
    assert.deepEqual(splitLines(""), []);
    assert.deepEqual(splitLines("a\r\nb\r\n"), ["a", "b"]);
    assert.deepEqual(splitLines("a\n\n"), ["a", ""]);
    assert.equal(decodeText(Buffer.from("plain")), "plain");
  });
});

describe("listing a folder", () => {
  it("lists folders first, sorted, without .git and node_modules", async () => {
    const listing = await listFolder(nodeWorkspaceFs, [root], "");
    assert.equal(listing.display, ".");
    assert.deepEqual(listing.entries.slice(0, 1), ["src/"]);
    assert.ok(!listing.entries.some((entry) => entry.startsWith(".git")));
    assert.ok(!listing.entries.some((entry) => entry.startsWith("node_modules")));
    assert.ok(listing.entries.includes("README.md"));
    assert.ok(listing.entries.includes("escape-link.txt"), "a link is listed, not followed");
    assert.deepEqual((await listFolder(nodeWorkspaceFs, [root], "src")).entries, [
      "deep/",
      "main.py",
    ]);
  });

  it("is bounded, and refuses a file or a folder outside", async () => {
    const crowded = path.join(root, "crowded");
    await fs.mkdir(crowded);
    for (let i = 0; i < MAX_LIST_ENTRIES + 5; i += 1) {
      await fs.writeFile(path.join(crowded, `f${String(i).padStart(4, "0")}`), "");
    }
    const listing = await listFolder(nodeWorkspaceFs, [root], "crowded");
    assert.equal(listing.entries.length, MAX_LIST_ENTRIES);
    assert.equal(listing.truncated, true);
    await fs.rm(crowded, { recursive: true });
    assert.equal(await refusal(listFolder(nodeWorkspaceFs, [root], "README.md")), "not_a_folder");
    assert.equal(
      await refusal(listFolder(nodeWorkspaceFs, [root], "escape-folder")),
      "outside_workspace",
    );
  });
});

describe("searching text", () => {
  it("finds plain text with its file and line, skipping hidden, binary and large files", async () => {
    const outcome = await searchText(nodeWorkspaceFs, [root], "def add", "");
    const found = outcome.matches.map((match) => `${match.display}:${match.line}`);
    assert.deepEqual(found.sort(), ["name with spaces & accents.txt:1", "src/main.py:1"]);
    assert.equal(outcome.truncated, false);
  });

  it("treats the query as text, not as a regular expression, and ignores case unless it has a capital", async () => {
    assert.deepEqual(
      (await searchText(nodeWorkspaceFs, [root], "a.b*", "")).matches.map((m) => m.display),
      ["src/deep/util.ts"],
    );
    assert.equal((await searchText(nodeWorkspaceFs, [root], "a+b", "")).matches.length, 0);
    const lower = await searchText(nodeWorkspaceFs, [root], "export const add", "src");
    assert.equal(lower.matches.length, 1);
    const upper = await searchText(nodeWorkspaceFs, [root], "export const ADD", "src");
    assert.equal(upper.matches.length, 0);
  });

  it("searches one file, never follows a link out, and stops at its limit", async () => {
    const one = await searchText(nodeWorkspaceFs, [root], "print", "src/main.py");
    assert.deepEqual(
      one.matches.map((m) => [m.display, m.line, m.text]),
      [["src/main.py", 4, "print(add(1, 2))"]],
    );
    const secret = await searchText(nodeWorkspaceFs, [root], "OUTSIDE-SECRET", "");
    assert.equal(secret.matches.length, 0);
    const many = path.join(root, "many.txt");
    await fs.writeFile(many, "needle\n".repeat(MAX_SEARCH_RESULTS + 10));
    const capped = await searchText(nodeWorkspaceFs, [root], "needle", "many.txt");
    assert.equal(capped.matches.length, MAX_SEARCH_RESULTS);
    assert.equal(capped.truncated, true);
    await fs.rm(many);
  });
});

describe("planning an edit (nothing is written)", () => {
  it("replaces one exact, unique occurrence", () => {
    const plan = planEdit("a\nb\nc\n", "b\n", "B\n");
    assert.ok(plan.ok);
    assert.equal(plan.kind, "edit");
    assert.equal(plan.after, "a\nB\nc\n");
    assert.deepEqual([plan.start, plan.end], [2, 4]);
  });

  it("refuses a missing, repeated or unchanged text", () => {
    assert.deepEqual(planEdit("abc", "x", "y"), { ok: false, reason: "text_not_found" });
    assert.deepEqual(planEdit("a a", "a", "b"), { ok: false, reason: "text_not_unique" });
    assert.deepEqual(planEdit("abc", "b", "b"), { ok: false, reason: "no_change" });
  });

  it("creates a missing file only from an empty old text, and fills an empty one", () => {
    const created = planEdit(undefined, "", "new\n");
    assert.ok(created.ok);
    assert.equal(created.kind, "create");
    assert.deepEqual(planEdit(undefined, "x", "y"), { ok: false, reason: "file_missing" });
    assert.deepEqual(planEdit("full", "", "y"), { ok: false, reason: "file_exists" });
    const filled = planEdit("", "", "text");
    assert.ok(filled.ok);
    assert.equal(filled.after, "text");
  });
});
