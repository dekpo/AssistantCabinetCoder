/**
 * The token estimate behind `provideTokenCount`, and its calibration. Pure: it imports nothing from
 * the editor and never touches the network. The editor prunes the conversation with this number, so
 * the estimate errs high: a ratio of characters per token that starts low (3.0) and is corrected,
 * per model, from the `prompt_tokens` the server reports for a request whose size is known.
 */

export const DEFAULT_RATIO = 3.0;
export const MIN_RATIO = 2.0;
export const MAX_RATIO = 6.0;
/** What one image costs in the estimate, whatever its size. */
export const IMAGE_TOKEN_ESTIMATE = 1024;
/** Weight of a new observation in the moving average. */
export const SMOOTHING = 0.3;
/** Models whose ratio is kept at once; the least recently updated is forgotten first. */
export const MAX_TRACKED_MODELS = 32;

/** The size of a text or a message, in the two units the estimate needs. */
export interface Measure {
  characters: number;
  images: number;
}

type Loose = Record<string, unknown>;

function isObject(part: unknown): part is Loose {
  return typeof part === "object" && part !== null;
}

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Characters of the text parts, tool-call names and arguments, and tool-result text; images counted. */
export function measureParts(parts: readonly unknown[]): Measure {
  const total: Measure = { characters: 0, images: 0 };
  for (const part of parts) {
    if (!isObject(part)) {
      continue;
    }
    if (typeof part["callId"] === "string" && Array.isArray(part["content"])) {
      const inner = measureParts(part["content"]);
      total.characters += inner.characters;
      total.images += inner.images;
    } else if (typeof part["callId"] === "string" && "input" in part) {
      total.characters +=
        (typeof part["name"] === "string" ? part["name"].length : 0) + jsonLength(part["input"]);
    } else if (typeof part["mimeType"] === "string" && ArrayBuffer.isView(part["data"])) {
      if (part["mimeType"].startsWith("image/")) {
        total.images += 1;
      }
    } else if (typeof part["value"] === "string") {
      total.characters += part["value"].length;
    }
  }
  return total;
}

/** The size of what `provideTokenCount` is given: a string or a message. */
export function measureInput(input: string | { readonly content: readonly unknown[] }): Measure {
  return typeof input === "string"
    ? { characters: input.length, images: 0 }
    : measureParts(input.content);
}

export function measureMessages(
  messages: readonly { readonly content: readonly unknown[] }[],
): Measure {
  const total: Measure = { characters: 0, images: 0 };
  for (const message of messages) {
    const one = measureParts(message.content);
    total.characters += one.characters;
    total.images += one.images;
  }
  return total;
}

export function estimateTokens(measure: Measure, ratio: number = DEFAULT_RATIO): number {
  return Math.ceil(measure.characters / ratio) + measure.images * IMAGE_TOKEN_ESTIMATE;
}

function clampRatio(ratio: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/**
 * The new ratio after one observation: the characters of a request against the prompt tokens the
 * server counted for it (what the images cost in the estimate is taken off first). A request that
 * tells nothing (no characters, no tokens left for them) leaves the ratio as it was.
 */
export function observeRatio(previous: number, measure: Measure, promptTokens: number): number {
  const textTokens = promptTokens - measure.images * IMAGE_TOKEN_ESTIMATE;
  if (measure.characters <= 0 || !Number.isFinite(textTokens) || textTokens < 1) {
    return previous;
  }
  const observed = clampRatio(measure.characters / textTokens);
  return clampRatio((1 - SMOOTHING) * previous + SMOOTHING * observed);
}

/** One ratio per model alias, bounded. */
export class RatioTable {
  private readonly ratios = new Map<string, number>();

  ratio(model: string): number {
    return this.ratios.get(model) ?? DEFAULT_RATIO;
  }

  observe(model: string, measure: Measure, promptTokens: number): void {
    const next = observeRatio(this.ratio(model), measure, promptTokens);
    this.ratios.delete(model);
    this.ratios.set(model, next);
    while (this.ratios.size > MAX_TRACKED_MODELS) {
      const oldest = this.ratios.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.ratios.delete(oldest.value);
    }
  }

  get size(): number {
    return this.ratios.size;
  }

  estimate(model: string, measure: Measure): number {
    return estimateTokens(measure, this.ratio(model));
  }
}
