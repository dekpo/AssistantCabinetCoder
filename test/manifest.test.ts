import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readJson, readText } from "./support/repo";

interface Manifest {
  name: string;
  displayName: string;
  publisher: string;
  version: string;
  main: string;
  engines: { vscode: string; node: string };
  categories: string[];
  extensionKind: string[];
  activationEvents: string[];
  capabilities: { untrustedWorkspaces: { supported: string; description: string } };
  contributes: {
    commands: { command: string; title: string; category: string }[];
    configuration: {
      properties: Record<string, { type: string; default: unknown; scope: string }>;
    };
    [other: string]: unknown;
  };
  dependencies?: unknown;
  devDependencies: Record<string, string>;
}

const manifest = readJson<Manifest>("package.json");

describe("manifest", () => {
  it("uses the identifiers of the table in AGENTS.md", () => {
    assert.equal(manifest.name, "assistant-cabinet-coder");
    assert.equal(manifest.displayName, "Assistant Cabinet Coder");
    assert.equal(manifest.publisher, "assistantcabinet");
    assert.equal(manifest.version, "0.1.0");
    assert.equal(manifest.main, "./out/src/extension.js");
    assert.deepEqual(manifest.categories, ["AI", "Chat"]);
  });

  it("keeps the engine of decision D-007 and the UI side", () => {
    assert.equal(manifest.engines.vscode, "^1.140.0");
    assert.deepEqual(manifest.extensionKind, ["ui"]);
  });

  it("declares exactly the six commands, in the right category", () => {
    const ids = manifest.contributes.commands.map((command) => command.command).sort();
    assert.deepEqual(
      ids,
      [
        "assistantCabinetCoder.clearKey",
        "assistantCabinetCoder.manage",
        "assistantCabinetCoder.selectCaFile",
        "assistantCabinetCoder.setKey",
        "assistantCabinetCoder.showOutput",
        "assistantCabinetCoder.testConnection",
      ].sort(),
    );
    for (const command of manifest.contributes.commands) {
      assert.equal(command.category, "Assistant Cabinet Coder");
      assert.ok(command.title.length > 0);
    }
  });

  it("declares exactly the four settings, every one machine-scoped", () => {
    const properties = manifest.contributes.configuration.properties;
    assert.deepEqual(Object.keys(properties).sort(), [
      "assistantCabinetCoder.autoDiscover",
      "assistantCabinetCoder.caFile",
      "assistantCabinetCoder.requestTimeoutSeconds",
      "assistantCabinetCoder.serverUrl",
    ]);
    for (const [key, setting] of Object.entries(properties)) {
      assert.equal(setting.scope, "machine", key);
    }
    assert.equal(properties["assistantCabinetCoder.serverUrl"]?.default, "");
    assert.equal(properties["assistantCabinetCoder.caFile"]?.default, "");
    assert.equal(properties["assistantCabinetCoder.autoDiscover"]?.default, true);
    assert.equal(properties["assistantCabinetCoder.requestTimeoutSeconds"]?.default, 900);
  });

  it("never activates on everything, and has no provider contribution yet", () => {
    assert.ok(manifest.activationEvents.length > 0);
    for (const event of manifest.activationEvents) {
      assert.notEqual(event, "*");
      assert.ok(!event.startsWith("onStartupFinished") || event === "onStartupFinished");
    }
    assert.equal("languageModelChatProviders" in manifest.contributes, false);
    assert.equal("languageModelTools" in manifest.contributes, false);
    assert.equal("chatAgents" in manifest.contributes, false);
  });

  it("supports restricted workspaces in a limited way, with a reason", () => {
    assert.equal(manifest.capabilities.untrustedWorkspaces.supported, "limited");
    assert.ok(manifest.capabilities.untrustedWorkspaces.description.length > 20);
  });

  it("has no runtime dependency and pins every development dependency exactly", () => {
    assert.equal(manifest.dependencies, undefined);
    for (const [name, version] of Object.entries(manifest.devDependencies)) {
      assert.match(version, /^\d+\.\d+\.\d+$/, name);
    }
    assert.match(readText(".npmrc"), /^ignore-scripts=true$/m);
  });
});
