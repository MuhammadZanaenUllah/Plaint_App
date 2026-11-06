// Pure layout constants and helpers for the shared task table (AUD-080).
// Extracted verbatim from SingleTaskTable so row/cell components can share them
// without importing the table shell.

import type { TaskRowProps } from "@/components/TaskRow";

export type AssignableOwner = {
  id: number;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  image?: string | null;
};

export type SingleTaskTableColumn =
  | "title"
  | "createdBy"
  | "assignedTo"
  | "dueDate"
  | "sprint"
  | "project"
  | "status"
  | "remove";

export const ROW_HEIGHT = 35;
export const DETAIL_ROW_HEIGHT = 85;
export const ACTION_REVEAL_WIDTH = 176;
export const ACTION_STRIP_HEIGHT = 35;
export const ACTION_GRIP_WIDTH = (29 / 25) * ACTION_STRIP_HEIGHT;
export const MAX_TABLE_WIDTH = 640;
export const MIN_TABLE_WIDTH = 320;
export const SWIPE_GREEN = "#00DFAB";
export const WAVE_BADGE_WIDTH = 10;
export const WAVE_BADGE_HEIGHT = 30;

export function getOwnerInitials(owner: AssignableOwner): string {
  if (owner.first_name || owner.last_name) {
    return (
      (owner.first_name?.[0] ?? "") + (owner.last_name?.[0] ?? "")
    ).toUpperCase();
  }
  const parts = owner.full_name?.trim().split(/\s+/) ?? [];
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? "?";
}

export const DEFAULT_COLUMNS: SingleTaskTableColumn[] = [
  "title",
  "createdBy",
  "dueDate",
];

export const DEFAULT_COLUMN_HEADINGS: Record<SingleTaskTableColumn, string> = {
  title: "Task Title",
  createdBy: "Created By",
  assignedTo: "Assigned To",
  dueDate: "Due Date",
  sprint: "Sprint",
  project: "Project",
  status: "Status",
  remove: "",
};

export function getTaskKey(task: TaskRowProps, index: number) {
  return task.id ?? `${index}:${task.title}:${task.dueDate}`;
}

/**
 * Stable identity for interaction state (open swipe row, local overrides).
 * Never include the row index; indices change on filter/sort/paging and would
 * transfer one task's state to another. API task ids are always preferred.
 */
export function getTaskIdentityKey(task: TaskRowProps): string {
  const rawId = task._raw?.id;
  const id = task.id ?? rawId;
  if (id !== undefined && id !== null && String(id).length > 0) {
    return `task:${String(id)}`;
  }
  return `fallback:${task.title}|${task.dueDate}|${task.assignedTo}|${task.createdBy}`;
}

export function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

export function getTableMetrics(
  windowWidth: number,
  columns: SingleTaskTableColumn[],
  contained: boolean,
) {
  const isDefaultLayout =
    columns.length === 3 &&
    columns[0] === "title" &&
    columns[1] === "createdBy" &&
    columns[2] === "dueDate";
  // Governs the header bar, section header, and data columns (title/created
  // by/due date) — unchanged from the original symmetric 16px-each-side inset,
  // so none of that sizing shifts.
  const insetTableWidth = Math.max(
    MIN_TABLE_WIDTH,
    Math.min(windowWidth - 32, MAX_TABLE_WIDTH),
  );
  // The container's actual box width — on phones (the common, unclamped
  // case) this is the full window width so the row can be edge-flush on
  // BOTH sides: the closed row's chevron reaches the true right edge, and
  // the swiped-open "details" panel's back arrow reaches the true left
  // edge (it renders inside the parent tableShell's left padding via
  // `leftCompensation` below). On wide/web screens where this clamps to
  // MAX_TABLE_WIDTH, keep the original centered-card treatment instead.
  const naturalTableWidth = windowWidth;
  const tableWidth = contained
    ? insetTableWidth
    : Math.max(MIN_TABLE_WIDTH, Math.min(naturalTableWidth, MAX_TABLE_WIDTH));
  const tableWidthClamped = contained
    ? tableWidth !== insetTableWidth
    : tableWidth !== naturalTableWidth;
  // Only needed in the unclamped case — compensates the parent tableShell's
  // left padding so visible content (headers, row data) lands exactly where
  // it did before. In `contained` mode the parent supplies its own padding,
  // so there's nothing to compensate.
  const leftCompensation = contained ? 0 : tableWidthClamped ? 0 : 16;
  const innerPadding = 6;
  const leadingWidth = 32;
  const actionWidth = 26;

  // Per-column minimums/weights are used for the classic fitted (fits-the-
  // window, no-scroll) layouts. Custom layouts use fixed generous widths and
  // scroll horizontally because 5 columns can't comfortably fit one screen.
  const COL_WEIGHT: Record<SingleTaskTableColumn, number> = {
    title: 1.6,
    createdBy: 1.1,
    assignedTo: 1.1,
    dueDate: 0.8,
    sprint: 0.9,
    project: 1.1,
    status: 0.8,
    remove: 0.4,
  };
  const COL_MIN: Record<SingleTaskTableColumn, number> = {
    title: 85,
    createdBy: 90,
    assignedTo: 90,
    dueDate: 95,
    sprint: 90,
    project: 90,
    status: 80,
    remove: 44,
  };
  const FIXED_COL_WIDTHS: Record<SingleTaskTableColumn, number> = {
    title: 220,
    createdBy: 160,
    assignedTo: 160,
    dueDate: 150,
    sprint: 150,
    project: 160,
    status: 130,
    remove: 52,
  };

  const dataWidth = insetTableWidth - innerPadding * 2 - leadingWidth - actionWidth;
  const columnKeys = isDefaultLayout ? DEFAULT_COLUMNS : columns;
  const columnWidths: Partial<Record<SingleTaskTableColumn, number>> = {};
  let needsHScroll = false;
  let fullTableWidth = tableWidth;

  if (isDefaultLayout) {
    const totalWeight = columnKeys.reduce((sum, k) => sum + COL_WEIGHT[k], 0);
    const totalMin = columnKeys.reduce((sum, k) => sum + COL_MIN[k], 0);
    const excess = Math.max(0, dataWidth - totalMin);
    for (const k of columnKeys) {
      columnWidths[k] = Math.round(
        COL_MIN[k] + (COL_WEIGHT[k] / totalWeight) * excess,
      );
    }
  } else {
    let sum = 0;
    for (const k of columnKeys) {
      columnWidths[k] = FIXED_COL_WIDTHS[k];
      sum += FIXED_COL_WIDTHS[k];
    }
    const required = innerPadding * 2 + leadingWidth + sum + actionWidth;
    needsHScroll = required > insetTableWidth;
    if (needsHScroll) {
      fullTableWidth = required;
    }
  }

  return {
    tableWidth,
    tableWidthClamped,
    leftCompensation,
    innerPadding,
    leadingWidth,
    actionWidth,
    columnWidths,
    needsHScroll,
    fullTableWidth,
    // The "details" panel spans the visible table width so its back-arrow
    // always reaches the true left edge on every device size, matching the
    // closed row's chevron on the right.
    swipeContentWidth: tableWidth,
  };
}

export type TableMetrics = ReturnType<typeof getTableMetrics>;
