import assert from "node:assert/strict";
import test from "node:test";

import {
  hasNewComment,
  newestCommentId,
  newestNoteId,
} from "../../src/features/tasks/utils/taskCommentSeen";
import type { TaskNote } from "../../src/features/tasks/types/task.types";

function note(id: number, userId: number): TaskNote {
  return { id, user_id: userId } as TaskNote;
}

test("newestNoteId returns the highest valid comment id", () => {
  assert.equal(newestNoteId([]), null);
  assert.equal(newestNoteId([note(3, 1), note(9, 2), note(5, 1)]), 9);
});

test("newestCommentId ignores the current user's own comments", () => {
  assert.equal(
    newestCommentId([note(3, 1), note(9, 2), note(7, 1)], 1),
    9,
  );
  assert.equal(newestCommentId([note(3, 1), note(7, 1)], 1), null);
});

test("hasNewComment only reports unseen comments from other users", () => {
  const notes = [note(5, 1), note(6, 2), note(8, 1)];

  assert.equal(hasNewComment(notes, 1, 6), false);
  assert.equal(hasNewComment(notes, 1, 5), true);
  // A null marker means first-open seeding has not happened yet.
  assert.equal(hasNewComment(notes, 1, null), false);
  assert.equal(hasNewComment([note(7, 1)], 1, 5), false);
  assert.equal(hasNewComment([], 1, 5), false);
});
