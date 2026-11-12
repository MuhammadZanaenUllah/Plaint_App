// Builds the dashboard stat cards and filter display values.

import { useCallback, useMemo } from "react";
import Icons from "@/constants/icons";
import { STATUS_COLORS, type StatusType } from "@/components/TaskRow";
import type { TaskTabId } from "../constants/taskTabs";

const {
  AllTaskIcon: AllTasksIcon,
  AssignIcon,
  CompletedIcon,
  CreatedIcon,
  DelayIcon,
  DueTodayIcon,
  RecurringIcon,
  SevenDayIcon: SevendayIcon,
} = Icons;

const pad = (value: number) => String(value).padStart(2, "0");

type Options = {
  counts: Record<TaskTabId, number>;
  completeCount: number;
  partial: boolean;
  isAts: boolean;
  hasCriticalTask: boolean;
  activeTab: TaskTabId;
  hasActiveFilters: boolean;
};

export function useTaskStats({
  counts,
  completeCount,
  partial,
  isAts,
  hasCriticalTask,
  activeTab,
  hasActiveFilters,
}: Options) {
  const statCount = useCallback(
    (count: number) => (partial ? "···" : pad(count)),
    [partial],
  );

  const statuses = useMemo(
    () => ["Pending", "In-Progress", "On Hold", "Completed"],
    [],
  );

  const statusColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const status of statuses) {
      colors[status] = STATUS_COLORS[status as StatusType]?.text ?? "#9CA3AF";
    }
    return colors;
  }, [statuses]);

  const priorities = useMemo(() => ["Normal", "Critical"], []);
  const priorityColors = useMemo(
    () => ({ Normal: "#0DDFAB", Critical: "#FF4444" }),
    [],
  );

  const showPriority = useMemo(
    () => isAts || hasCriticalTask,
    [hasCriticalTask, isAts],
  );

  const statsList = useMemo(
    () => [
      {
        label: "All Tasks",
        count: statCount(counts.all),
        iconName: <AllTasksIcon />,
        id: "all",
      },
      {
        label: "Due Today",
        count: pad(counts.today),
        iconName: <DueTodayIcon />,
        id: "today",
      },
      {
        label: "Due in 7 days",
        count: statCount(counts.week),
        iconName: <SevendayIcon />,
        id: "week",
      },
      {
        label: "Delayed",
        count: statCount(counts.overdue),
        iconName: <DelayIcon />,
        id: "overdue",
      },
      {
        label: "Created by me",
        count: statCount(counts.created),
        iconName: <CreatedIcon />,
        id: "created",
      },
      {
        label: "Assigned to me",
        count: statCount(counts.assigned),
        iconName: <AssignIcon />,
        id: "assigned",
      },
      {
        label: "Pending Approval",
        count: statCount(counts.pendingApproval),
        iconName: <AllTasksIcon />,
        id: "pendingApproval",
      },
      {
        label: "Recurring",
        count: statCount(counts.recurring),
        iconName: <RecurringIcon />,
        id: "recurring",
      },
      {
        label: "Completed",
        count: statCount(hasActiveFilters ? counts.completed : completeCount || counts.completed),
        iconName: <CompletedIcon />,
        id: "completed",
      },
    ],
    [completeCount, counts, hasActiveFilters, statCount],
  );

  const sectionTitle =
    statsList.find((stat) => stat.id === activeTab)?.label ?? "Due Today";

  return {
    statsList,
    statuses,
    statusColors,
    priorities,
    priorityColors,
    showPriority,
    sectionTitle,
  };
}
