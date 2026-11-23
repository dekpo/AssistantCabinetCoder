import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { ModelInfo } from "../src/client";
import { ChatProvider, FALLBACK_OUTPUT, FALLBACK_WINDOW, toModelEntry } from "../src/provider";
import { DEFAULT_RATIO } from "../src/tokens";
import { closeAgents } from "../src/transport";
import { FakeHost } from "./support/fake-host";
import { opening } from "./support/editor";
import { startStub } from "./stub-gateway/stub";

after(() => closeAgents());

/** Decision D-023: VS Code 1.147.0 refused Agent mode with 24576 input tokens and started with 28672. */
const MEASURED_REFUSED = 24576;
const MEASURED_ACCEPTED = 28672;

function entry(contextWindow: number | undefined, maxOutputTokens: number | undefined) {
  const model: ModelInfo = { id: "m", contextWindow, maxOutputTokens, tools: true, vision: false };
  return toModelEntry(model);
}

describe("the input budget (decision D-023)", () => {
  it("gives a 32768-token model with a 16384 ceiling 28672 input tokens and keeps the ceiling", () => {
    const model = entry(32768, 16384);
    assert.equal(model.maxInputTokens, 28672);
    assert.equal(model.maxOutputTokens, 16384);
    assert.ok(model.maxInputTokens > MEASURED_REFUSED);
    assert.ok(model.maxInputTokens >= MEASURED_ACCEPTED);
  });

  it("keeps an eighth of the window whatever the ceiling, when the ceiling is larger", () => {
    assert.equal(entry(32768, 8192).maxInputTokens, 32768 - 4096);
    assert.equal(entry(65536, 16384).maxInputTokens, 65536 - 8192);
  });

  it("keeps the old value for a 131072-token window, where the eighth reaches the ceiling", () => {
    assert.equal(entry(131072, 16384).maxInputTokens, 131072 - 16384);
    assert.equal(entry(262144, 16384).maxInputTokens, 262144 - 16384);
  });

  it("keeps the old value for the fallback window, where the minimum of 2048 applies", () => {
    const model = entry(undefined, undefined);
    assert.equal(model.maxInputTokens, FALLBACK_WINDOW - FALLBACK_OUTPUT);
    assert.equal(model.maxInputTokens, 6144);
    assert.equal(model.maxOutputTokens, FALLBACK_OUTPUT);
  });

  it("never keeps more than the ceiling, and never reports less than one token, for a tiny window", () => {
    assert.equal(entry(4096, 2048).maxInputTokens, 2048);
    assert.equal(entry(2048, 1024).maxInputTokens, 1024);
    assert.equal(entry(1000, 500).maxInputTokens, 500);
    assert.equal(entry(1000, 2000).maxInputTokens, 1);
    assert.equal(entry(1, 1).maxInputTokens, 1);
  });

  it("reports the stub's cabinet-small with the new budget", async () => {
    const stub = await startStub({ mode: "small-model" });
    try {
      const models = await new ChatProvider(new FakeHost(stub.url)).information(true);
      const small = models.find((model) => model.id === "cabinet-small");
      assert.equal(small?.maxInputTokens, 28672);
      assert.equal(small?.maxOutputTokens, 16384);
      assert.deepEqual(small?.capabilities, { toolCalling: true, imageInput: false });
    } finally {
      await stub.close();
    }
  });
});

describe("the token estimate is unchanged by decision D-023", () => {
  it("starts at the same ratio before calibration and moves after it", async () => {
    const stub = await startStub({ mode: "small-model" });
    try {
      const provider = new ChatProvider(new FakeHost(stub.url));
      const long = "word ".repeat(2000);
      const before = provider.countTokens("cabinet-small", long);
      assert.equal(DEFAULT_RATIO, 3.0);
      assert.equal(before, Math.ceil(long.length / DEFAULT_RATIO));
      for (let index = 0; index < 8; index += 1) {
        await provider.chat(
          {
            model: { id: "cabinet-small", imageInput: false },
            messages: opening(long),
            toolMode: "auto",
          },
          () => undefined,
          new AbortController().signal,
        );
      }
      const calibrated = provider.countTokens("cabinet-small", long);
      assert.ok(calibrated < before, `${calibrated} should be below ${before}`);
    } finally {
      await stub.close();
    }
  });
});
