/**
 * The model's text as a tree of blocks for the chat panel. Pure.
 * Paragraphs, headings, lists, fenced code blocks with their language, inline code, bold and
 * italic. Links stay plain text. Every leaf is plain text: the webview builds elements with
 * `textContent`, so nothing the model writes can become markup. Each marker search runs forward
 * only, so a hostile text costs time in proportion to its length.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] };

export interface ListItem {
  /** Nesting level, 0 to `MAX_INDENT`. */
  indent: number;
  inlines: Inline[];
}

export type Block =
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "heading"; level: number; inlines: Inline[] }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { kind: "code"; language: string; text: string };

export const MAX_INDENT = 4;
const MAX_INLINE_DEPTH = 3;
const LANGUAGE_PATTERN = /^[A-Za-z0-9_+#.-]{1,32}$/;

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const LIST_ITEM = /^([ \t]*)([-*+]|(\d{1,9})[.)])[ \t]+(.*)$/;

/** A fence's language, kept only when it looks like one. */
export function cleanLanguage(raw: string): string {
  return LANGUAGE_PATTERN.test(raw) ? raw : "";
}

function indentOf(spaces: string): number {
  const width = spaces.replace(/\t/g, "    ").length;
  return Math.min(MAX_INDENT, Math.floor(width / 2));
}

/** The blocks of a text. */
export function renderBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list:
    { ordered: boolean; start: number; items: { indent: number; text: string }[] } | undefined;
  let fence: { marker: string; language: string; lines: string[] } | undefined;

  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", inlines: renderInline(paragraph.join("\n")) });
      paragraph = [];
    }
    if (list !== undefined) {
      blocks.push({
        kind: "list",
        ordered: list.ordered,
        start: list.start,
        items: list.items.map((item) => ({
          indent: item.indent,
          inlines: renderInline(item.text),
        })),
      });
      list = undefined;
    }
  };

  for (const line of lines) {
    if (fence !== undefined) {
      const closing = line.trim();
      if (
        closing.length >= fence.marker.length &&
        closing === (fence.marker[0] ?? "`").repeat(closing.length)
      ) {
        blocks.push({ kind: "code", language: fence.language, text: fence.lines.join("\n") });
        fence = undefined;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open !== null) {
      flush();
      fence = { marker: open[1] ?? "```", language: cleanLanguage(open[2] ?? ""), lines: [] };
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flush();
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length,
        inlines: renderInline(heading[2] ?? ""),
      });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item !== null) {
      const ordered = item[3] !== undefined;
      if (paragraph.length > 0 || (list !== undefined && list.ordered !== ordered)) {
        flush();
      }
      list ??= { ordered, start: ordered ? Number(item[3]) : 1, items: [] };
      list.items.push({ indent: indentOf(item[1] ?? ""), text: item[4] ?? "" });
      continue;
    }
    const last = list?.items[list.items.length - 1];
    if (last !== undefined && /^[ \t]/.test(line)) {
      last.text += " " + line.trim();
      continue;
    }
    if (list !== undefined) {
      flush();
    }
    paragraph.push(line);
  }
  if (fence !== undefined) {
    // An unclosed fence (an answer still streaming, or a model's slip) runs to the end.
    blocks.push({ kind: "code", language: fence.language, text: fence.lines.join("\n") });
  }
  flush();
  return blocks;
}

/** Markers for which a forward search already failed: searching again from later cannot succeed. */
interface Exhausted {
  markers: Set<string>;
}

/** The inline parts of one paragraph, heading or list item. */
export function renderInline(text: string): Inline[] {
  return parseInline(text, 0, { markers: new Set() });
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9]/.test(char);
}

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

function findClosing(text: string, marker: string, from: number, exhausted: Exhausted): number {
  if (exhausted.markers.has(marker)) {
    return -1;
  }
  const at = text.indexOf(marker, from);
  if (at < 0) {
    exhausted.markers.add(marker);
  }
  return at;
}

function parseInline(text: string, depth: number, exhausted: Exhausted): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  const pushText = (): void => {
    if (plain !== "") {
      out.push({ kind: "text", text: plain });
      plain = "";
    }
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "`") {
      let run = 1;
      while (text[index + run] === "`") {
        run += 1;
      }
      const marker = "`".repeat(run);
      const close = findClosing(text, marker, index + run, exhausted);
      if (close > index + run) {
        let inner = text.slice(index + run, close);
        if (inner.length > 2 && inner.startsWith(" ") && inner.endsWith(" ")) {
          inner = inner.slice(1, -1);
        }
        pushText();
        out.push({ kind: "code", text: inner });
        index = close + run;
        continue;
      }
      plain += marker;
      index += run;
      continue;
    }
    if (depth < MAX_INLINE_DEPTH && (char === "*" || char === "_")) {
      const double = text[index + 1] === char;
      const marker = double ? char + char : char;
      const after = text[index + marker.length];
      const opensWord = char === "*" || !isWordChar(text[index - 1]);
      if (opensWord && !isSpace(after) && after !== char) {
        const close = findClosing(text, marker, index + marker.length + 1, exhausted);
        if (close > 0 && (char === "*" || !isWordChar(text[close + marker.length]))) {
          const inner = text.slice(index + marker.length, close);
          pushText();
          const children = parseInline(inner, depth + 1, { markers: new Set() });
          out.push(double ? { kind: "bold", children } : { kind: "italic", children });
          index = close + marker.length;
          continue;
        }
      }
      plain += marker;
      index += marker.length;
      continue;
    }
    plain += char;
    index += 1;
  }
  pushText();
  return out;
}

/** The plain text of inline parts (for tests and titles). */
export function inlineText(inlines: readonly Inline[]): string {
  return inlines
    .map((part) =>
      part.kind === "text" || part.kind === "code" ? part.text : inlineText(part.children),
    )
    .join("");
}
