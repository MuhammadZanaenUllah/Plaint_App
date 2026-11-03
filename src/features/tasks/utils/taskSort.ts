type SortableTask = {
  id?: number | string;
  due_date?: string | null;
  task_priority?: string | null;
};

export function sortTasksByDueDate<T extends SortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const dueA = a.due_date ?? "9999-12-31";
    const dueB = b.due_date ?? "9999-12-31";
    if (dueA !== dueB) return dueA.localeCompare(dueB);

    const priorityA = a.task_priority === "critical" ? 0 : 1;
    const priorityB = b.task_priority === "critical" ? 0 : 1;
    if (priorityA !== priorityB) return priorityA - priorityB;

    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });
}
