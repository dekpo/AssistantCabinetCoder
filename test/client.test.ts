import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  checkConnection,
  failureFromResponse,
  getHealth,
  getModels,
  parseModels,
  stateFromCode,
  type CallSummary,
  type ClientOptions,
} from "../src/client";
import { CONTRACT_ERROR_CODES, CabinetError, codeFromEnvelope } from "../src/codes";
import { closeAgents } from "../src/transport";
import { startStub, type StubMode } from "./stub-gateway/stub";

after(() => closeAgents());

function options(url: string, extra: Partial<ClientOptions> = {}): ClientOptions {
  return { baseUrl: url, timeoutSeconds: 5, ...extra };
}

async function codeOfRejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof CabinetError, "a CabinetError is thrown");
    return error.code;
  }
  return "no error";
}

describe("failureFromResponse", () => {
  it("maps 404 on the editor surface to ide_surface_off, and elsewhere to unexpected_response", () => {
    assert.equal(failureFromResponse(404, '{"detail":"Not Found"}', "ide").code, "ide_surface_off");
    assert.equal(failureFromResponse(404, "", "other").code, "unexpected_response");
  });

  it("maps 401 to key_needed whatever the body says", () => {
    assert.equal(failureFromResponse(401, "", "ide").code, "key_needed");
    assert.equal(
      failureFromResponse(401, '{"error":{"code":"unauthorized"}}', "other").code,
      "key_needed",
    );
  });

  it("maps every error code of the contract's envelope, with any status", () => {
    for (const code of CONTRACT_ERROR_CODES) {
      const body = JSON.stringify({ error: { code, message: "m", data: {} } });
      assert.equal(failureFromResponse(400, body, "ide").code, codeFromEnvelope(code), code);
    }
  });

  it("falls back on the status when the body is not an envelope", () => {
    assert.equal(failureFromResponse(429, "", "ide").code, "rate_limited");
    assert.equal(failureFromResponse(500, "<html>", "ide").code, "server_error");
    assert.equal(failureFromResponse(503, "{}", "ide").code, "server_error");
    assert.equal(failureFromResponse(418, "teapot", "ide").code, "unexpected_response");
    assert.equal(failureFromResponse(302, "", "ide").code, "redirect_refused");
  });

  it("never carries the body", () => {
    const error = failureFromResponse(400, '{"error":{"code":"x","message":"SECRET-BODY"}}', "ide");
    assert.equal(error.message.includes("SECRET"), false);
    assert.equal(JSON.stringify(error).includes("SECRET"), false);
  });
});

describe("parseModels", () => {
  const good = {
    object: "list",
    ide_api: 1,
    features: { agents: true, document_analysis: false, image_description: true, future: 1 },
    data: [
      {
        id: "a",
        context_window: 1000,
        max_output_tokens: 500,
        capabilities: { tools: true, vision: false },
        extra: "ignored",
      },
    ],
    extra: "ignored",
  };

  it("reads the models, the capabilities and the features", () => {
    const result = parseModels(good);
    assert.equal(result.ideApi, 1);
    assert.deepEqual(result.features, {
      agents: true,
      documentAnalysis: false,
      imageDescription: true,
    });
    assert.deepEqual(result.models, [
      { id: "a", contextWindow: 1000, maxOutputTokens: 500, tools: true, vision: false },
    ]);
  });

  it("tolerates a missing features object and missing capabilities", () => {
    const result = parseModels({ ide_api: 1, data: [{ id: "b" }] });
    assert.deepEqual(result.features, {
      agents: false,
      documentAnalysis: false,
      imageDescription: false,
    });
    assert.deepEqual(result.models, [
      {
        id: "b",
        contextWindow: undefined,
        maxOutputTokens: undefined,
        tools: false,
        vision: false,
      },
    ]);
  });

  it("refuses an ide_api other than 1 with ide_api_mismatch", () => {
    for (const body of [
      { ide_api: 2, data: [] },
      { ide_api: "1", data: [] },
      { data: [] },
      [],
      null,
    ]) {
      assert.throws(() => parseModels(body), { code: "ide_api_mismatch" });
    }
  });

  it("refuses a body without a model list, and skips malformed entries", () => {
    assert.throws(() => parseModels({ ide_api: 1 }), { code: "bad_response" });
    const result = parseModels({ ide_api: 1, data: [null, 3, { id: "" }, { id: "ok" }] });
    assert.deepEqual(
      result.models.map((model) => model.id),
      ["ok"],
    );
  });
});

describe("stateFromCode", () => {
  it("names the status-bar state of each outcome", () => {
    assert.equal(stateFromCode(undefined), "connected");
    assert.equal(stateFromCode("ide_surface_off"), "off");
    assert.equal(stateFromCode("key_needed"), "key_needed");
    assert.equal(stateFromCode("unreachable"), "unreachable");
    assert.equal(stateFromCode("timeout"), "unreachable");
    assert.equal(stateFromCode("certificate_untrusted"), "certificate");
    assert.equal(stateFromCode("ide_api_mismatch"), "version");
    assert.equal(stateFromCode("bad_response"), "error");
  });
});

describe("calls against the stub gateway", () => {
  it("reads the health answer and the three models", async () => {
    const stub = await startStub();
    try {
      await getHealth(options(stub.url));
      const result = await getModels(options(stub.url));
      assert.deepEqual(
        result.models.map((model) => [model.id, model.tools, model.vision]),
        [
          ["cabinet-chat", true, false],
          ["cabinet-code", true, true],
          ["cabinet-plain", false, false],
        ],
      );
      assert.equal(result.models[1]?.contextWindow, 131072);
    } finally {
      await stub.close();
    }
  });

  it("maps each stub mode to its machine code", async () => {
    const expected: [StubMode, string][] = [
      ["version-mismatch", "ide_api_mismatch"],
      ["off", "ide_surface_off"],
      ["key-needed", "key_needed"],
      ["oversize", "response_too_large"],
      ["redirect", "redirect_refused"],
    ];
    for (const [mode, code] of expected) {
      const stub = await startStub({ mode });
      try {
        assert.equal(
          await codeOfRejection(getModels(options(stub.url, { maxBodyBytes: 1024 * 1024 }))),
          code,
          mode,
        );
      } finally {
        await stub.close();
      }
    }
  });

  it("does not follow a redirect", async () => {
    const stub = await startStub({ mode: "redirect" });
    try {
      await codeOfRejection(getModels(options(stub.url)));
      assert.deepEqual(
        stub.requests.map((request) => request.path),
        ["/ide/v1/models"],
      );
    } finally {
      await stub.close();
    }
  });

  it("sends the key only when one is set, and the stub accepts only the right one", async () => {
    const stub = await startStub({ requireKey: "KEY-123" });
    try {
      assert.equal(await codeOfRejection(getModels(options(stub.url))), "key_needed");
      assert.equal(
        await codeOfRejection(getModels(options(stub.url, { apiKey: "WRONG" }))),
        "key_needed",
      );
      await getModels(options(stub.url, { apiKey: "KEY-123" }));
      assert.deepEqual(
        stub.requests.map((request) => request.authorization),
        [undefined, "Bearer WRONG", "Bearer KEY-123"],
      );
      // /health answers without a key, and the key is sent there too when set.
      await getHealth(options(stub.url));
    } finally {
      await stub.close();
    }
  });

  it("reports an unreachable server", async () => {
    const stub = await startStub();
    const url = stub.url;
    await stub.close();
    assert.equal(await codeOfRejection(getHealth(options(url))), "unreachable");
  });

  it("builds the Test Connection report for each situation", async () => {
    const ok = await startStub();
    const off = await startStub({ mode: "off" });
    try {
      const good = await checkConnection(options(ok.url));
      assert.equal(good.healthy, true);
      assert.equal(good.models?.models.length, 3);
      assert.equal(good.failure, undefined);

      const surfaceOff = await checkConnection(options(off.url));
      assert.equal(surfaceOff.healthy, true);
      assert.deepEqual(surfaceOff.failure, { call: "models", code: "ide_surface_off" });
    } finally {
      await ok.close();
      await off.close();
    }
    const gone = await checkConnection(options(ok.url));
    assert.equal(gone.healthy, false);
    assert.equal(gone.failure?.call, "health");
    assert.equal(gone.failure?.code, "unreachable");
  });

  it("reports each call to the log hook with a status, a duration and a code", async () => {
    const stub = await startStub({ mode: "off" });
    const calls: CallSummary[] = [];
    try {
      await checkConnection(options(stub.url, { onCall: (summary) => calls.push(summary) }));
    } finally {
      await stub.close();
    }
    assert.deepEqual(
      calls.map((call) => [call.call, call.status, call.code]),
      [
        ["health", 200, undefined],
        ["models", 404, "ide_surface_off"],
      ],
    );
    assert.ok(calls.every((call) => call.durationMs >= 0));
  });
});
