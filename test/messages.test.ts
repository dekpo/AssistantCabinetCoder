import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConnectionReport } from "../src/client";
import {
  CONTRACT_ERROR_CODES,
  EXTENSION_CODES,
  MACHINE_CODES,
  codeFromEnvelope,
} from "../src/codes";
import {
  CODE_MESSAGES,
  NO_SERVER_MESSAGES,
  STATUS_LABELS,
  describeCode,
  formatReport,
} from "../src/messages";

describe("machine codes and sentences", () => {
  it("has exactly one non-empty English sentence per machine code", () => {
    assert.deepEqual(Object.keys(CODE_MESSAGES).sort(), [...MACHINE_CODES].sort());
    for (const code of MACHINE_CODES) {
      assert.match(describeCode(code), /^[A-Z].*[.]$/s, code);
    }
  });

  it("maps every error code of the contract's envelope to a machine code", () => {
    for (const code of CONTRACT_ERROR_CODES) {
      const mapped = codeFromEnvelope(code);
      assert.ok(mapped !== undefined, code);
      assert.ok((MACHINE_CODES as readonly string[]).includes(mapped), code);
    }
    assert.equal(codeFromEnvelope("unauthorized"), "key_needed");
    assert.equal(codeFromEnvelope("rate_limited"), "rate_limited");
    assert.equal(codeFromEnvelope("something_else"), undefined);
    assert.equal(codeFromEnvelope(undefined), undefined);
  });

  it("keeps the extension codes distinct from the contract's", () => {
    for (const code of EXTENSION_CODES) {
      assert.equal((CONTRACT_ERROR_CODES as readonly string[]).includes(code), false, code);
    }
  });

  it("gives the exact administrator instruction for a server with the surface off", () => {
    assert.equal(
      describeCode("ide_surface_off"),
      "The server has not turned on the editor surface. Ask the administrator to run: cabinet-server config set IDE_ENABLED=on, then cabinet-server restart.",
    );
  });

  it("has a sentence for every reason no server was found", () => {
    for (const sentence of Object.values(NO_SERVER_MESSAGES)) {
      assert.match(sentence, /^[A-Z].*[.]$/);
    }
  });

  it("has the status labels of the specification", () => {
    assert.equal(STATUS_LABELS.connected, "Cabinet: connected");
    assert.equal(STATUS_LABELS.off, "Cabinet: off");
    assert.equal(STATUS_LABELS.key_needed, "Cabinet: key needed");
    assert.equal(STATUS_LABELS.unreachable, "Cabinet: unreachable");
  });
});

describe("formatReport", () => {
  const withModels: ConnectionReport = {
    healthy: true,
    models: {
      ideApi: 1,
      features: { agents: false, documentAnalysis: true, imageDescription: false },
      models: [
        {
          id: "cabinet-code",
          contextWindow: 131072,
          maxOutputTokens: 16384,
          tools: true,
          vision: true,
        },
        {
          id: "cabinet-plain",
          contextWindow: undefined,
          maxOutputTokens: undefined,
          tools: false,
          vision: false,
        },
      ],
    },
  };

  it("lists each model and the features, and warns about a model without tool calling", () => {
    const text = formatReport(withModels, "http://x:1");
    assert.equal(text.ok, true);
    assert.equal(text.headline, "Connected: 2 models available");
    assert.match(
      text.detail,
      /cabinet-code: window 131072 tokens, output up to 16384 tokens, tools yes, vision yes/,
    );
    assert.match(
      text.detail,
      /cabinet-plain: window unknown, output up to unknown, tools no, vision no/,
    );
    assert.match(text.detail, /Features: agents no, document analysis yes, image description no/);
    assert.match(
      text.detail,
      /cabinet-plain does not report tool calling\. VS Code 1\.143\.1 does not offer such a model in the chat picker in any mode/,
    );
    assert.equal(text.detail.includes("cabinet-code does not report"), false);
  });

  it("explains a health failure in plain words", () => {
    const text = formatReport(
      { healthy: false, failure: { call: "health", code: "unreachable", detail: "ECONNREFUSED" } },
      "http://x:1",
    );
    assert.equal(text.ok, false);
    assert.ok(text.detail.includes(CODE_MESSAGES.unreachable));
    assert.match(text.detail, /ECONNREFUSED/);
  });

  it("explains each failure of the model list", () => {
    for (const code of ["ide_surface_off", "key_needed", "ide_api_mismatch"] as const) {
      const text = formatReport({ healthy: true, failure: { call: "models", code } }, "http://x:1");
      assert.equal(text.ok, false);
      assert.match(text.detail, /Health check: the server answered\./);
      assert.ok(text.detail.includes(CODE_MESSAGES[code]));
    }
  });
});
