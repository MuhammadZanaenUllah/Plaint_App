import React, { useMemo } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import type { StyleProp, TextStyle } from "react-native";

import {
  hasMarkdownSyntax,
  parseMarkdown,
  sanitizeHref,
  type Align,
  type BlockNode,
  type InlineNode,
  type TableRow,
} from "@/features/chat/markdown/parseMarkdown";
import { splitHighlightSegments } from "@/utils/chatSearch";
import { rf } from "@/utils/responsive";
import { showError } from "@/utils/toast";

const MONOSPACE =
  Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) ??
  "monospace";

const HIGHLIGHT_BACKGROUND = "#0CD5A3";
const HIGHLIGHT_TEXT = "#04352B";
const LINK_COLOR = "#0A84FF";

const PLAIN_URL_PATTERN = /(https?:\/\/[^\s]+)/gi;
const PLAIN_URL_FULL_PATTERN = /^https?:\/\/[^\s]+$/i;

const HEADING_STYLES: Record<1 | 2 | 3 | 4 | 5 | 6, TextStyle> = {
  1: { fontSize: rf(17), lineHeight: rf(22) },
  2: { fontSize: rf(16), lineHeight: rf(21) },
  3: { fontSize: rf(15), lineHeight: rf(20) },
  4: { fontSize: rf(14), lineHeight: rf(19) },
  5: { fontSize: rf(13), lineHeight: rf(18) },
  6: { fontSize: rf(12), lineHeight: rf(17) },
};

export type MarkdownMessageProps = {
  text: string;
  textStyle?: StyleProp<TextStyle>;
  highlightQuery?: string;
};

function openLink(href: string) {
  const safe = sanitizeHref(href);
  if (!safe) return;
  Linking.openURL(safe).catch(() =>
    showError("Error", "Could not open this link."),
  );
}

/** Highlight every query occurrence inside a visible text leaf. */
function renderHighlighted(
  text: string,
  highlightQuery: string | undefined,
  keyPrefix: string,
): React.ReactNode {
  if (!text) return text;
  if (!highlightQuery) return text;
  return splitHighlightSegments(text, highlightQuery).map((segment, index) =>
    segment.match ? (
      <Text key={`${keyPrefix}-h${index}`} style={styles.highlight}>
        {segment.text}
      </Text>
    ) : (
      segment.text
    ),
  );
}

function renderInlineNodes(
  nodes: readonly InlineNode[],
  highlightQuery: string | undefined,
  keyPrefix: string,
): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-n${index}`;
    const nodeStyle: StyleProp<TextStyle> = [
      node.bold ? styles.bold : undefined,
      node.italic ? styles.italic : undefined,
      node.strike ? styles.strike : undefined,
      node.code ? styles.inlineCode : undefined,
    ];
    const content = renderHighlighted(node.text, highlightQuery, key);
    if (node.href) {
      return (
        <Text
          key={key}
          style={[styles.link, nodeStyle]}
          onPress={() => openLink(node.href as string)}
        >
          {content}
        </Text>
      );
    }
    return (
      <Text key={key} style={nodeStyle}>
        {content}
      </Text>
    );
  });
}

function renderTableRow(
  row: TableRow,
  align: readonly Align[],
  highlightQuery: string | undefined,
  keyPrefix: string,
  header: boolean,
): React.ReactNode {
  return (
    <View
      key={keyPrefix}
      style={[styles.tableRow, header && styles.tableHeaderRow]}
    >
      {row.map((cell, index) => (
        <View
          key={`${keyPrefix}-c${index}`}
          style={[styles.tableCell, index > 0 && styles.tableCellDivider]}
        >
          <Text
            style={[
              header ? styles.tableHeaderText : styles.tableCellText,
              { textAlign: align[index] ?? "left" },
            ]}
          >
            {renderInlineNodes(cell, highlightQuery, `${keyPrefix}-c${index}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function renderBlock(
  block: BlockNode,
  index: number,
  isLast: boolean,
  textStyle: StyleProp<TextStyle> | undefined,
  highlightQuery: string | undefined,
): React.ReactNode {
  const key = `b${index}`;
  const gap = isLast ? undefined : styles.blockGap;

  switch (block.type) {
    case "paragraph":
      return (
        <Text key={key} style={[textStyle, gap]}>
          {renderInlineNodes(block.content, highlightQuery, key)}
        </Text>
      );
    case "heading":
      return (
        <Text
          key={key}
          style={[
            textStyle,
            styles.heading,
            HEADING_STYLES[block.level],
            gap,
          ]}
        >
          {renderInlineNodes(block.content, highlightQuery, key)}
        </Text>
      );
    case "blockquote":
      return (
        <View key={key} style={[styles.blockquote, gap]}>
          <Text style={[textStyle, styles.blockquoteText]}>
            {renderInlineNodes(block.content, highlightQuery, key)}
          </Text>
        </View>
      );
    case "list":
      return (
        <View key={key} style={gap}>
          {block.items.map((item, itemIndex) => (
            <View
              key={`${key}-i${itemIndex}`}
              style={[styles.listItem, { paddingLeft: item.level * 14 }]}
            >
              <Text style={[textStyle, styles.listMarker]}>
                {item.marker}
              </Text>
              <Text style={[textStyle, styles.listText]}>
                {renderInlineNodes(
                  item.content,
                  highlightQuery,
                  `${key}-i${itemIndex}`,
                )}
              </Text>
            </View>
          ))}
        </View>
      );
    case "code":
      return (
        <View key={key} style={[styles.codeBlock, gap]}>
          {block.language ? (
            <Text style={styles.codeLanguage}>{block.language}</Text>
          ) : null}
          <Text style={styles.codeText}>
            {renderHighlighted(block.code, highlightQuery, key)}
          </Text>
        </View>
      );
    case "table":
      return (
        <View key={key} style={[styles.table, gap]}>
          {renderTableRow(block.header, block.align, highlightQuery, `${key}-header`, true)}
          {block.rows.map((row, rowIndex) =>
            renderTableRow(
              row,
              block.align,
              highlightQuery,
              `${key}-r${rowIndex}`,
              false,
            ),
          )}
        </View>
      );
    case "spacer":
      return (
        <Text key={key} style={textStyle}>
          {"\n".repeat(block.lines)}
        </Text>
      );
    default:
      return null;
  }
}

/** Plain messages keep their exact previous rendering (links + highlights). */
function renderPlainText(
  text: string,
  highlightQuery: string | undefined,
): React.ReactNode[] {
  const parts = text.split(PLAIN_URL_PATTERN);
  return parts.map((part, index) =>
    PLAIN_URL_FULL_PATTERN.test(part) ? (
      <Text
        key={`p-l${index}`}
        style={styles.link}
        onPress={() => openLink(part)}
      >
        {renderHighlighted(part, highlightQuery, `p-l${index}`)}
      </Text>
    ) : (
      renderHighlighted(part, highlightQuery, `p-t${index}`)
    ),
  );
}

/**
 * Renders a Chat message's content. The stored `text` is never modified.
 *
 * Backward compatibility: messages without recognized Markdown use the plain
 * linkify/highlight path, so existing messages keep their exact appearance.
 */
const MarkdownMessage = React.memo(function MarkdownMessage({
  text,
  textStyle,
  highlightQuery,
}: MarkdownMessageProps) {
  const blocks = useMemo(() => {
    if (!text) return null;
    if (!hasMarkdownSyntax(text)) return null;
    try {
      return parseMarkdown(text);
    } catch {
      // Malformed input must never crash the message list.
      return null;
    }
  }, [text]);

  if (!text) return null;

  if (!blocks) {
    return <Text style={textStyle}>{renderPlainText(text, highlightQuery)}</Text>;
  }

  return (
    <View style={styles.container}>
      {blocks.map((block, index) =>
        renderBlock(
          block,
          index,
          index === blocks.length - 1,
          textStyle,
          highlightQuery,
        ),
      )}
    </View>
  );
});

MarkdownMessage.displayName = "MarkdownMessage";

export default MarkdownMessage;

const styles = StyleSheet.create({
  container: { flexShrink: 1 },
  blockGap: { marginBottom: 4 },
  heading: { fontFamily: "SF_Pro_Semibold" },
  bold: { fontFamily: "SF_Pro_Semibold" },
  italic: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  inlineCode: {
    fontFamily: MONOSPACE,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  link: {
    color: LINK_COLOR,
    textDecorationLine: "underline",
  },
  highlight: {
    backgroundColor: HIGHLIGHT_BACKGROUND,
    color: HIGHLIGHT_TEXT,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#D1D5DB",
    paddingLeft: 8,
    marginVertical: 2,
  },
  blockquoteText: { color: "#4B5563" },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  listMarker: {
    minWidth: 16,
    marginRight: 4,
    color: "#4B5563",
  },
  listText: { flex: 1, flexShrink: 1 },
  codeBlock: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginVertical: 2,
  },
  codeLanguage: {
    fontSize: rf(10),
    fontFamily: "SF_Pro_Medium",
    color: "#6B7280",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  codeText: {
    fontFamily: MONOSPACE,
    fontSize: rf(12),
    lineHeight: rf(17),
    color: "#1F2937",
    flexShrink: 1,
  },
  table: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    overflow: "hidden",
    marginVertical: 2,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  tableHeaderRow: { backgroundColor: "#F3F4F6" },
  tableCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  tableCellDivider: {
    borderLeftWidth: 1,
    borderLeftColor: "#E5E7EB",
  },
  tableHeaderText: {
    fontSize: rf(11),
    lineHeight: rf(15),
    fontFamily: "SF_Pro_Semibold",
    color: "#374151",
  },
  tableCellText: {
    fontSize: rf(11),
    lineHeight: rf(15),
    fontFamily: "SF_Pro_Regular",
    color: "#1F2937",
  },
});
