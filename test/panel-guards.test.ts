/**
 * Guard tests of the chat panel (Lot P0a): the webview's script, the page's Content Security
 * Policy, the language of the new folders, the manifest's view, the one module that writes files,
 * and the new fields of the log. Beside `test/guards.test.ts`, which they extend.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { formatCallLine } from "../src/log";
import { ICONS, contentSecurityPolicy, newNonce, panelHtml } from "../src/page";
import { ROOT, listFiles, readJson, readText } from "./support/repo";

const WEBVIEW_SCRIPTS = listFiles("media", [".js"]);
const DIACRITICS = /[\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u017f]/;

describe("webview guard", () => {
  it("has the panel's script and stylesheet", () => {
    assert.deepEqual(listFiles("media", [".js", ".css"]), ["media/panel.css", "media/panel.js"]);
  });

  it("uses no markup injection, no evaluation, no network, no storage and no console", () => {
    const forbidden: [string, RegExp][] = [
      ["innerHTML", /\binnerHTML\b/],
      ["outerHTML", /\bouterHTML\b/],
      ["insertAdjacentHTML", /\binsertAdjacentHTML\b/],
      ["document.write", /\bdocument\.write/],
      ["eval", /\beval\s*\(/],
      ["new Function", /\bnew\s+Function\b/],
      ["fetch", /\bfetch\s*\(/],
      ["XMLHttpRequest", /XMLHttpRequest/],
      ["WebSocket", /WebSocket/],
      ["EventSource", /EventSource/],
      ["setState", /\bsetState\b/],
      ["getState", /\bgetState\b/],
      ["localStorage", /\blocalStorage\b/],
      ["sessionStorage", /\bsessionStorage\b/],
      ["indexedDB", /\bindexedDB\b/],
      ["console", /\bconsole\./],
      ["address literal", /https?:\/\//],
      ["string timer", /set(Timeout|Interval)\(\s*["'`]/],
    ];
    for (const file of WEBVIEW_SCRIPTS) {
      const text = readText(file);
      for (const [label, pattern] of forbidden) {
        assert.equal(pattern.test(text), false, `${file}: ${label}`);
      }
    }
  });

  it("sets text with textContent and holds no sentence of its own", () => {
    const text = readText("media/panel.js");
    assert.match(text, /textContent/);
    assert.match(text, /createElement/);
    // Every string literal is short: labels come from src/messages.ts.
    const literals = [...text.matchAll(/"([^"\\]*)"/g)].map((match) => match[1] ?? "");
    const sentences = literals.filter((literal) => /^[A-Z][a-z]+ [a-z]+ [a-z]+/.test(literal));
    assert.deepEqual(sentences, []);
  });

  it("has no address in the stylesheet: every resource comes from the extension", () => {
    assert.equal(/url\(|@import|https?:\/\//.test(readText("media/panel.css")), false);
  });
});

describe("the page's Content Security Policy", () => {
  const SOURCE = "vscode-webview://abc";

  it("allows nothing by default, the script only with its nonce, styles only from the extension", () => {
    const nonce = newNonce();
    const policy = contentSecurityPolicy(SOURCE, nonce);
    assert.match(policy, /^default-src 'none'; /);
    assert.match(policy, new RegExp(`script-src 'nonce-${nonce}'`));
    assert.match(policy, new RegExp(`style-src ${SOURCE}(;|$)`));
    assert.equal(/unsafe-inline|unsafe-eval|\*|https?:|data:|blob:/.test(policy), false);
  });

  it("builds a page whose one script carries the nonce, with no inline script or style", () => {
    const nonce = newNonce();
    const html = panelHtml({
      cspSource: SOURCE,
      nonce,
      scriptUri: `${SOURCE}/media/panel.js`,
      styleUri: `${SOURCE}/media/panel.css`,
    });
    assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; /);
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.match(scripts[0]?.[1] ?? "", new RegExp(` nonce="${nonce}"`));
    assert.equal(scripts[0]?.[2], "");
    assert.equal(/<style|\sstyle=|\son[a-z]+=/i.test(html), false);
  });

  it("draws the panel's icons in a hidden element: plain paths in the theme's colour, no address", () => {
    const html = panelHtml({
      cspSource: SOURCE,
      nonce: newNonce(),
      scriptUri: `${SOURCE}/media/panel.js`,
      styleUri: `${SOURCE}/media/panel.css`,
    });
    const block = /<div id="icons" hidden>([\s\S]*?)<\/div>/.exec(html);
    assert.ok(block !== null);
    const names = [...(block[1] ?? "").matchAll(/<svg data-icon="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ["send", "stop", "new", "history", "back", "delete"]);
    assert.deepEqual(Object.keys(ICONS), names);
    for (const pathData of Object.values(ICONS)) {
      assert.match(pathData, /^[MmLlHhVvZzAaCc0-9 .,-]+$/);
    }
    assert.equal(/https?:|xlink|<use|<image|<foreignObject/i.test(html), false);
    assert.equal(
      [...(block[1] ?? "").matchAll(/<path fill="currentColor" fill-rule="evenodd" d="/g)].length,
      names.length,
    );
  });

  it("uses a fresh nonce for every page and escapes what it is given", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => newNonce()));
    assert.equal(nonces.size, 50);
    for (const nonce of nonces) {
      assert.match(nonce, /^[A-Za-z0-9]{24}$/);
    }
    const html = panelHtml({
      cspSource: SOURCE,
      nonce: "n",
      scriptUri: '"><script>alert(1)</script>',
      styleUri: "x",
    });
    assert.equal(html.includes("<script>alert"), false);
  });

  it("is used by the adapter, which keeps no webview alive while hidden", () => {
    const adapter = readText("src/panel.ts");
    assert.match(adapter, /panelHtml\(/);
    assert.match(adapter, /newNonce\(\)/);
    assert.match(adapter, /localResourceRoots: \[media\]/);
    assert.equal(/retainContextWhenHidden/.test(adapter), false);
  });
});

describe("language guard of the panel's folders", () => {
  it("finds no French diacritics and no other non-ASCII character in media/ and the icon", () => {
    for (const file of [...listFiles("media", [".js", ".css"]), "images/panel.svg"]) {
      const text = readText(file);
      assert.equal(DIACRITICS.test(text), false, file);
      // eslint-disable-next-line no-control-regex
      assert.equal(/[^\x00-\x7f]/.test(text), false, file);
    }
  });
});

describe("the one module that writes files", () => {
  it("is src/store.ts, and it writes only below the folder it is given", () => {
    const writing =
      /\bfs\.open\s*\(|\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|copyFile|rename|unlink|rmSync|rmdir)\s*\(/;
    const writers = listFiles("src", [".ts"]).filter((file) => writing.test(readText(file)));
    assert.deepEqual(writers, ["src/store.ts"]);
    const store = readText("src/store.ts");
    // Each write names a path built from the store's own root.
    for (const match of store.matchAll(/fs\.(mkdir|open|rename|unlink)\(([^,)]*)/g)) {
      assert.match(match[2] ?? "", /^(this\.root|temporary|file)$/, match[0]);
    }
    assert.match(store, /const temporary = path\.join\(this\.root, /);
    assert.match(store, /return path\.join\(this\.root, `\$\{id\}\.json`\);/);
  });

  it("is given the extension's private storage for the workspace, never the workspace", () => {
    const adapter = readText("src/panel.ts");
    assert.match(
      adapter,
      /context\.storageUri\?\.fsPath \?\? path\.join\(context\.globalStorageUri\.fsPath, "no-folder"\)/,
    );
    assert.equal(/workspaceFolders|rootPath|workspace\.fs/.test(adapter), false);
  });
});

describe("the panel's modules", () => {
  for (const module of ["protocol", "render", "conversation", "history", "session", "chat"]) {
    it(`${module}.ts imports only relative modules`, () => {
      const text = readText(`src/${module}.ts`);
      const specifiers = [...text.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        assert.ok(specifier?.startsWith("./"), `${module}.ts imports "${specifier}"`);
      }
    });
  }

  it("chat.ts does not build on the frozen provider of the editor's chat", () => {
    const text = readText("src/chat.ts");
    for (const frozen of ["./provider", "./convert", "./tokens"]) {
      assert.equal(text.includes(`"${frozen}"`), false, frozen);
    }
  });

  it("only the adapters import the editor", () => {
    const editor = listFiles("src", [".ts"]).filter((file) =>
      /from\s+["']vscode["']/.test(readText(file)),
    );
    assert.deepEqual(editor, ["src/extension.ts", "src/panel.ts"]);
  });
});

describe("the manifest's chat panel", () => {
  interface Manifest {
    activationEvents: string[];
    files: string[];
    contributes: {
      viewsContainers?: Record<string, { id: string; title: string; icon: string }[]>;
      views?: Record<string, { type: string; id: string; name: string }[]>;
      [other: string]: unknown;
    };
  }
  const manifest = readJson<Manifest>("package.json");

  it("puts one container in the right side bar, with a monochrome icon", () => {
    assert.deepEqual(manifest.contributes.viewsContainers, {
      secondarySidebar: [
        { id: "assistantCabinetCoder", title: "Assistant Cabinet Coder", icon: "images/panel.svg" },
      ],
    });
    assert.ok(existsSync(path.join(ROOT, "images", "panel.svg")));
    const svg = readText("images/panel.svg");
    assert.match(svg, /^<svg /);
    assert.match(svg, /stroke="currentColor"/);
    assert.equal(/#[0-9a-f]{3,6}\b|<script|href=/i.test(svg), false);
  });

  it("declares the webview view Chat in that container", () => {
    assert.deepEqual(manifest.contributes.views, {
      assistantCabinetCoder: [{ type: "webview", id: "assistantCabinetCoder.chat", name: "Chat" }],
    });
    assert.match(readText("src/panel.ts"), /export const VIEW_ID = "assistantCabinetCoder\.chat";/);
  });

  it("packages the webview files and the icon", () => {
    assert.ok(manifest.files.includes("media/**"));
    assert.ok(manifest.files.includes("images/panel.svg"));
  });

  it("still has no tool or agent contribution, and no new activation event", () => {
    assert.equal("languageModelTools" in manifest.contributes, false);
    assert.equal("chatAgents" in manifest.contributes, false);
    assert.deepEqual(manifest.activationEvents, ["onStartupFinished"]);
  });

  it("is described in the README", () => {
    const readme = readText("README.md");
    assert.match(readme, /## The chat panel/);
    assert.match(readme, /Assistant Cabinet Coder/);
    assert.match(readme, /secondary side bar|right side bar/i);
  });
});

describe("the log's fields for the panel", () => {
  const NOW = new Date("2026-11-23T10:00:00.000Z");

  it("writes the time to the first event, the dropped count and a disk error code", () => {
    assert.equal(
      formatCallLine(
        { call: "chat", status: 200, durationMs: 900, alias: "m", promptTokens: 30, firstMs: 120 },
        NOW,
      ),
      "2026-11-23T10:00:00.000Z call=chat status=200 ms=900 alias=m prompt_tokens=30 first_ms=120",
    );
    assert.equal(
      formatCallLine({ call: "webview", durationMs: 0, dropped: 1 }, NOW),
      "2026-11-23T10:00:00.000Z call=webview ms=0 dropped=1",
    );
    assert.equal(
      formatCallLine({ call: "store", durationMs: 3, detail: "ENOSPC" }, NOW),
      "2026-11-23T10:00:00.000Z call=store ms=3 detail=ENOSPC",
    );
  });

  it("drops a detail or a count that could carry text", () => {
    const line = formatCallLine(
      {
        call: "store",
        durationMs: 1,
        detail: "/Users/someone/SECRET path",
        dropped: -1,
        firstMs: 1.5,
      },
      NOW,
    );
    assert.equal(line, "2026-11-23T10:00:00.000Z call=store ms=1");
  });
});
