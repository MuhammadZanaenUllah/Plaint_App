// Provider-level Task socket bridge (contract §5, plan Phase 7).
//
// One set of listeners for the whole Task module. Every handler is an
// idempotent store patch; only project cascades and user-directory changes
// trigger a debounced refetch.

import { useAuth } from "@/hooks/useAuth";
import {
  connectSocket,
  onSocketEvent,
} from "@/services/socket/socketService";
import { useEffect, useRef } from "react";
import type {
  SocketAddNotePayload,
  SocketAttachmentPayload,
  SocketCriticalReorderPayload,
  SocketDeleteNotePayload,
  SocketDeletePayload,
  SocketNotePinPayload,
  SocketNoteReactionPayload,
  SocketPriorityUpdatePayload,
  SocketProjectUpdatePayload,
  SocketScheduleUpdatePayload,
  SocketSprintAssignedPayload,
  SocketUpdateNotePayload,
} from "./socket.types";
import type { TaskEntity, TaskListItem, TaskPriority } from "../types/task.types";
import { normalizeApiStatus } from "../utils/taskStatus";
import { useTaskDetailStore } from "../store/taskDetailStore";
import { useTasksStore } from "../store/tasksStore";
import { useProjectsStore } from "../store/projectsStore";
import { isCompanyAdmin, isHead } from "../permissions/taskPermissions";
import {
  enqueueScheduleUpdate,
  flushScheduleForTask,
  resetScheduleBatcher,
} from "./scheduleBatcher";

type TaskSocketEnvelope = {
  company_id?: number | string;
  action?: string;
  data?: unknown;
};

type Options = {
  companyId: number | null;
  currentUserId: number;
  isAts: boolean;
};

const REFETCH_DEBOUNCE_MS = 400;
const NOTE_HISTORY_LIMIT = 500;

function numeric(value: unknown): number {
  if (typeof value === "object" && value !== null) {
    return Number((value as { id?: unknown }).id ?? 0);
  }
  return Number(value ?? 0);
}

function objectData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function canSeeCreatedTask(
  task: Record<string, unknown>,
  currentUserId: number,
  admin: boolean,
  head: boolean,
  teamMemberIds: number[],
): boolean {
  const doer = numeric(
    task.asigned_to ?? (task.task_assigned_to as { id?: unknown } | undefined)?.id,
  );
  const creator = numeric(
    task.created_by ??
      task.assignee ??
      (task.task_assignee as { id?: unknown } | undefined)?.id,
  );
  if (doer === currentUserId || creator === currentUserId) return true;
  if (admin) return true;
  if (head) {
    return (
      teamMemberIds.includes(doer) || teamMemberIds.includes(creator)
    );
  }
  return false;
}

export function useTaskSocketBridge({
  companyId,
  currentUserId,
  isAts,
}: Options): void {
  const { state: authState } = useAuth();
  const user = authState.user;
  const admin = isCompanyAdmin(user);
  const head = isHead(user);
  const userRef = useRef({ currentUserId, admin, head });
  useEffect(() => {
    userRef.current = { currentUserId, admin, head };
  }, [admin, currentUserId, head]);

  const refetchTimers = useRef<{
    tasks: ReturnType<typeof setTimeout> | null;
    projects: ReturnType<typeof setTimeout> | null;
    owners: ReturnType<typeof setTimeout> | null;
    settings: ReturnType<typeof setTimeout> | null;
  }>({ tasks: null, projects: null, owners: null, settings: null });
  const noteEventsRef = useRef<Set<string>>(new Set());
  const disconnectedRef = useRef(false);

  const isOurCompany = (value: unknown) =>
    companyId !== null && Number(value) === Number(companyId);

  const scheduleTaskRefetch = () => {
    if (refetchTimers.current.tasks) {
      clearTimeout(refetchTimers.current.tasks);
    }
    refetchTimers.current.tasks = setTimeout(() => {
      refetchTimers.current.tasks = null;
      if (!companyId) return;
      const state = useTasksStore.getState();
      if (Object.keys(state.byId).length === 0) return;
      state
        .loadDashboard(companyId, { silent: true, force: true })
        .catch(() => {});
    }, REFETCH_DEBOUNCE_MS);
  };

  const scheduleOwnerRefetch = () => {
    if (refetchTimers.current.owners) {
      clearTimeout(refetchTimers.current.owners);
    }
    refetchTimers.current.owners = setTimeout(() => {
      refetchTimers.current.owners = null;
      if (!companyId) return;
      const state = useTasksStore.getState();
      if (Object.keys(state.byId).length === 0) return;
      state
        .loadAll(companyId, { excludeComplete: true })
        .catch(() => {});
    }, REFETCH_DEBOUNCE_MS);
  };

  const scheduleSettingsRefetch = () => {
    if (refetchTimers.current.settings) {
      clearTimeout(refetchTimers.current.settings);
    }
    refetchTimers.current.settings = setTimeout(() => {
      refetchTimers.current.settings = null;
      if (!companyId) return;
      useTasksStore
        .getState()
        .loadDashboard(companyId, { silent: true, force: true })
        .catch(() => {});
    }, REFETCH_DEBOUNCE_MS);
  };

  const scheduleProjectRefetch = () => {
    if (refetchTimers.current.projects) {
      clearTimeout(refetchTimers.current.projects);
    }
    refetchTimers.current.projects = setTimeout(() => {
      refetchTimers.current.projects = null;
      if (!companyId) return;
      const projects = useProjectsStore.getState();
      if (projects.projects.length > 0) {
        projects.loadProjects(companyId).catch(() => {});
      }
      if (projects.projectDetail) {
        const detailId = Number(projects.projectDetail.id ?? 0);
        if (detailId > 0) projects.loadProjectDetail(detailId).catch(() => {});
      }
    }, REFETCH_DEBOUNCE_MS);
  };

  const rememberNoteEvent = (key: string): boolean => {
    if (noteEventsRef.current.has(key)) return false;
    noteEventsRef.current.add(key);
    if (noteEventsRef.current.size > NOTE_HISTORY_LIMIT) {
      const first = noteEventsRef.current.values().next().value;
      if (first !== undefined) noteEventsRef.current.delete(first);
    }
    return true;
  };

  const adjustNotesCount = (taskId: number, delta: number) => {
    if (!Number.isFinite(taskId) || taskId <= 0) return;
    const store = useTasksStore.getState();
    const task = store.byId[taskId];
    if (!task) return;
    store.patchTask(taskId, {
      notes_count: Math.max(0, Number(task.notes_count ?? 0) + delta),
    });
  };

  const applyUpdate = (data: Record<string, unknown>) => {
    const taskId = numeric(data.id);
    if (!taskId) return;
    if (!useTasksStore.getState().byId[taskId]) {
      // Only a full-row update can be inserted safely. Partial events for a
      // task we do not have (reassign/due-date-only) are ignored.
      if (data.title === undefined || data.status === undefined) return;
      const ctx = userRef.current;
      if (
        canSeeCreatedTask(
          data,
          ctx.currentUserId,
          ctx.admin,
          ctx.head,
          useTasksStore.getState().teamMemberIds,
        )
      ) {
        useTasksStore
          .getState()
          .applyCreatedTask(data as unknown as TaskListItem, ctx.currentUserId);
      }
      return;
    }

    const patch = { ...data } as Partial<TaskEntity>;
    if (data.status !== undefined) {
      patch.status = normalizeApiStatus(String(data.status)) as TaskEntity["status"];
    }
    if (data.asigned_to !== undefined) patch.asigned_to = numeric(data.asigned_to);
    if (data.assignee !== undefined) patch.assignee = numeric(data.assignee);
    if (data.created_by !== undefined) patch.created_by = numeric(data.created_by);
    if (data.due_date !== undefined) {
      patch.due_date = (data.due_date as string | null) ?? null;
    }
    if (data.start_date !== undefined) {
      patch.start_date = (data.start_date as string | null) ?? null;
    }
    if (data.project_id !== undefined) patch.project_id = numeric(data.project_id);
    if (data.sprint_id !== undefined) {
      patch.sprint_id =
        data.sprint_id === null ? null : numeric(data.sprint_id);
    }
    if (data.effort_hours !== undefined) {
      patch.effort_hours = Number(data.effort_hours);
    }
    if (data.notes_count !== undefined) {
      patch.notes_count = Number(data.notes_count);
    }
    useTasksStore.getState().patchTask(taskId, patch);
  };

  useEffect(() => {
    if (!companyId) return;

    connectSocket().catch(() => {});

    const cleanups: (() => void)[] = [];

    cleanups.push(
      onSocketEvent("task_update", (payload: unknown) => {
        const envelope = payload as TaskSocketEnvelope;
        if (!isOurCompany(envelope.company_id)) return;
        const action = envelope.action;
        if (!action) return;
        const data = objectData(envelope.data);

        switch (action) {
          case "create":
          case "create_subtask": {
            const ctx = userRef.current;
            const id = numeric(data.id);
            if (!id) break;
            if (
              canSeeCreatedTask(
                data,
                ctx.currentUserId,
                ctx.admin,
                ctx.head,
                useTasksStore.getState().teamMemberIds,
              )
            ) {
              useTasksStore
                .getState()
                .applyCreatedTask(
                  data as unknown as TaskListItem,
                  ctx.currentUserId,
                );
              flushScheduleForTask(id);
            }
            if (action === "create_subtask") {
              const parentId = numeric(data.parent_id);
              const parent = useTasksStore.getState().byId[parentId];
              if (parent) {
                useTasksStore.getState().patchTask(parentId, {
                  subtask_count: Number(parent.subtask_count ?? 0) + 1,
                });
              }
            }
            break;
          }

          case "update":
            applyUpdate(data);
            break;

          case "status_update":
          case "status_change": {
            const status = data.status
              ? (normalizeApiStatus(String(data.status)) as TaskEntity["status"])
              : undefined;
            const patch: Partial<TaskEntity> = {
              ...(status ? { status } : {}),
              ...(data.completed_at !== undefined
                ? { completed_at: (data.completed_at as string | null) ?? null }
                : {}),
              ...(data.rejection_reason !== undefined
                ? { rejection_reason: String(data.rejection_reason ?? "") }
                : {}),
              ...(data.effort_hours !== undefined
                ? { effort_hours: Number(data.effort_hours) }
                : {}),
              ...(data.task_priority === "normal" ||
              data.task_priority === "critical"
                ? { task_priority: data.task_priority }
                : {}),
            };
            const taskId = numeric(data.id);
            if (taskId) useTasksStore.getState().patchTask(taskId, patch);
            break;
          }

          case "schedule_update": {
            const schedule = data as SocketScheduleUpdatePayload;
            const taskId = numeric(schedule.id);
            enqueueScheduleUpdate(taskId, {
              start_date: schedule.start_date,
              due_date: schedule.due_date,
              effort_hours: schedule.effort_hours,
              remaining_effort_hours: schedule.remaining_effort_hours,
            });
            break;
          }

          case "critical_reorder": {
            const rows = Array.isArray(envelope.data)
              ? (envelope.data as SocketCriticalReorderPayload)
              : [];
            for (const row of rows) {
              const taskId = numeric(row.id);
              if (taskId) {
                useTasksStore.getState().patchTask(taskId, {
                  critical_order: Number(row.critical_order),
                });
              }
            }
            break;
          }

          case "sprint_assigned": {
            const sprint = data as SocketSprintAssignedPayload;
            const taskId = numeric(sprint.id);
            if (taskId) {
              useTasksStore.getState().patchTask(taskId, {
                project_id: numeric(sprint.project_id),
                sprint_id:
                  sprint.sprint_id === null ? null : numeric(sprint.sprint_id),
              });
            }
            break;
          }

          case "delete": {
            const taskId = numeric((data as SocketDeletePayload).id);
            if (taskId) {
              useTasksStore.getState().removeTask(taskId);
              const detail = useTaskDetailStore.getState();
              if (Number(detail.taskId) === taskId) detail.clear();
            }
            break;
          }

          case "add_note": {
            const note = data as SocketAddNotePayload;
            const taskId = numeric(note.task_id);
            const noteData = objectData(note.note);
            const noteId = numeric(noteData.id ?? data.id);
            if (rememberNoteEvent(`add:${taskId}:${noteId}`)) {
              adjustNotesCount(taskId, 1);
            }
            break;
          }

          case "delete_note": {
            const note = data as SocketDeleteNotePayload;
            const taskId = numeric(note.task_id);
            const noteId = numeric(note.id);
            if (rememberNoteEvent(`delete:${taskId}:${noteId}`)) {
              adjustNotesCount(taskId, -1);
            }
            break;
          }

          case "update_note":
          case "update_note_pin":
          case "update_note_reaction":
          case "add_attachment":
          case "delete_attachment": {
            // Detail sync is handled by useTaskDetailSocket. Nothing to patch
            // in the list except attachment/note counts, which the detail
            // reload refreshes.
            void (data as
              | SocketUpdateNotePayload
              | SocketNotePinPayload
              | SocketNoteReactionPayload
              | SocketAttachmentPayload);
            break;
          }

          default:
            break;
        }
      }),
    );

    cleanups.push(
      onSocketEvent("priority_update", (payload: unknown) => {
        const p = payload as SocketPriorityUpdatePayload;
        if (p.company_id !== undefined && !isOurCompany(p.company_id)) return;
        if (!p.action || !p.data) return;
        const data = p.data;
        const id = numeric(data.id);
        if (!id) return;
        const store = useTasksStore.getState();
        const existing = store.priorities.find((entry) => entry.id === id);

        if (p.action === "delete") {
          useTasksStore.setState({
            priorities: store.priorities.filter((entry) => entry.id !== id),
          });
          return;
        }

        const next: TaskPriority = {
          id,
          name:
            typeof data.name === "string"
              ? data.name
              : (existing?.name ?? "Priority"),
          color:
            typeof data.color === "string"
              ? data.color
              : (existing?.color ?? "#00DEAB"),
          order:
            data.order === undefined || data.order === null
              ? (existing?.order ?? null)
              : Number(data.order),
          company_id:
            data.company_id === undefined
              ? existing?.company_id
              : numeric(data.company_id),
        };

        useTasksStore.setState({
          priorities:
            p.action === "create" && !existing
              ? [...store.priorities, next]
              : store.priorities.map((entry) =>
                  entry.id === id ? next : entry,
                ),
        });
      }),
    );

    // jobstatus_update and evaluation_update are deliberately not registered.

    cleanups.push(
      onSocketEvent("project_update", (payload: unknown) => {
        const p = payload as SocketProjectUpdatePayload & {
          project_id?: number | string;
        };
        if (p.company_id !== undefined && !isOurCompany(p.company_id)) return;

        const projectId = numeric(p.project_id ?? p.data?.id);
        const projects = useProjectsStore.getState();
        if (projectId) {
          const detailOpen =
            !!projects.projectDetail &&
            Number(projects.projectDetail.id) === projectId;
          const sprintsLoaded =
            projects.sprintsProjectId === projectId ||
            projects.assignmentSprintsProjectId === projectId;
          if (detailOpen || sprintsLoaded) {
            projects.loadSprints(companyId, projectId).catch(() => {});
          }
          if (detailOpen) {
            projects.loadProjectDetail(projectId).catch(() => {});
          }
          if (projects.assignmentSprintsProjectId === projectId) {
            projects
              .loadAssignmentSprints(companyId, projectId)
              .catch(() => {});
          }
        }
        scheduleProjectRefetch();
        // Project status changes cascade to tasks without task events.
        scheduleTaskRefetch();
      }),
    );

    cleanups.push(
      onSocketEvent("user_update", (payload: unknown) => {
        const p = payload as { company_id?: number | string };
        if (p.company_id !== undefined && !isOurCompany(p.company_id)) return;
        scheduleOwnerRefetch();
      }),
    );

    cleanups.push(
      onSocketEvent("task_scheduling_settings_update", (payload: unknown) => {
        const p = payload as { company_id?: number | string };
        if (p.company_id !== undefined && !isOurCompany(p.company_id)) return;
        if (isAts) scheduleSettingsRefetch();
      }),
    );

    cleanups.push(
      onSocketEvent("disconnect", () => {
        disconnectedRef.current = true;
      }),
    );

    cleanups.push(
      onSocketEvent("connect", () => {
        if (!disconnectedRef.current || !companyId) return;
        disconnectedRef.current = false;
        useTasksStore
          .getState()
          .loadDashboard(companyId, { silent: true, force: true })
          .catch(() => {});
      }),
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      Object.values(refetchTimers.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      refetchTimers.current = {
        tasks: null,
        projects: null,
        owners: null,
        settings: null,
      };
      noteEventsRef.current.clear();
      resetScheduleBatcher();
    };
  }, [companyId, isAts]);
}

