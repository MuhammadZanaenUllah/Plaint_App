type SortableTask = {
  id?: number | string;
  due_date?: string | null;
  task_priority?: string | null;
  critical_order?: number | null;
  parent_id?: number | string | null;
};

function compareTasks(a: SortableTask, b: SortableTask): number {
  const dueA = a.due_date ?? "9999-12-31";
  const dueB = b.due_date ?? "9999-12-31";
  if (dueA !== dueB) return dueA.localeCompare(dueB);

  const priorityA = a.task_priority === "critical" ? 0 : 1;
  const priorityB = b.task_priority === "critical" ? 0 : 1;
  if (priorityA !== priorityB) return priorityA - priorityB;

  // Contract §5.2 critical_reorder: critical_order is 1 = first. Use it as a
  // tie-breaker so a reorder is visible when due date + priority are equal.
  const orderA =
    a.task_priority === "critical" && a.critical_order != null
      ? Number(a.critical_order)
      : null;
  const orderB =
    b.task_priority === "critical" && b.critical_order != null
      ? Number(b.critical_order)
      : null;
  if (orderA !== null && orderB !== null && orderA !== orderB) {
    return orderA - orderB;
  }

  return Number(a.id ?? 0) - Number(b.id ?? 0);
}

function parentIdOf(task: SortableTask): number {
  const numeric = Number(task.parent_id ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Sort due date ascending, then critical first, then critical_order, then id.
 * Subtasks are kept directly under their loaded parent (contract T-005) so a
 * due-date sort cannot interleave children between unrelated top-level tasks.
 */
export function sortTasksByDueDate<T extends SortableTask>(tasks: T[]): T[] {
  const list = [...tasks];
  if (list.length < 2) return list;

  const byId = new Map<number, T>();
  for (const task of list) {
    const id = Number(task.id);
    if (Number.isFinite(id)) byId.set(id, task);
  }

  const children = new Map<number, T[]>();
  const roots: T[] = [];
  for (const task of list) {
    const parentId = parentIdOf(task);
    if (parentId > 0 && parentId !== Number(task.id) && byId.has(parentId)) {
      const siblings = children.get(parentId) ?? [];
      siblings.push(task);
      children.set(parentId, siblings);
    } else {
      roots.push(task);
    }
  }

  const visited = new Set<number>();
  const ordered: T[] = [];
  const appendBranch = (task: T) => {
    const id = Number(task.id);
    if (Number.isFinite(id)) {
      if (visited.has(id)) return;
      visited.add(id);
    }
    ordered.push(task);
    const kids = children.get(id);
    if (kids?.length) {
      kids.sort(compareTasks).forEach(appendBranch);
    }
  };

  roots.sort(compareTasks).forEach(appendBranch);

  // Safety net: never drop a row if malformed parent links form a cycle.
  for (const task of list) {
    const id = Number(task.id);
    if (Number.isFinite(id) && !visited.has(id)) ordered.push(task);
  }

  return ordered;
}
