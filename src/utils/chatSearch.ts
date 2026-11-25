import type { ChatMessage } from "@/types/chat.types";

/**
 * Chat message search helpers.
 *
 * Search is intentionally a *rendering-time* concern: it never mutates the
 * message list, never filters the FlatList data and never touches persisted
 * message content. That keeps the conversation scroll position stable when
 * search opens/closes and lets highlighting coexist with manual scrolling.
 */

/** Trim a raw query. An empty/whitespace query is "inactive". */
export function normalizeSearchQuery(query?: string | null): string {
  return (query ?? "").trim();
}

/** Escape every RegExp metacharacter so the query is matched literally. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive, literal RegExp for the query. Returns null for an
 * empty query (search inactive). A fresh RegExp is created per call so no
 * `lastIndex` state can leak between messages/renders.
 */
export function buildSearchRegExp(query?: string | null): RegExp | null {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return null;
  return new RegExp(escapeRegExp(normalized), "gi");
}

export type HighlightSegment = { text: string; match: boolean };

/**
 * Split a plain string into alternating literal/highlighted segments.
 * - Case-insensitive.
 * - Multiple occurrences in one string are all matched.
 * - Special characters are treated literally.
 * - The concatenation of all segment texts always equals the input text, so
 *   message content (including line breaks and emoji) is never altered.
 * - Empty query or no match returns the original text as one non-match segment.
 */
export function splitHighlightSegments(
  text: string,
  query?: string | null,
): HighlightSegment[] {
  if (!text) return [];
  const regex = buildSearchRegExp(query);
  if (!regex) return [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), match: false });
    }
    segments.push({ text: match[0], match: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), match: false });
  }

  return segments.length > 0 ? segments : [{ text, match: false }];
}

/** Count literal, case-insensitive occurrences of the query inside `text`. */
export function countTextMatches(
  text: string | null | undefined,
  query?: string | null,
): number {
  if (!text) return 0;
  const regex = buildSearchRegExp(query);
  if (!regex) return 0;
  return (text.match(regex) ?? []).length;
}

/**
 * Return the set of loaded messages whose text contains the query.
 *
 * Uses object identity (not ids) so optimistic/pending messages without a
 * backend id are matched correctly, and so the result can be compared against
 * the exact objects rendered by the list.
 *
 * Note: only messages currently loaded in the store are searched. Older
 * history that has not been paginated in yet is not included.
 */
export function getMatchingMessages(
  messages: readonly ChatMessage[],
  query?: string | null,
): Set<ChatMessage> {
  const matches = new Set<ChatMessage>();
  const needle = normalizeSearchQuery(query).toLowerCase();
  if (!needle) return matches;

  for (const message of messages) {
    const text = message.text;
    if (!text) continue;
    if (text.toLowerCase().includes(needle)) matches.add(message);
  }
  return matches;
}

/**
 * Resolve the next/previous match index for the search navigation arrows.
 *
 * - `current` is -1 when the user has not navigated yet.
 * - `direction` 1 = next (newer / down), -1 = previous (older / up).
 * - Wraps around at both ends so the arrows never dead-end.
 * - Returns -1 when there are no matches.
 */
export function nextMatchIndex(
  current: number,
  count: number,
  direction: 1 | -1,
): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) {
    return direction > 0 ? 0 : count - 1;
  }
  return ((current + direction) % count + count) % count;
}
