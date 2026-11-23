/**
 * Guard tests of the agent loop and its tools (Lot P0b), beside `test/panel-guards.test.ts`: the
 * new modules' imports, no write call in them, the tools' icons, the closed lists of the log, the
 * one place where an edit is applied, and the stub's agent scenarios.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOG_TOOL_NAMES, LOG_TOOL_REASONS } from "../src/log";
import { TOOL_ICONS, newNonce, panelHtml } from "../src/page";
import { TOOL_NAMES } from "../src/tools";
import {
  AGENT_SCENARIOS,
  SCENARIOS,
  STUB_CREATED_TEXT,
  STUB_EDIT_SUFFIX,
  firstReadLine,
} from "./stub-gateway/stub";
import { readText } from "./support/repo";

describe("the agent loop's modules", () => {
  it("agent.ts imports types only, so messages.ts can name its step limit without a cycle", () => {
    const text = readText("src/agent.ts");
    const imports = [...text.matchAll(/^import (type )?.*from "([^"]+)";$/gm)];
    assert.ok(imports.length > 0);
    for (const match of imports) {
      assert.equal(match[1], "type ", match[0]);
    }
  });

  it("tools.ts and workspace.ts import only relative modules and node:fs or node:path", () => {
    for (const module of ["tools", "workspace"]) {
      const specifiers = [...readText(`src/${module}.ts`).matchAll(/\bfrom\s+["']([^"']+)["']/g)];
      for (const match of specifiers) {
        const specifier = match[1] ?? "";
        assert.ok(
          specifier.startsWith("./") || specifier === "node:fs" || specifier === "node:path",
          `${module}.ts imports "${specifier}"`,
        );
      }
    }
  });

  it("have no write call: the file system they are given is read only", () => {
    const writing =
      /\b(writeFile|appendFile|createWriteStream|mkdir|copyFile|rename|unlink|rm|rmdir|truncate|symlink|chmod|open)\s*\(/;
    for (const module of ["agent", "tools", "workspace"]) {
      assert.equal(writing.test(readText(`src/${module}.ts`)), false, module);
    }
    const workspace = readText("src/workspace.ts");
    for (const method of ["realpath", "stat", "readFile", "readDir"]) {
      assert.match(workspace, new RegExp(`\\b${method}: `), method);
    }
  });

  it("applies an edit only through the editor's WorkspaceEdit, in the adapter", () => {
    const adapter = readText("src/extension.ts");
    assert.match(adapter, /new vscode\.WorkspaceEdit\(\)/);
    assert.match(adapter, /vscode\.workspace\.applyEdit\(edit\)/);
    assert.match(adapter, /vscode\.workspace\.isTrusted/);
    for (const module of ["session", "agent", "tools", "workspace", "panel"]) {
      assert.equal(/applyEdit\(|WorkspaceEdit/.test(readText(`src/${module}.ts`)), false, module);
    }
    // The session asks for it only from the user's click on Accept.
    const session = readText("src/session.ts");
    assert.equal([...session.matchAll(/\.applyProposal\(/g)].length, 1);
    assert.match(session, /case "acceptEdit":\n\s+await this\.decide\(true\);/);
  });
});

describe("the tools' icons", () => {
  it("are plain paths in a second hidden element, with no address", () => {
    const html = panelHtml({
      cspSource: "vscode-webview://abc",
      nonce: newNonce(),
      scriptUri: "vscode-webview://abc/media/panel.js",
      styleUri: "vscode-webview://abc/media/panel.css",
    });
    const block = /<div id="tool-icons" hidden>([\s\S]*?)<\/div>/.exec(html);
    assert.ok(block !== null);
    const names = [...(block[1] ?? "").matchAll(/<svg data-icon="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ["read", "list", "search", "edit", "tool", "accept", "reject", "diff"]);
    assert.deepEqual(Object.keys(TOOL_ICONS), names);
    for (const pathData of Object.values(TOOL_ICONS)) {
      assert.match(pathData, /^[MmLlHhVvZzAaCc0-9 .,-]+$/);
    }
  });
});

describe("the log's closed lists", () => {
  it("name the four tools and every reason a tool gives", () => {
    assert.deepEqual(
      LOG_TOOL_NAMES.filter((name) => name !== "other"),
      [...TOOL_NAMES],
    );
    const tools = readText("src/tools.ts");
    const reasons = /export type ToolReason =([\s\S]*?);/.exec(tools)?.[1] ?? "";
    for (const literal of reasons.matchAll(/"([a-z_]+)"/g)) {
      assert.ok((LOG_TOOL_REASONS as readonly string[]).includes(literal[1] ?? ""), literal[1]);
    }
    const workspace = readText("src/workspace.ts");
    for (const type of ["WorkspaceReason", "EditReason"]) {
      const block = new RegExp(`export type ${type} =([\\s\\S]*?);`).exec(workspace)?.[1] ?? "";
      for (const literal of block.matchAll(/"([a-z_]+)"/g)) {
        assert.ok((LOG_TOOL_REASONS as readonly string[]).includes(literal[1] ?? ""), literal[1]);
      }
    }
  });
});

describe("the stub's agent scenarios", () => {
  it("are listed with the others", () => {
    for (const scenario of AGENT_SCENARIOS) {
      assert.ok(SCENARIOS.includes(scenario), scenario);
    }
    assert.equal(STUB_EDIT_SUFFIX, " [edited by the stub]");
    assert.equal(STUB_CREATED_TEXT, "Created by the stub.\n");
  });

  it("take the first non-empty line of a read result for the edit", () => {
    assert.equal(firstReadLine("File a (lines 1-3 of 3):\n1\t\n2\t  x = 1\n3\ty"), "  x = 1");
    assert.equal(firstReadLine("Error: the path is outside the project folder."), undefined);
  });
});
