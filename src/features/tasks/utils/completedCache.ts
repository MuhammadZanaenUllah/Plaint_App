// Bounded completed-page retention (AUD-018 / F7).
// Pure helper so the merge + prune rules can be tested without the store.

import { mergeIds, retainRecentIds } from "./taskBuckets";

export type CompletedRetentionInput = {
  previousIds: number[];
  pageIds: number[];
  page: number;
  maxRows: number;
  /** Ids that remain referenced by another bucket and must not be pruned. */
  protectedIds: Iterable<number>;
};

export type CompletedRetentionResult = {
  retainedIds: number[];
  removeIds: number[];
};

export function planCompletedRetention({
  previousIds,
  pageIds,
  page,
  maxRows,
  protectedIds,
}: CompletedRetentionInput): CompletedRetentionResult {
  const merged = page === 1 ? [...pageIds] : mergeIds(previousIds, pageIds);
  const retainedIds = retainRecentIds(merged, maxRows);
  const retainedSet = new Set(retainedIds);
  const keep = new Set<number>([...protectedIds, ...retainedIds]);
  const removeIds = previousIds.filter(
    (id) => !retainedSet.has(id) && !keep.has(id),
  );
  return { retainedIds, removeIds };
}
