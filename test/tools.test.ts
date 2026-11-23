/**
 * The panel's four tools (Lot P0b): their definitions, the neutrality of every text the model
 * reads, the checking of arguments (a malformed call is a result, never an error), and each tool
 * run on a real temporary folder. An edit is only proposed: nothing is written by these modules.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { TOOL_NOTES } from "../src/messages";
import {
  MAX_EDIT_CHARS,
  STOPPED_RESULT,
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  parseToolCall,
  runToolCall,
  targetOf,
  type EditDecision,
  type EditProposal,
  type ToolDeps,
} from "../src/tools";
import { nodeWorkspaceFs } from "../src/workspace";
import { readText } from "./support/repo";

/** The size of the system prompt, in characters: a change of it is a decision, not an accident. */
const SYSTEM_PROMPT_CHARS = 500;

let parent: string;
let root: string;

before(async () => {
  parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "acc-tools-")));
  root = path.join(parent, "project");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "main.py"), "def add(a, b):\n    return a + b\n");
  await fs.writeFile(path.join(parent, "outside.txt"), "OUTSIDE\n");
});

after(async () => {
  await fs.rm(parent, { recursive: true, force: true });
});

function deps(decision: EditDecision = "rejected", seen: EditProposal[] = []): ToolDeps {
  return {
    fs: nodeWorkspaceFs,
    roots: [root],
    proposeEdit: (proposal) => {
      seen.push(proposal);
      return Promise.resolve(decision);
    },
  };
}

describe("the tools' definitions", () => {
  it("are the four short names, valid for the server, with their required arguments", () => {
    assert.deepEqual(
      TOOL_DEFINITIONS.map((tool) => tool.function.name),
      [...TOOL_NAMES],
    );
    assert.deepEqual(TOOL_NAMES, ["read_file", "list_files", "search_text", "propose_edit"]);
    for (const tool of TOOL_DEFINITIONS) {
      assert.equal(tool.type, "function");
      assert.match(tool.function.name, /^[A-Za-z0-9_.:/-]{1,128}$/);
      assert.ok(tool.function.description.length > 20);
    }
    const required = TOOL_DEFINITIONS.map(
      (tool) => (tool.function.parameters as { required?: string[] }).required ?? [],
    );
    assert.deepEqual(required, [["path"], [], ["query"], ["path", "old_text", "new_text"]]);
  });

  it("keep the system prompt short and of a known size", () => {
    assert.equal(SYSTEM_PROMPT.length, SYSTEM_PROMPT_CHARS);
    for (const name of TOOL_NAMES) {
      assert.ok(SYSTEM_PROMPT.includes(name), name);
    }
  });
});

describe("neutrality guard of every text the model reads", () => {
  // Who the user is never appears: no profession, no organisation, no product name.
  const FORBIDDEN =
    /cabinet|lawyer|attorney|avocat|legal|law firm|notary|doctor|medical|patient|client file|accountant|bank|company|firm|office|employee|assistant cabinet/i;

  it("holds in the system prompt, the descriptions and the source of tools.ts", () => {
    assert.equal(FORBIDDEN.test(SYSTEM_PROMPT), false);
    assert.equal(FORBIDDEN.test(JSON.stringify(TOOL_DEFINITIONS)), false);
    const source = readText("src/tools.ts")
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/|\/\*\*)/.test(line))
      .join("\n");
    assert.equal(FORBIDDEN.test(source), false);
  });
});

describe("checking a call", () => {
  it("accepts well-formed arguments, numbers given as text included", () => {
    assert.deepEqual(parseToolCall("read_file", '{"path":"a.py","start_line":"3","end_line":9}'), {
      ok: true,
      request: { tool: "read_file", path: "a.py", startLine: 3, endLine: 9 },
    });
    assert.deepEqual(parseToolCall("list_files", ""), {
      ok: true,
      request: { tool: "list_files", path: "" },
    });
    assert.deepEqual(parseToolCall("search_text", '{"query":"x","path":null}'), {
      ok: true,
      request: { tool: "search_text", query: "x", path: "" },
    });
  });

  it("turns malformed arguments into a result the model reads", () => {
    const cases: [string, string][] = [
      ["read_file", "{not json"],
      ["read_file", "[1,2]"],
      ["read_file", '{"path":""}'],
      ["read_file", '{"path":"a","start_line":0}'],
      ["read_file", '{"path":"a","end_line":"two"}'],
      ["list_files", '{"path":5}'],
      ["search_text", '{"query":""}'],
      ["search_text", JSON.stringify({ query: "x".repeat(201) })],
      ["propose_edit", '{"path":"a","old_text":"x"}'],
      [
        "propose_edit",
        JSON.stringify({ path: "a", old_text: "", new_text: "y".repeat(MAX_EDIT_CHARS + 1) }),
      ],
    ];
    for (const [name, args] of cases) {
      const parsed = parseToolCall(name, args);
      assert.equal(parsed.ok, false, `${name} ${args.slice(0, 40)}`);
      assert.ok(!parsed.ok && parsed.reason === "invalid_arguments");
      assert.ok(!parsed.ok && parsed.result.startsWith("Error: invalid arguments: "));
    }
  });

  it("answers an unknown tool with the list of the four", () => {
    const parsed = parseToolCall("run_command", '{"cmd":"rm -rf /"}');
    assert.ok(!parsed.ok);
    assert.equal(parsed.reason, "unknown_tool");
    assert.match(parsed.result, /read_file, list_files, search_text, propose_edit/);
    assert.equal(parsed.result.includes("rm -rf"), false, "the call's content is not echoed");
  });

  it("shows only a path or a query as the call's target", () => {
    assert.equal(targetOf("read_file", '{"path":" src/a.py "}'), "src/a.py");
    assert.equal(targetOf("list_files", "{}"), ".");
    assert.equal(targetOf("search_text", '{"query":"def add"}'), "def add");
    assert.equal(
      targetOf("propose_edit", JSON.stringify({ path: "a.py", old_text: "SECRET", new_text: "X" })),
      "a.py",
    );
    assert.equal(targetOf("nope", "{}"), "");
  });
});

describe("running a call", () => {
  it("reads a file with numbered lines and a note", async () => {
    const outcome = await runToolCall("read_file", '{"path":"src/main.py"}', deps());
    assert.equal(outcome.status, "done");
    assert.equal(
      outcome.result,
      "File src/main.py (lines 1-2 of 2):\n1\tdef add(a, b):\n2\t    return a + b",
    );
    assert.equal(outcome.note, TOOL_NOTES.lines(1, 2, 2));
  });

  it("lists and searches", async () => {
    const listed = await runToolCall("list_files", "{}", deps());
    assert.equal(listed.result, "Folder . (1 entries):\nsrc/");
    const found = await runToolCall("search_text", '{"query":"return"}', deps());
    assert.equal(found.result, "1 matching lines:\nsrc/main.py:2: return a + b");
    assert.equal(found.note, "1 match");
    const none = await runToolCall("search_text", '{"query":"zzz"}', deps());
    assert.equal(none.result, "No match in 1 files.");
  });

  it("refuses a path outside the project with a result, and never reads it", async () => {
    const outcome = await runToolCall("read_file", '{"path":"../outside.txt"}', deps());
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.reason, "outside_workspace");
    assert.equal(outcome.result.includes("OUTSIDE"), false);
    assert.equal(outcome.note, TOOL_NOTES.reason("outside_workspace"));
  });

  it("proposes an edit, writes nothing itself, and reports the user's decision", async () => {
    const file = path.join(root, "src", "main.py");
    const before = await fs.readFile(file, "utf8");
    const seen: EditProposal[] = [];
    const args = JSON.stringify({
      path: "src/main.py",
      old_text: "    return a + b\n",
      new_text: "    return b + a\n",
    });
    const rejected = await runToolCall("propose_edit", args, deps("rejected", seen));
    assert.equal(rejected.status, "rejected");
    assert.match(rejected.result, /^Rejected by the user: src\/main\.py is unchanged\./);
    assert.equal(await fs.readFile(file, "utf8"), before, "nothing written");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.kind, "edit");
    assert.equal(seen[0]?.after, "def add(a, b):\n    return b + a\n");
    assert.equal(seen[0]?.display, "src/main.py");

    const applied = await runToolCall("propose_edit", args, deps("applied"));
    assert.equal(applied.status, "accepted");
    assert.match(applied.result, /accepted the edit: it was applied to src\/main\.py/);
    const stopped = await runToolCall("propose_edit", args, deps("stopped"));
    assert.deepEqual([stopped.status, stopped.note], ["stopped", TOOL_NOTES.stopped]);
    const changed = await runToolCall("propose_edit", args, deps("file_changed"));
    assert.deepEqual([changed.status, changed.reason], ["failed", "file_changed"]);
    assert.equal(await fs.readFile(file, "utf8"), before, "still nothing written");
  });

  it("proposes the creation of a missing file, and refuses an edit that cannot apply", async () => {
    const seen: EditProposal[] = [];
    const created = await runToolCall(
      "propose_edit",
      JSON.stringify({ path: "src/new.py", old_text: "", new_text: "x = 1\n" }),
      deps("applied", seen),
    );
    assert.equal(created.status, "accepted");
    assert.equal(seen[0]?.kind, "create");
    await assert.rejects(fs.access(path.join(root, "src", "new.py")), "not created by the tool");
    const missing = await runToolCall(
      "propose_edit",
      JSON.stringify({ path: "src/main.py", old_text: "nothing like this", new_text: "y" }),
      deps("applied", seen),
    );
    assert.deepEqual([missing.status, missing.reason], ["failed", "text_not_found"]);
    const outside = await runToolCall(
      "propose_edit",
      JSON.stringify({ path: "../outside.txt", old_text: "OUTSIDE", new_text: "X" }),
      deps("applied", seen),
    );
    assert.equal(outside.reason, "outside_workspace");
    assert.equal(seen.length, 1, "a refused edit is never shown to the user");
  });

  it("gives a stopped call a result that says so", () => {
    assert.equal(STOPPED_RESULT, "Not run: the user stopped the request.");
  });
});
