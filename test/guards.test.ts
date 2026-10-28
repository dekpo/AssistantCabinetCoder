/**
 * Guard tests: rules of AGENTS.md and docs/VIBE-CODING-PRACTICES.md made executable.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { checkConnection, failureFromResponse, getModels, type ClientOptions } from "../src/client";
import { CabinetError } from "../src/codes";
import { formatCallLine, type CallRecord } from "../src/log";
import { formatReport } from "../src/messages";
import { parseSse } from "../src/sse";
import { closeAgents, loadCaFile, open } from "../src/transport";
import { startStub } from "./stub-gateway/stub";
import { createAuthority, issueServerCertificate, privateKeyPem } from "./support/pki";
import { ROOT, listFiles, readJson, readText } from "./support/repo";

after(() => closeAgents());

const SOURCES = listFiles("src", [".ts"]);

describe("language guard", () => {
  const FIXTURE = "test/fixtures/language-sample.txt";
  // Accented Latin letters, without the multiplication and division signs.
  const DIACRITICS = /[\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u017f]/;

  function guardedFiles(): string[] {
    return [
      ...listFiles("src", [".ts"]),
      ...listFiles("test", [".ts", ".md", ".json", ".txt"]).filter((file) => file !== FIXTURE),
      ...listFiles("docs", [".md"]).filter((file) => !file.startsWith("docs/SESSION/")),
      "README.md",
      "AGENTS.md",
      "package.json",
    ];
  }

  it("detects French in the named fixture", () => {
    assert.match(readText(FIXTURE), DIACRITICS);
  });

  it("finds no French diacritics in sources, tests and documents outside the fixture", () => {
    const offenders = guardedFiles().filter((file) => DIACRITICS.test(readText(file)));
    assert.deepEqual(offenders, []);
  });
});

describe("no-network and no-risk guard", () => {
  const ALLOWED_NODE_MODULES = new Set([
    "node:crypto",
    "node:fs",
    "node:http",
    "node:https",
    "node:path",
    "node:string_decoder",
  ]);
  const DOCUMENTATION_LINK = "https://github.com/dekpo/AssistantCabinetCoder";

  function importsOf(text: string): string[] {
    const found = [...text.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
    found.push(
      ...[...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? ""),
    );
    found.push(...[...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? ""));
    return found;
  }

  it("imports only relative modules, the editor API and allowed node: built-ins", () => {
    for (const file of SOURCES) {
      for (const specifier of importsOf(readText(file))) {
        const allowed =
          specifier.startsWith("./") ||
          specifier === "vscode" ||
          ALLOWED_NODE_MODULES.has(specifier);
        assert.ok(allowed, `${file} imports "${specifier}"`);
      }
    }
  });

  it("has no URL literal in the sources other than documentation links in messages.ts", () => {
    for (const file of SOURCES) {
      const links = readText(file).match(/https?:\/\/[^\s"'`)\]]+/g) ?? [];
      for (const link of links) {
        assert.ok(
          file === "src/messages.ts" && link.startsWith(DOCUMENTATION_LINK),
          `${file} contains the URL literal ${link}`,
        );
      }
    }
  });

  it("uses none of the risky or content-writing constructs", () => {
    const forbidden: [string, RegExp][] = [
      ["child process", /child_process/],
      ["eval", /\beval\s*\(/],
      ["new Function", /\bnew\s+Function\b/],
      ["vm module", /\bnode:vm\b|from\s+["']vm["']/],
      ["fetch", /\bfetch\s*\(/],
      ["browser network", /XMLHttpRequest|WebSocket|EventSource/],
      ["disabled certificate check", /rejectUnauthorized/],
      ["console output", /\bconsole\./],
      ["environment dump", /JSON\.stringify\(\s*process\.env/],
      [
        "file or folder writing",
        /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|copyFile|rename|unlink|rmSync|rmdir)\s*\(/,
      ],
    ];
    for (const file of SOURCES) {
      const text = readText(file);
      for (const [label, pattern] of forbidden) {
        assert.equal(pattern.test(text), false, `${file}: ${label}`);
      }
    }
  });

  it("changes no setting that is not its own", () => {
    for (const file of SOURCES) {
      for (const match of readText(file).matchAll(/getConfiguration\(([^)]*)\)/g)) {
        assert.match(match[1] ?? "", /PREFIX|assistantCabinetCoder/, `${file}: ${match[0]}`);
      }
    }
  });
});

describe("no-leak guard", () => {
  const unique = (label: string): string => `SECRET-${label}-${randomHex()}`;
  function randomHex(): string {
    return Math.random().toString(16).slice(2, 12) + Date.now().toString(16);
  }

  it("keeps the key, bodies, file names and payloads out of errors, log lines and reports", async () => {
    const key = unique("KEY");
    const folder = await mkdtemp(path.join(os.tmpdir(), "acc-leak-"));
    const secrets = {
      key,
      message: unique("MESSAGE"),
      toolArgument: unique("TOOLARG"),
      toolResult: unique("TOOLRESULT"),
      image: unique("IMAGE"),
      fileName: unique("FILENAME"),
      envelopeText: "stub secret message",
    };
    const seen: string[] = [];
    const lines: string[] = [];
    const remember = (error: unknown): void => {
      assert.ok(error instanceof CabinetError);
      seen.push(error.message, String(error), error.stack ?? "", JSON.stringify(error));
    };
    const hook: ClientOptions["onCall"] = (summary) =>
      lines.push(
        formatCallLine({ ...summary } as CallRecord, new Date("2026-10-27T10:00:00.000Z")),
      );
    const requestBody = JSON.stringify({
      model: "cabinet-code",
      stream: true,
      stub_scenario: "error",
      messages: [
        { role: "user", content: secrets.message },
        { role: "tool", content: secrets.toolResult },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${secrets.image}` } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: { name: secrets.fileName, parameters: secrets.toolArgument },
        },
      ],
    });

    try {
      const stubs = [
        await startStub({ requireKey: unique("OTHER") }),
        await startStub({ mode: "off" }),
        await startStub({ mode: "version-mismatch" }),
        await startStub({ mode: "key-needed" }),
        await startStub({ mode: "oversize" }),
        await startStub({ mode: "redirect" }),
      ];
      for (const stub of stubs) {
        const options: ClientOptions = {
          baseUrl: stub.url,
          apiKey: key,
          timeoutSeconds: 5,
          maxBodyBytes: 200_000,
          onCall: hook,
        };
        const report = await checkConnection(options);
        const text = formatReport(report, stub.url);
        seen.push(text.headline, text.detail);
        await getModels(options).catch(remember);
      }
      // A stream with an error event, and an HTTP error, both answering a request full of secrets.
      const stream = await open(
        { baseUrl: stubs[0]?.url ?? "", apiKey: key, timeoutSeconds: 5 },
        { method: "POST", path: "/ide/v1/chat/completions", body: requestBody },
      );
      seen.push(String(stream.status));
      const failure = failureFromResponse(stream.status, await stream.text(), "ide");
      remember(failure);
      const wrongKeyStub = await startStub();
      const reply = await open(
        { baseUrl: wrongKeyStub.url, apiKey: key, timeoutSeconds: 5 },
        { method: "POST", path: "/ide/v1/chat/completions", body: requestBody },
      );
      for await (const event of parseSse(reply.chunks())) {
        seen.push(JSON.stringify(event));
      }
      await wrongKeyStub.close();
      for (const stub of stubs) {
        await stub.close();
      }

      // An unreachable server, a certificate that is not trusted, and files with secret names.
      await getModels({
        baseUrl: stubs[0]?.url ?? "",
        apiKey: key,
        timeoutSeconds: 2,
        onCall: hook,
      }).catch(remember);
      const authority = createAuthority();
      const server = issueServerCertificate(authority, { dns: ["localhost"], ips: ["127.0.0.1"] });
      const secure = await startStub({ tls: { key: server.keyPem, cert: server.certPem } });
      await getModels({ baseUrl: secure.url, apiKey: key, timeoutSeconds: 5, onCall: hook }).catch(
        remember,
      );
      await secure.close();
      const named = path.join(folder, `${secrets.fileName}.pem`);
      await loadCaFile(named).catch(remember);
      await writeFile(named, authority.certPem + privateKeyPem(authority));
      await loadCaFile(named).catch(remember);
      await writeFile(named, "not a certificate");
      await loadCaFile(named).catch(remember);
    } finally {
      closeAgents();
      await rm(folder, { recursive: true, force: true });
    }

    const everything = [...seen, ...lines].join("\n");
    assert.ok(lines.length > 0, "calls were logged");
    for (const [label, secret] of Object.entries(secrets)) {
      assert.equal(everything.includes(secret), false, `${label} leaked`);
    }
  });
});

describe("drift guard", () => {
  const readme = readText("README.md");
  const manifest = readJson<{
    contributes: {
      commands: { command: string; title: string }[];
      configuration: { properties: Record<string, unknown> };
    };
  }>("package.json");

  it("has every command of package.json in the README", () => {
    for (const { command, title } of manifest.contributes.commands) {
      assert.ok(readme.includes(command), `README misses ${command}`);
      assert.ok(readme.includes(title), `README misses the title "${title}"`);
    }
  });

  it("has every setting of package.json in the README", () => {
    for (const key of Object.keys(manifest.contributes.configuration.properties)) {
      assert.ok(readme.includes(key), `README misses ${key}`);
    }
  });

  it("says in the README that remote windows and macOS are untested", () => {
    assert.match(readme, /remote windows/i);
    assert.match(readme, /macOS[^\n]*untested|untested[^\n]*macOS/i);
  });
});

describe("contract guard", () => {
  it("is byte-identical to the server's copy when both are present", (context) => {
    const server = path.resolve(ROOT, "..", "AssistantCabinetServer", "docs", "IDE-CONTRACT.md");
    if (!existsSync(server)) {
      context.skip("the server repository is not next to this one");
      return;
    }
    assert.ok(
      readFileSync(server).equals(readFileSync(path.join(ROOT, "docs", "IDE-CONTRACT.md"))),
    );
  });
});
