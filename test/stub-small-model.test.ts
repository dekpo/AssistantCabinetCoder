import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getModels, type ClientOptions } from "../src/client";
import { closeAgents, open } from "../src/transport";
import { STUB_MODELS, STUB_SMALL_MODEL, startStub } from "./stub-gateway/stub";

after(() => closeAgents());

function options(url: string): ClientOptions {
  return { baseUrl: url, timeoutSeconds: 5 };
}

describe("the stub's small-model mode", () => {
  it("lists cabinet-small after the three usual models, with the shape of a 32768-token code model", async () => {
    const stub = await startStub({ mode: "small-model" });
    try {
      const result = await getModels(options(stub.url));
      assert.deepEqual(
        result.models.map((model) => model.id),
        [...STUB_MODELS.map((model) => model.id), "cabinet-small"],
      );
      assert.deepEqual(result.models.at(-1), {
        id: "cabinet-small",
        contextWindow: 32768,
        maxOutputTokens: 16384,
        tools: true,
        vision: false,
      });
    } finally {
      await stub.close();
    }
  });

  it("leaves the default list without cabinet-small", async () => {
    const stub = await startStub();
    try {
      const result = await getModels(options(stub.url));
      assert.equal(
        result.models.some((model) => model.id === STUB_SMALL_MODEL.id),
        false,
      );
    } finally {
      await stub.close();
    }
  });

  it("answers a text request for cabinet-small and refuses an image, like a model without vision", async () => {
    const stub = await startStub({ mode: "small-model" });
    const post = (content: unknown) =>
      open(options(stub.url), {
        method: "POST",
        path: "/ide/v1/chat/completions",
        body: JSON.stringify({
          model: "cabinet-small",
          stream: true,
          messages: [{ role: "user", content }],
        }),
        accept: "text/event-stream",
      });
    try {
      const text = await post("hello");
      assert.equal(text.status, 200);
      assert.match(await text.text(), /\[DONE\]/);
      const image = await post([
        { type: "text", text: "look" },
        { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
      ]);
      assert.equal(image.status, 400);
      assert.match(await image.text(), /provider_capability_unsupported/);
    } finally {
      await stub.close();
    }
  });
});
