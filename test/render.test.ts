import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanLanguage,
  inlineText,
  renderBlocks,
  renderInline,
  type Block,
  type Inline,
} from "../src/render";
import { MARKUP_TEXT } from "./stub-gateway/stub";

/** Every string leaf of a tree, so a test can say where a piece of text ended up. */
function leaves(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(leaves);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(leaves);
  }
  return [];
}

const KINDS = new Set(["text", "code", "bold", "italic", "paragraph", "heading", "list"]);

/** Every node of the tree has one of the known kinds and only the known fields. */
function assertOnlyKnownShapes(blocks: Block[]): void {
  const visitInline = (parts: Inline[]): void => {
    for (const part of parts) {
      assert.ok(KINDS.has(part.kind), part.kind);
      if (part.kind === "bold" || part.kind === "italic") {
        assert.deepEqual(Object.keys(part).sort(), ["children", "kind"]);
        visitInline(part.children);
      } else {
        assert.deepEqual(Object.keys(part).sort(), ["kind", "text"]);
      }
    }
  };
  for (const block of blocks) {
    if (block.kind === "code") {
      assert.deepEqual(Object.keys(block).sort(), ["kind", "language", "text"]);
    } else if (block.kind === "list") {
      for (const item of block.items) {
        visitInline(item.inlines);
      }
    } else {
      visitInline(block.inlines);
    }
  }
}

describe("renderBlocks", () => {
  it("makes paragraphs, keeping single line breaks inside one", () => {
    assert.deepEqual(renderBlocks("one\ntwo\n\nthree"), [
      { kind: "paragraph", inlines: [{ kind: "text", text: "one\ntwo" }] },
      { kind: "paragraph", inlines: [{ kind: "text", text: "three" }] },
    ]);
  });

  it("makes headings of every level", () => {
    const blocks = renderBlocks("# One\n## Two ##\n###### Six");
    assert.deepEqual(
      blocks.map((block) =>
        block.kind === "heading" ? [block.level, inlineText(block.inlines)] : [],
      ),
      [
        [1, "One"],
        [2, "Two"],
        [6, "Six"],
      ],
    );
    assert.equal(renderBlocks("####### seven")[0]?.kind, "paragraph");
  });

  it("makes bulleted and numbered lists with nesting", () => {
    const blocks = renderBlocks("- a\n* b\n  - c\n    continued\n\n3. x\n4) y");
    assert.deepEqual(blocks, [
      {
        kind: "list",
        ordered: false,
        start: 1,
        items: [
          { indent: 0, inlines: [{ kind: "text", text: "a" }] },
          { indent: 0, inlines: [{ kind: "text", text: "b" }] },
          { indent: 1, inlines: [{ kind: "text", text: "c continued" }] },
        ],
      },
      {
        kind: "list",
        ordered: true,
        start: 3,
        items: [
          { indent: 0, inlines: [{ kind: "text", text: "x" }] },
          { indent: 0, inlines: [{ kind: "text", text: "y" }] },
        ],
      },
    ]);
  });

  it("makes fenced code blocks with their language, untouched inside", () => {
    const text = "before\n```python\nx = 1  # **not bold**\n\n<b>tag</b>\n```\n~~~\nplain\n~~~";
    assert.deepEqual(renderBlocks(text), [
      { kind: "paragraph", inlines: [{ kind: "text", text: "before" }] },
      { kind: "code", language: "python", text: "x = 1  # **not bold**\n\n<b>tag</b>" },
      { kind: "code", language: "", text: "plain" },
    ]);
  });

  it("runs an unclosed fence to the end, as plain text", () => {
    assert.deepEqual(renderBlocks("```js\nlet a = '<script>';\n# not a heading"), [
      { kind: "code", language: "js", text: "let a = '<script>';\n# not a heading" },
    ]);
  });

  it("keeps a fence language only when it looks like one", () => {
    assert.equal(cleanLanguage("typescript"), "typescript");
    assert.equal(cleanLanguage("c++"), "c++");
    assert.equal(cleanLanguage('x"onload="y'), "");
    assert.equal(cleanLanguage("a".repeat(33)), "");
    assert.deepEqual(renderBlocks('```"><img>\ncode\n```')[0], {
      kind: "code",
      language: "",
      text: "code",
    });
  });

  it("reads Windows and old Mac line ends", () => {
    assert.deepEqual(renderBlocks("a\r\n\r\nb\rc"), [
      { kind: "paragraph", inlines: [{ kind: "text", text: "a" }] },
      { kind: "paragraph", inlines: [{ kind: "text", text: "b\nc" }] },
    ]);
  });

  it("returns nothing for an empty answer", () => {
    assert.deepEqual(renderBlocks(""), []);
  });
});

describe("renderInline", () => {
  it("finds inline code, bold and italic", () => {
    assert.deepEqual(renderInline("a `b` **c** *d* __e__ _f_"), [
      { kind: "text", text: "a " },
      { kind: "code", text: "b" },
      { kind: "text", text: " " },
      { kind: "bold", children: [{ kind: "text", text: "c" }] },
      { kind: "text", text: " " },
      { kind: "italic", children: [{ kind: "text", text: "d" }] },
      { kind: "text", text: " " },
      { kind: "bold", children: [{ kind: "text", text: "e" }] },
      { kind: "text", text: " " },
      { kind: "italic", children: [{ kind: "text", text: "f" }] },
    ]);
  });

  it("nests italic in bold and keeps markers inside code as text", () => {
    assert.deepEqual(renderInline("**a *b* c** `**x**`"), [
      {
        kind: "bold",
        children: [
          { kind: "text", text: "a " },
          { kind: "italic", children: [{ kind: "text", text: "b" }] },
          { kind: "text", text: " c" },
        ],
      },
      { kind: "text", text: " " },
      { kind: "code", text: "**x**" },
    ]);
  });

  it("leaves snake_case names, lone markers and unclosed code as text", () => {
    for (const text of ["snake_case_name", "2 * 3 * 4", "a ` b", "**", "* item", "_"]) {
      assert.equal(inlineText(renderInline(text)), text, text);
    }
    assert.deepEqual(renderInline("snake_case_name"), [{ kind: "text", text: "snake_case_name" }]);
  });

  it("keeps links as plain text", () => {
    assert.deepEqual(renderInline("[site](https://example.org)"), [
      { kind: "text", text: "[site](https://example.org)" },
    ]);
  });
});

describe("hostile input", () => {
  const HOSTILE = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    "javascript:alert(1)",
    "[click](javascript:alert(1))",
    "<a href='javascript:alert(1)'>x</a>",
    "&lt;b&gt; &amp; entities",
    "```\n<script>inside a fence</script>",
  ];

  it("comes out as plain text leaves, with nothing lost and no new kind of node", () => {
    for (const text of HOSTILE) {
      const blocks = renderBlocks(text);
      assertOnlyKnownShapes(blocks);
      const joined = leaves(blocks).join("");
      for (const dangerous of ["<script>", "onerror", "javascript:", "&lt;"]) {
        if (text.includes(dangerous)) {
          assert.ok(joined.includes(dangerous), `${dangerous} kept as text`);
        }
      }
    }
  });

  it("keeps the stub's markup answer as text, with its headings, lists and code", () => {
    const blocks = renderBlocks(MARKUP_TEXT);
    assertOnlyKnownShapes(blocks);
    assert.deepEqual(
      blocks.map((block) => block.kind),
      [
        "heading",
        "paragraph",
        "list",
        "list",
        "code",
        "paragraph",
        "paragraph",
        "paragraph",
        "code",
      ],
    );
    const text = leaves(blocks).join("\n");
    assert.ok(text.includes('<script>document.title = "stub-markup"</script>'));
    assert.ok(text.includes('<img src="x" onerror="document.title = 1">'));
    assert.ok(text.includes("<b>not bold</b>"));
  });

  it("handles very long lines and many unmatched markers in linear time", () => {
    const long = "x".repeat(300_000);
    assert.equal(inlineText(renderInline(long)), long);
    const markers = "* _ ` ** __ ".repeat(40_000);
    const started = Date.now();
    const blocks = renderBlocks(markers);
    assert.ok(Date.now() - started < 2000, "unmatched markers are cheap");
    assert.equal(blocks.length, 1);
    const stars = "*a".repeat(100_000);
    const begun = Date.now();
    renderBlocks(stars);
    assert.ok(Date.now() - begun < 2000, "many short pairs are cheap");
  });
});
