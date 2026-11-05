// Pure bucket-membership helpers for the normalized task store (AUD-009/019).
// Contract §3.1: assigned (doer), created (creator, not doer), other.
// A user who is both creator and doer lands in the assigned bucket.

export type TaskBucketName = "assignedToMe" | "createdByMe" | "allOtherTasks";

export type BucketIds = {
  assignedToMeIds: number[];
  createdByMeIds: number[];
  allOtherTaskIds: number[];
};

export type BucketPerson = {
  assignee?: number | null;
  asigned_to?: number | null;
  created_by?: number | null;
};

function numberOrZero(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function resolveTaskBucket(
  task: BucketPerson,
  currentUserId: number,
): TaskBucketName {
  const viewer = numberOrZero(currentUserId);
  const creator = numberOrZero(
    task.created_by !== undefined ? task.created_by : task.assignee,
  );
  const doer = numberOrZero(task.asigned_to);
  if (viewer > 0 && doer === viewer) return "assignedToMe";
  if (viewer > 0 && creator === viewer) return "createdByMe";
  return "allOtherTasks";
}

export function withoutId(ids: number[], taskId: number): number[] {
  return ids.filter((id) => id !== taskId);
}

export function addId(ids: number[], taskId: number): number[] {
  return ids.includes(taskId) ? ids : [...ids, taskId];
}

export function mergeIds(first: number[], second: number[]): number[] {
  return [...new Set([...first, ...second])];
}

export function moveTaskToBucket(
  buckets: BucketIds,
  taskId: number,
  bucket: TaskBucketName,
): BucketIds {
  const next: BucketIds = {
    assignedToMeIds: withoutId(buckets.assignedToMeIds, taskId),
    createdByMeIds: withoutId(buckets.createdByMeIds, taskId),
    allOtherTaskIds: withoutId(buckets.allOtherTaskIds, taskId),
  };
  const key =
    bucket === "assignedToMe"
      ? "assignedToMeIds"
      : bucket === "createdByMe"
        ? "createdByMeIds"
        : "allOtherTaskIds";
  return {
    ...next,
    [key]: addId(next[key], taskId),
  };
}

export function removeTaskFromBuckets(
  buckets: BucketIds,
  taskId: number,
): BucketIds {
  return {
    assignedToMeIds: withoutId(buckets.assignedToMeIds, taskId),
    createdByMeIds: withoutId(buckets.createdByMeIds, taskId),
    allOtherTaskIds: withoutId(buckets.allOtherTaskIds, taskId),
  };
}

/** Keep only the most recent `maxRows` completed ids (AUD-018). */
export function retainRecentIds(ids: number[], maxRows: number): number[] {
  if (maxRows <= 0) return [];
  return ids.length > maxRows ? ids.slice(ids.length - maxRows) : ids;
}
