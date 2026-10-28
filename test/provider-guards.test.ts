import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { ROOT, listFiles, readJson, readText } from "./support/repo";

interface Manifest {
  version: string;
  activationEvents: string[];
  scripts: Record<string, string>;
  contributes: {
    languageModelChatProviders?: {
      vendor: string;
      displayName: string;
      managementCommand: string;
    }[];
    commands: { command: string }[];
    [other: string]: unknown;
  };
}

const manifest = readJson<Manifest>("package.json");

describe("the provider contribution", () => {
  it("declares one provider with the vendor, the display name and the management command", () => {
    assert.deepEqual(manifest.contributes.languageModelChatProviders, [
      {
        vendor: "assistantcabinetcoder",
        displayName: "Assistant Cabinet Coder",
        managementCommand: "assistantCabinetCoder.manage",
      },
    ]);
    const commands = manifest.contributes.commands.map((entry) => entry.command);
    assert.ok(commands.includes("assistantCabinetCoder.manage"));
  });

  it("registers the provider under the vendor of the manifest", () => {
    assert.match(readText("src/extension.ts"), /const VENDOR = "assistantcabinetcoder";/);
    assert.match(readText("src/extension.ts"), /registerLanguageModelChatProvider\(VENDOR,/);
  });

  it("adds no explicit activation event: the editor derives the provider's own", () => {
    assert.deepEqual(manifest.activationEvents, ["onStartupFinished"]);
  });

  it("has no tool or agent contribution yet", () => {
    assert.equal("languageModelTools" in manifest.contributes, false);
    assert.equal("chatAgents" in manifest.contributes, false);
  });

  it("is version 0.2.0 and the README names the package file of that version", () => {
    assert.equal(manifest.version, "0.2.0");
    assert.ok(readText("README.md").includes(`assistant-cabinet-coder-${manifest.version}.vsix`));
  });
});

describe("the modules that need no editor", () => {
  for (const module of ["convert", "provider", "tokens"]) {
    it(`${module}.ts imports only relative modules`, () => {
      const text = readText(`src/${module}.ts`);
      const specifiers = [...text.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        assert.ok(specifier?.startsWith("./"), `${module}.ts imports "${specifier}"`);
      }
      assert.equal(/\brequire\(|\bimport\(/.test(text), false);
    });
  }
});

describe("the removed probe", () => {
  // Spelled in two pieces so that this file does not contain the word it looks for.
  const WORD = new RegExp("sp" + "ike");

  it("is gone, with its scripts, outside the frozen records", () => {
    assert.equal(existsSync(path.join(ROOT, "sp" + "ike")), false);
    assert.deepEqual(
      Object.keys(manifest.scripts).filter(
        (name) => WORD.test(name) || WORD.test(manifest.scripts[name] ?? ""),
      ),
      [],
    );
    const checked = [
      ...listFiles("src", [".ts"]),
      ...listFiles("test", [".ts", ".json", ".md"]),
      "README.md",
      "AGENTS.md",
      "package.json",
      "eslint.config.mjs",
      ".prettierignore",
      "docs/ARCHITECTURE.md",
      "docs/HUMAN-TESTS-PROTOCOL.md",
      "docs/human-tests/X1b-chat.md",
    ];
    const offenders = checked.filter(
      (file) => existsSync(path.join(ROOT, file)) && WORD.test(readText(file)),
    );
    assert.deepEqual(offenders, []);
  });
});
