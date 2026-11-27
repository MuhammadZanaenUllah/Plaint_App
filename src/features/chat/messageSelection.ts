import type { ChatMessage } from "@/types/chat.types";

/** Stable identity key used for multi-select state. */
export function messageSelectionKey(
  message: Pick<ChatMessage, "_id" | "id">,
): string {
  // Prefer `_id`; fall back to the numeric id for optimistic/edge messages
  // where `_id` may be an empty string.
  return String(message._id || message.id || "");
}

/**
 * Return the selected messages in the order they appear in `messages`
 * (chronological), skipping keys that are no longer loaded. Duplicate keys are
 * naturally collapsed because the result is derived from the source list.
 */
export function getSelectedMessages(
  messages: readonly ChatMessage[],
  selectedKeys: ReadonlySet<string>,
): ChatMessage[] {
  if (selectedKeys.size === 0) return [];
  return messages.filter((message) =>
    selectedKeys.has(messageSelectionKey(message)),
  );
}
