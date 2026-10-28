import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_RATIO,
  IMAGE_TOKEN_ESTIMATE,
  MAX_RATIO,
  MAX_TRACKED_MODELS,
  MIN_RATIO,
  RatioTable,
  estimateTokens,
  measureInput,
  measureMessages,
  measureParts,
  observeRatio,
} from "../src/tokens";

const text = (value: string) => ({ value });
const image = (bytes = 4) => ({ mimeType: "image/png", data: new Uint8Array(bytes) });

describe("measuring", () => {
  it("counts the characters of text parts, tool calls and tool results, and the images", () => {
    const measure = measureParts([
      text("abcde"),
      { callId: "c1", name: "read_file", input: { path: "a" } },
      { callId: "c1", content: [text("123"), image(), { value: { notAString: true } }] },
      { mimeType: "application/octet-stream", data: new Uint8Array(3) },
      "stray",
      null,
    ]);
    assert.equal(measure.characters, 5 + "read_file".length + '{"path":"a"}'.length + 3);
    assert.equal(measure.images, 1);
  });

  it("measures a string, a message and a list of messages", () => {
    assert.deepEqual(measureInput("hello"), { characters: 5, images: 0 });
    assert.deepEqual(measureInput({ content: [text("hi"), image()] }), {
      characters: 2,
      images: 1,
    });
    assert.deepEqual(
      measureMessages([{ content: [text("ab")] }, { content: [text("cde"), image()] }]),
      {
        characters: 5,
        images: 1,
      },
    );
  });

  it("survives an input that cannot be turned into JSON", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const measure = measureParts([{ callId: "c", name: "x", input: circular }]);
    assert.equal(measure.characters, 1);
  });
});

describe("estimating", () => {
  it("rounds up characters over the ratio and adds a fixed amount per image", () => {
    assert.equal(estimateTokens({ characters: 10, images: 0 }), Math.ceil(10 / DEFAULT_RATIO));
    assert.equal(estimateTokens({ characters: 10, images: 0 }, 2), 5);
    assert.equal(estimateTokens({ characters: 0, images: 2 }, 4), 2 * IMAGE_TOKEN_ESTIMATE);
    assert.equal(estimateTokens({ characters: 0, images: 0 }), 0);
  });

  it("starts high: a text of English prose is estimated above what a typical tokenizer counts", () => {
    // About 4 characters per token is typical for English prose; the start ratio is lower.
    assert.ok(DEFAULT_RATIO < 4);
    assert.ok(estimateTokens({ characters: 4000, images: 0 }) > 1000);
  });
});

describe("calibration", () => {
  it("converges on the observed ratio", () => {
    const table = new RatioTable();
    assert.equal(table.ratio("m"), DEFAULT_RATIO);
    for (let index = 0; index < 40; index += 1) {
      table.observe("m", { characters: 4000, images: 0 }, 1000);
    }
    assert.ok(Math.abs(table.ratio("m") - 4) < 0.01, String(table.ratio("m")));
    const estimate = table.estimate("m", { characters: 4000, images: 0 });
    assert.ok(estimate >= 1000 && estimate <= 1001, String(estimate));
  });

  it("moves part of the way at each observation", () => {
    const next = observeRatio(3, { characters: 4000, images: 0 }, 1000);
    assert.ok(next > 3 && next < 4);
  });

  it("clamps the ratio between 2 and 6", () => {
    assert.ok(
      Math.abs(observeRatio(MIN_RATIO, { characters: 10, images: 0 }, 1000) - MIN_RATIO) < 1e-9,
    );
    let high = 3;
    for (let index = 0; index < 100; index += 1) {
      high = observeRatio(high, { characters: 1_000_000, images: 0 }, 10);
    }
    assert.ok(high <= MAX_RATIO && MAX_RATIO - high < 1e-6, String(high));
    let low = 3;
    for (let index = 0; index < 100; index += 1) {
      low = observeRatio(low, { characters: 10, images: 0 }, 100000);
    }
    assert.ok(low >= MIN_RATIO && low - MIN_RATIO < 1e-6, String(low));
  });

  it("takes the images off the prompt tokens before comparing", () => {
    const withImage = observeRatio(3, { characters: 4000, images: 1 }, 1000 + IMAGE_TOKEN_ESTIMATE);
    const without = observeRatio(3, { characters: 4000, images: 0 }, 1000);
    assert.equal(withImage, without);
  });

  it("ignores an observation that tells nothing", () => {
    assert.equal(observeRatio(3.3, { characters: 0, images: 0 }, 100), 3.3);
    assert.equal(observeRatio(3.3, { characters: 100, images: 0 }, 0), 3.3);
    assert.equal(observeRatio(3.3, { characters: 100, images: 1 }, 10), 3.3);
    assert.equal(observeRatio(3.3, { characters: 100, images: 0 }, Number.NaN), 3.3);
  });

  it("keeps one entry per model and a bounded table", () => {
    const table = new RatioTable();
    table.observe("a", { characters: 400, images: 0 }, 100);
    table.observe("a", { characters: 400, images: 0 }, 100);
    assert.equal(table.size, 1);
    assert.ok(table.ratio("a") !== table.ratio("b"));
    for (let index = 0; index < MAX_TRACKED_MODELS + 10; index += 1) {
      table.observe(`model-${index}`, { characters: 400, images: 0 }, 100);
    }
    assert.equal(table.size, MAX_TRACKED_MODELS);
    assert.equal(table.ratio("a"), DEFAULT_RATIO, "the oldest entry was forgotten");
    assert.ok(table.ratio(`model-${MAX_TRACKED_MODELS + 9}`) > DEFAULT_RATIO);
  });
});
