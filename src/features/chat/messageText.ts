/**
 * Chat message text preservation helpers.
 *
 * The backend stores `text` as a plain string and it is the single source of
 * truth. These helpers exist so the send/edit/copy paths can be unit tested
 * without changing their behaviour: the outgoing payload is returned exactly as
 * drafted, and trimming is only ever used for emptiness validation.
 */

/** Composer limit. Must never be silently reduced. */
export const MESSAGE_MAX_LENGTH = 10000;

/** Return the exact draft for transport. Never trims. */
export function getOutgoingMessageText(draft: string): string {
  return draft;
}

/** Whether a draft is empty/whitespace-only (validation only). */
export function isBlankMessage(draft: string | null | undefined): boolean {
  return !draft || draft.trim().length === 0;
}

/** Return the exact stored text for the clipboard. Never trims. */
export function getCopyableMessageText(text: string | null | undefined): string {
  return text ?? "";
}
