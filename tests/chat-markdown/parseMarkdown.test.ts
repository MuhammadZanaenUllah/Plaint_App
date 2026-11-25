import assert from "node:assert/strict";
import test from "node:test";

import {
  flattenInlineText,
  hasMarkdownSyntax,
  parseInline,
  parseMarkdown,
  sanitizeHref,
  type BlockNode,
  type InlineNode,
} from "../../src/features/chat/markdown/parseMarkdown";
import { splitHighlightSegments } from "../../src/utils/chatSearch";

function inlineNodesOf(block: BlockNode | undefined): InlineNode[] {
  if (!block) return [];
  if (block.type === "paragraph" || block.type === "heading" || block.type === "blockquote") {
    return block.content;
  }
  return [];
}

test("plain text is not treated as Markdown", () => {
  assert.equal(hasMarkdownSyntax("hello world\nsecond line"), false);
  assert.equal(hasMarkdownSyntax("2 * 3 * 4"), false);
  assert.equal(hasMarkdownSyntax("snake_case_name"), false);
  assert.equal(hasMarkdownSyntax("C# developer"), false);
  assert.equal(hasMarkdownSyntax("#hashtag"), false);
  assert.equal(hasMarkdownSyntax(""), false);
});

test("common Markdown is detected", () => {
  assert.equal(hasMarkdownSyntax("**bold**"), true);
  assert.equal(hasMarkdownSyntax("*italic*"), true);
  assert.equal(hasMarkdownSyntax("`inline`"), true);
  assert.equal(hasMarkdownSyntax("[site](https://example.com)"), true);
  assert.equal(hasMarkdownSyntax("- item"), true);
  assert.equal(hasMarkdownSyntax("# Heading"), true);
  assert.equal(hasMarkdownSyntax("> quote"), true);
  assert.equal(hasMarkdownSyntax("```js\ncode\n```"), true);
  assert.equal(hasMarkdownSyntax("| A | B |\n| --- | --- |\n| 1 | 2 |"), true);
});

test("inline bold, italic, strike, code and links parse without syntax text", () => {
  const bold = parseInline("a **bold** b");
  assert.equal(flattenInlineText(bold), "a bold b");
  assert.equal(bold.some((n) => n.bold && n.text === "bold"), true);

  const italic = parseInline("a *slanted* b");
  assert.equal(flattenInlineText(italic), "a slanted b");
  assert.equal(italic.some((n) => n.italic && n.text === "slanted"), true);

  const strike = parseInline("a ~~gone~~ b");
  assert.equal(flattenInlineText(strike), "a gone b");
  assert.equal(strike.some((n) => n.strike && n.text === "gone"), true);

  const code = parseInline("use `npm test` now");
  assert.equal(flattenInlineText(code), "use npm test now");
  assert.equal(code.some((n) => n.code && n.text === "npm test"), true);

  const link = parseInline("see [Planit](https://planit.pk)");
  assert.equal(flattenInlineText(link), "see Planit");
  assert.equal(link.some((n) => n.href === "https://planit.pk/" && n.text === "Planit"), true);
});

test("triple emphasis is bold + italic", () => {
  const nodes = parseInline("***both***");
  assert.equal(flattenInlineText(nodes), "both");
  assert.equal(nodes.some((n) => n.bold && n.italic && n.text === "both"), true);
});

test("malformed inline Markdown stays literal and never throws", () => {
  assert.equal(flattenInlineText(parseInline("**unclosed")), "**unclosed");
  assert.equal(flattenInlineText(parseInline("`unclosed")), "`unclosed");
  assert.equal(flattenInlineText(parseInline("[](")), "[](");
});

test("only http/https links are exposed as links", () => {
  assert.equal(sanitizeHref("https://example.com"), "https://example.com/");
  assert.equal(sanitizeHref("http://example.com"), "http://example.com/");
  assert.equal(sanitizeHref("javascript:alert(1)"), null);
  assert.equal(sanitizeHref("data:text/html,hi"), null);
  assert.equal(sanitizeHref("file:///etc/passwd"), null);
  assert.equal(sanitizeHref("/relative"), null);

  const bad = parseInline("[x](javascript:alert(1))");
  assert.equal(bad.some((n) => !!n.href), false);
});

test("raw HTML is treated as literal text", () => {
  const nodes = parseInline("<script>alert(1)</script>");
  assert.equal(flattenInlineText(nodes), "<script>alert(1)</script>");
  assert.equal(nodes.some((n) => !!n.href), false);
});

test("headings keep the expected level and inline content", () => {
  const blocks = parseMarkdown("## **Release** notes");
  assert.equal(blocks.length, 1);
  const heading = blocks[0];
  assert.equal(heading.type, "heading");
  if (heading.type === "heading") {
    assert.equal(heading.level, 2);
    assert.equal(flattenInlineText(heading.content), "Release notes");
    assert.equal(heading.content.some((n) => n.bold), true);
  }
});

test("bullet and numbered lists preserve markers and indentation levels", () => {
  const bullet = parseMarkdown("- one\n  - nested\n- two");
  const bulletList = bullet[0];
  assert.equal(bulletList.type, "list");
  if (bulletList.type === "list") {
    assert.equal(bulletList.ordered, false);
    assert.deepEqual(bulletList.items.map((i) => i.marker), ["•", "•", "•"]);
    assert.deepEqual(bulletList.items.map((i) => i.level), [0, 1, 0]);
    assert.equal(flattenInlineText(bulletList.items[1].content), "nested");
  }

  const ordered = parseMarkdown("1. first\n2. second");
  const orderedList = ordered[0];
  assert.equal(orderedList.type, "list");
  if (orderedList.type === "list") {
    assert.equal(orderedList.ordered, true);
    assert.deepEqual(orderedList.items.map((i) => i.marker), ["1.", "2."]);
  }
});

test("fenced code blocks preserve exact code text and language", () => {
  const code = "function hi() {\n  return 1;\n}";
  const blocks = parseMarkdown("```ts\n" + code + "\n```");
  assert.equal(blocks.length, 1);
  const block = blocks[0];
  assert.equal(block.type, "code");
  if (block.type === "code") {
    assert.equal(block.language, "ts");
    assert.equal(block.code, code);
  }
});

test("unclosed fenced code block is safe", () => {
  const blocks = parseMarkdown("```js\nconst a = 1;");
  assert.equal(blocks[0].type, "code");
  if (blocks[0].type === "code") assert.equal(blocks[0].code, "const a = 1;");
});

test("blockquotes render their content", () => {
  const blocks = parseMarkdown("> first\n> **second**");
  assert.equal(blocks[0].type, "blockquote");
  if (blocks[0].type === "blockquote") {
    assert.equal(flattenInlineText(blocks[0].content), "first\nsecond");
    assert.equal(blocks[0].content.some((n) => n.bold), true);
  }
});

test("tables parse header, alignment and rows", () => {
  const blocks = parseMarkdown(
    "| Name | Age |\n| :--- | ---: |\n| A | 1 |\n| B | 22 |",
  );
  const table = blocks[0];
  assert.equal(table.type, "table");
  if (table.type === "table") {
    assert.deepEqual(table.align, ["left", "right"]);
    assert.deepEqual(table.header.map(flattenInlineText), ["Name", "Age"]);
    assert.deepEqual(table.rows.map((row) => row.map(flattenInlineText)), [
      ["A", "1"],
      ["B", "22"],
    ]);
  }
});

test("multiple blank lines are preserved as spacer blocks", () => {
  const blocks = parseMarkdown("first\n\n\nsecond");
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].type, "spacer");
  if (blocks[1].type === "spacer") assert.equal(blocks[1].lines, 2);
});

test("special characters and line breaks survive parsing", () => {
  const source = 'He said "hello" & left <tag>\n\nPrice: $5.00';
  const blocks = parseMarkdown(source);
  const paragraphs = blocks
    .filter((block) => block.type === "paragraph")
    .map((block) => flattenInlineText((block as { content: InlineNode[] }).content));
  assert.deepEqual(paragraphs, [
    'He said "hello" & left <tag>',
    "Price: $5.00",
  ]);
  const spacer = blocks.find((block) => block.type === "spacer");
  assert.ok(spacer);
  if (spacer && spacer.type === "spacer") {
    assert.equal(spacer.lines, 1);
  }
  // The source string itself is never modified.
  assert.equal(source, 'He said "hello" & left <tag>\n\nPrice: $5.00');
});

test("empty input produces no blocks and empty inline", () => {
  assert.deepEqual(parseMarkdown(""), []);
  assert.deepEqual(parseInline(""), []);
});

test("search finds and highlights words inside formatted content", () => {
  const boldBlocks = parseMarkdown("Hello **world**");
  const boldNodes = inlineNodesOf(boldBlocks[0]);
  const world = boldNodes.find((node) => node.bold && node.text === "world");
  assert.ok(world);
  const segments = splitHighlightSegments(world!.text, "WORLD");
  assert.deepEqual(
    segments.filter((segment) => segment.match).map((segment) => segment.text),
    ["world"],
  );

  const codeBlocks = parseMarkdown("```\nconst hello = 1;\n```");
  assert.equal(codeBlocks[0].type, "code");
  if (codeBlocks[0].type === "code") {
    const matches = splitHighlightSegments(codeBlocks[0].code, "hello").filter(
      (segment) => segment.match,
    );
    assert.equal(matches.length, 1);
  }
});

test("multiple occurrences in formatted text are all highlightable", () => {
  const nodes = parseInline("**foo foo**");
  const text = flattenInlineText(nodes);
  assert.equal(text, "foo foo");
  const matches = splitHighlightSegments(text, "foo").filter((s) => s.match);
  assert.equal(matches.length, 2);
});

test("CRLF input is parsed without corrupting content", () => {
  const source = "# Title\r\n\r\n- one\r\n- two";
  assert.equal(hasMarkdownSyntax(source), true);
  const blocks = parseMarkdown(source);
  const heading = blocks.find((block) => block.type === "heading");
  assert.ok(heading);
  if (heading && heading.type === "heading") {
    assert.equal(flattenInlineText(heading.content), "Title");
  }
  const list = blocks.find((block) => block.type === "list");
  assert.ok(list);
  if (list && list.type === "list") {
    assert.equal(list.items.length, 2);
  }
});

test("bare URLs are not treated as Markdown links", () => {
  assert.equal(hasMarkdownSyntax("see https://example.com now"), false);
  assert.equal(hasMarkdownSyntax("https://example.com"), false);
});

test("pathological marker input cannot crash the parser", () => {
  assert.doesNotThrow(() => parseMarkdown("*".repeat(2000)));
  assert.doesNotThrow(() => parseMarkdown("**".repeat(1000)));
  assert.doesNotThrow(() => parseMarkdown("[".repeat(1000)));
  assert.doesNotThrow(() => parseMarkdown("```".repeat(100)));
});

test("parsing never mutates the original message string", () => {
  const original = "**keep** the *source* exactly";
  const copy = original;
  parseMarkdown(original);
  assert.equal(original, copy);
  assert.equal(original, "**keep** the *source* exactly");
});
