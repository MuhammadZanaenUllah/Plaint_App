// Pure helpers for task-comment "new comment" tracking. Storage lives in
// taskCommentSeenStorage.ts so these helpers stay unit-testable.

import type { TaskNote } from "../types/task.types";

/** Highest note id in the list, or null when there are no valid ids. */
export function newestNoteId(notes: readonly TaskNote[]): number | null {
  let newest: number | null = null;
  for (const note of notes) {
    const id = Number(note?.id);
    if (!Number.isFinite(id)) continue;
    if (newest === null || id > newest) newest = id;
  }
  return newest;
}

/**
 * Highest note id authored by someone other than the current user. Own
 * comments must not create a new-comment indicator.
 */
export function newestCommentId(
  notes: readonly TaskNote[],
  currentUserId: number,
): number | null {
  let newest: number | null = null;
  for (const note of notes) {
    const id = Number(note?.id);
    if (!Number.isFinite(id)) continue;
    if (
      currentUserId > 0 &&
      Number(note?.user_id) === Number(currentUserId)
    ) {
      continue;
    }
    if (newest === null || id > newest) newest = id;
  }
  return newest;
}

/**
 * True when a comment from another user is newer than the last seen id.
 * A null marker means the first-open seeding has not happened yet; do not
 * show the dot until it has.
 */
export function hasNewComment(
  notes: readonly TaskNote[],
  currentUserId: number,
  lastSeenNoteId: number | null,
): boolean {
  if (lastSeenNoteId === null) return false;
  const newest = newestCommentId(notes, currentUserId);
  return newest !== null && newest > lastSeenNoteId;
}
