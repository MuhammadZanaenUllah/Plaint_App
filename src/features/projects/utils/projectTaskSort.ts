// Project task ordering per contract §17 P-007:
// incomplete first -> critical -> due date; completed by completed_at desc.

type ProjectSortableTask = {
  id?: number | string;
  status?: string;
  task_priority?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  parent_id?: number | string | null;
};

function compareOpen(a: ProjectSortableTask, b: ProjectSortableTask): number {
  const criticalA = a.task_priority === "critical" ? 0 : 1;
  const criticalB = b.task_priority === "critical" ? 0 : 1;
  if (criticalA !== criticalB) return criticalA - criticalB;

  const dueA = a.due_date ?? "9999-12-31";
  const dueB = b.due_date ?? "9999-12-31";
  if (dueA !== dueB) return dueA.localeCompare(dueB);

  return Number(a.id ?? 0) - Number(b.id ?? 0);
}

export function sortProjectTasks<T extends ProjectSortableTask>(
  tasks: T[],
): T[] {
  const open: T[] = [];
  const completed: T[] = [];
  for (const task of tasks) {
    const status = String(task.status ?? "");
    if (status === "Complete" || status === "Completed" || status === "Abandoned") {
      completed.push(task);
    } else {
      open.push(task);
    }
  }

  open.sort(compareOpen);
  completed.sort((a, b) =>
    String(b.completed_at ?? "").localeCompare(String(a.completed_at ?? "")),
  );

  return [...open, ...completed];
}
