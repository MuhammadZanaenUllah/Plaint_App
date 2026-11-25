/**
 * Dependency-free, presentation-only Markdown parser for Chat messages.
 *
 * SECURITY / SCOPE
 * ----------------
 * - The stored message is always a plain string and is never mutated here.
 * - HTML is never parsed or executed; angle brackets are literal text.
 * - Only http/https links are exposed as links.
 * - This is a deliberately focused subset (no raw HTML, no reference links,
 *   no nested block quotes, no underscore emphasis) so ordinary messages are
 *   not reinterpreted unexpectedly.
 */

export type Align = "left" | "center" | "right";

export type InlineNode = {
  type: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
};

export type ListItem = {
  marker: string;
  level: number;
  content: InlineNode[];
};

export type TableCell = InlineNode[];
export type TableRow = TableCell[];

export type BlockNode =
  | { type: "paragraph"; content: InlineNode[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: InlineNode[] }
  | { type: "blockquote"; content: InlineNode[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "code"; language: string | null; code: string }
  | { type: "table"; align: Align[]; header: TableRow; rows: TableRow[] }
  | { type: "spacer"; lines: number };

type InlineStyle = Partial<
  Pick<InlineNode, "bold" | "italic" | "strike" | "code" | "href">
>;

const MAX_INLINE_DEPTH = 8;

// 1: inline code, 2: bold+italic (***), 3: bold (**), 4: strike (~~),
// 5: link, 6: italic (*). Underscore emphasis is intentionally unsupported so
// identifiers like snake_case_name are never mangled.
const INLINE_SOURCE =
  "(`[^`\\n]+`)" +
  "|(\\*\\*\\*(?=\\S)[\\s\\S]*?\\S\\*\\*\\*)" +
  "|(\\*\\*(?=\\S)[\\s\\S]*?\\S\\*\\*)" +
  "|(~~(?=\\S)[\\s\\S]*?\\S~~)" +
  "|(\\[[^\\]]*\\]\\([^)]*\\))" +
  "|(\\*(?=\\S)[^*\\n]*?\\S\\*)";

const FENCE_OPEN_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w.+-]*)\s*$/;
const FENCE_CLOSE_RE = /^\s{0,3}(`{3,}|~{3,})\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const BLOCKQUOTE_RE = /^\s{0,3}>/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;

function isAsciiWordChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9]/.test(char);
}

/**
 * Validate a link target. Only absolute http(s) URLs are allowed; everything
 * else (javascript:, data:, file:, relative paths, mailto:) is rejected.
 */
export function sanitizeHref(raw: string): string | null {
  const trimmed = (raw ?? "").trim().replace(/^<|>$/g, "");
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseLinkToken(
  token: string,
): { label: string; href: string } | null {
  const match = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(token);
  if (!match) return null;
  // Ignore an optional Markdown title: [label](url "title")
  const rawTarget = match[2].trim().split(/\s+/)[0] ?? "";
  const href = sanitizeHref(rawTarget);
  if (!href) return null;
  return { label: match[1], href };
}

/**
 * Parse inline Markdown into styled text nodes. Leaf `text` values never
 * contain the Markdown syntax characters, which is what lets search highlight
 * the visible content without touching the stored message.
 */
export function parseInline(
  text: string,
  baseStyle: InlineStyle = {},
  depth = 0,
): InlineNode[] {
  if (!text) return [];
  if (depth > MAX_INLINE_DEPTH) {
    return [{ type: "text", text, ...baseStyle }];
  }

  const nodes: InlineNode[] = [];
  const pattern = new RegExp(INLINE_SOURCE, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }

    const start = match.index;

    // Reject *italic* inside a word (e.g. arithmetic like 2*3*4) so ordinary
    // text keeps its original appearance.
    if (match[6] !== undefined) {
      const before = text[start - 1];
      const after = text[start + match[0].length];
      if (isAsciiWordChar(before) || isAsciiWordChar(after)) {
        pattern.lastIndex = start + 1;
        continue;
      }
    }

    if (start > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, start), ...baseStyle });
    }

    if (match[1] !== undefined) {
      nodes.push({ type: "text", text: match[1].slice(1, -1), ...baseStyle, code: true });
    } else if (match[2] !== undefined) {
      nodes.push(
        ...parseInline(match[2].slice(3, -3), { ...baseStyle, bold: true, italic: true }, depth + 1),
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        ...parseInline(match[3].slice(2, -2), { ...baseStyle, bold: true }, depth + 1),
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        ...parseInline(match[4].slice(2, -2), { ...baseStyle, strike: true }, depth + 1),
      );
    } else if (match[5] !== undefined) {
      const link = parseLinkToken(match[5]);
      if (link) {
        nodes.push(
          ...parseInline(link.label || link.href, { ...baseStyle, href: link.href }, depth + 1),
        );
      } else {
        nodes.push({ type: "text", text: match[5], ...baseStyle });
      }
    } else if (match[6] !== undefined) {
      nodes.push(
        ...parseInline(match[6].slice(1, -1), { ...baseStyle, italic: true }, depth + 1),
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex), ...baseStyle });
  }

  return nodes;
}

/** Concatenate visible text from inline nodes (syntax excluded). */
export function flattenInlineText(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => node.text).join("");
}

function splitTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cell.trim());
}

function isTableStart(lines: readonly string[], index: number): boolean {
  if (index + 1 >= lines.length) return false;
  if (!lines[index].includes("|")) return false;
  const header = splitTableRow(lines[index]);
  const separator = splitTableRow(lines[index + 1]);
  if (header.length === 0 || header.length !== separator.length) return false;
  return separator.length > 0 && separator.every((cell) => TABLE_SEPARATOR_CELL.test(cell));
}

function parseAlign(cell: string): Align {
  const starts = cell.startsWith(":");
  const ends = cell.endsWith(":");
  if (starts && ends) return "center";
  if (ends) return "right";
  return "left";
}

function normalizeRow(cells: string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => cells[index] ?? "");
}

function startsNewBlock(lines: readonly string[], index: number): boolean {
  const line = lines[index];
  return (
    FENCE_OPEN_RE.test(line) ||
    HEADING_RE.test(line) ||
    BLOCKQUOTE_RE.test(line) ||
    LIST_RE.test(line) ||
    isTableStart(lines, index)
  );
}

/**
 * True only when the text contains Markdown we actually render. Plain messages
 * therefore keep the original linkify/highlight renderer and exact appearance.
 */
export function hasMarkdownSyntax(text: string): boolean {
  if (!text) return false;
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      FENCE_OPEN_RE.test(line) ||
      HEADING_RE.test(line) ||
      BLOCKQUOTE_RE.test(line) ||
      LIST_RE.test(line) ||
      isTableStart(lines, i)
    ) {
      return true;
    }
  }
  return parseInline(normalized).some(
    (node) => !!node.bold || !!node.italic || !!node.strike || !!node.code || !!node.href,
  );
}

/** Parse a full message into block nodes. Never throws for malformed input. */
export function parseMarkdown(text: string): BlockNode[] {
  if (!text) return [];
  // Normalise line endings for parsing only; the stored message is untouched.
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      let end = i;
      while (end < lines.length && !lines[end].trim()) end += 1;
      blocks.push({ type: "spacer", lines: end - i });
      i = end;
      continue;
    }

    const fence = FENCE_OPEN_RE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const fenceLength = fence[1].length;
      const language = fence[2]?.trim() || null;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const close = FENCE_CLOSE_RE.exec(lines[i]);
        if (close && close[1][0] === marker && close[1].length >= fenceLength) {
          i += 1;
          break;
        }
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const content = heading[2].replace(/\s+#+\s*$/, "");
      blocks.push({ type: "heading", level, content: parseInline(content) });
      i += 1;
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && BLOCKQUOTE_RE.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "blockquote", content: parseInline(quoted.join("\n")) });
      continue;
    }

    if (isTableStart(lines, i)) {
      const headerCells = splitTableRow(lines[i]);
      const separatorCells = splitTableRow(lines[i + 1]);
      const align = separatorCells.map(parseAlign);
      i += 2;
      const rows: TableRow[] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitTableRow(lines[i]);
        rows.push(normalizeRow(cells, headerCells.length).map((cell) => parseInline(cell)));
        i += 1;
      }
      blocks.push({
        type: "table",
        align,
        header: normalizeRow(headerCells, headerCells.length).map((cell) => parseInline(cell)),
        rows,
      });
      continue;
    }

    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const item = LIST_RE.exec(lines[i]);
        if (!item) break;
        const itemOrdered = /^\d/.test(item[2]);
        if (itemOrdered !== ordered) break;
        const indent = item[1].replace(/\t/g, "  ").length;
        const level = Math.min(3, Math.floor(indent / 2));
        const rawMarker = item[2];
        let rawContent = item[3];
        i += 1;
        while (i < lines.length) {
          const continuation = lines[i];
          if (!continuation.trim()) break;
          if (LIST_RE.test(continuation) || startsNewBlock(lines, i)) break;
          if (!/^\s+/.test(continuation)) break;
          rawContent += `\n${continuation.trim()}`;
          i += 1;
        }
        items.push({
          marker: ordered ? `${rawMarker.replace(/[.)]$/, "")}.` : "•",
          level,
          content: parseInline(rawContent),
        });
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsNewBlock(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join("\n")) });
    } else {
      // Defensive: always advance so malformed input cannot loop forever.
      blocks.push({ type: "paragraph", content: parseInline(line) });
      i += 1;
    }
  }

  return blocks;
}
