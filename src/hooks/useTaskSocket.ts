import { useEffect, useRef } from "react";
import { useTasks } from "@/hooks/useTasks";
import {
  connectSocket,
  getSocket,
  onSocketEvent,
  type TaskUpdatePayload,
  type PriorityUpdatePayload,
  type JobStatusUpdatePayload,
  type UserUpdatePayload,
} from "@/services/socket/socketService";

/**
 * Listens for task-related Socket.io events and keeps TaskContext in sync.
 *
 * Events handled:
 * - `task_update` — all task CRUD, notes, attachments, schedule updates
 *   (filtered by company_id, triggers full task list refetch)
 * - `priority_update` — company priority dropdown list changes (create/update/delete)
 * - `jobstatus_update` — company status dropdown list changes (create/update/delete)
 * - `project_update` — project changes (create/due_date_update), triggers task refetch
 * - `user_update` — user directory changed (used by CreateTaskModal assignee picker)
 * - `task_scheduling_settings_update` — scheduling settings changed
 *
 * No task-specific room-joining exists — every event is a global company-wide broadcast.
 * The client always filters by `company_id` first.
 */
export function useTaskSocket(): void {
  const {
    companyId,
    fetchAllTasks,
    applyPriorityUpdate,
    applyJobStatusUpdate,
  } = useTasks();

  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  const fetchRef = useRef(fetchAllTasks);
  fetchRef.current = fetchAllTasks;

  const priorityRef = useRef(applyPriorityUpdate);
  priorityRef.current = applyPriorityUpdate;

  const jobStatusRef = useRef(applyJobStatusUpdate);
  jobStatusRef.current = applyJobStatusUpdate;

  useEffect(() => {
    if (!companyId) {
      console.log(`[useTaskSocket] No companyId, skipping socket setup`);
      return;
    }

    let cleanupFns: Array<() => void> = [];
    let cancelled = false;

    function registerListeners() {
      if (cancelled) return;
      const socket = getSocket();
      if (!socket) {
        console.log(`[useTaskSocket] Socket not available yet, will retry on connect`);
        return;
      }

      cleanupFns.forEach((fn) => fn());
      cleanupFns = [];

      // ─── task_update — the core task event ──────────────────────────────
      cleanupFns.push(
        onSocketEvent("task_update", (payload: unknown) => {
          const p = payload as TaskUpdatePayload;
          console.log(`[useTaskSocket] task_update received: action="${p?.action}", company_id=${p?.company_id}, our_company=${companyIdRef.current}`);
          if (String(p?.company_id) !== String(companyIdRef.current)) return;
          if (!p?.action) {
            console.log(`[useTaskSocket] task_update ignored — no action field`);
            return;
          }
          console.log(`[useTaskSocket] task_update matched — refetching tasks silently (action: "${p.action}")`);
          // All task_update actions (create, update, status_update, delete,
          // add_note, delete_note, schedule_update, etc.) trigger a silent refetch
          fetchRef.current(companyIdRef.current!, { silent: true });
        })
      );

      // ─── priority_update — company priority dropdown list changed ────────
      cleanupFns.push(
        onSocketEvent("priority_update", (payload: unknown) => {
          const p = payload as PriorityUpdatePayload;
          if (String(p?.company_id) !== String(companyIdRef.current)) return;
          if (!p?.action || !p?.data) return;
          priorityRef.current(p.action, p.data);
        })
      );

      // ─── jobstatus_update — company status dropdown list changed ─────────
      cleanupFns.push(
        onSocketEvent("jobstatus_update", (payload: unknown) => {
          const p = payload as JobStatusUpdatePayload;
          if (String(p?.company_id) !== String(companyIdRef.current)) return;
          if (!p?.action || !p?.data) return;
          jobStatusRef.current(p.action, p.data);
        })
      );

      // ─── project_update — project created/due_date changed ──────────────
      cleanupFns.push(
        onSocketEvent("project_update", (payload: unknown) => {
          const p = payload as { company_id?: number; action?: string; data?: any };
          if (String(p?.company_id) !== String(companyIdRef.current)) return;
          // Any project change triggers task refetch (tasks may have project_id)
          fetchRef.current(companyIdRef.current!, { silent: true });
        })
      );

      // ─── user_update — user directory changed ────────────────────────────
      cleanupFns.push(
        onSocketEvent("user_update", (payload: unknown) => {
          const p = payload as UserUpdatePayload;
          if (String(p?.company_id) !== String(companyIdRef.current)) return;
          fetchRef.current(companyIdRef.current!, { silent: true });
        })
      );

      // ─── task_scheduling_settings_update — scheduling config changed ─────
      cleanupFns.push(
        onSocketEvent("task_scheduling_settings_update", (payload: unknown) => {
          const p = payload as { company_id?: number };
          if (String(p?.company_id) !== String(companyIdRef.current)) return;
          // Scheduling settings changed — refetch tasks to pick up any schedule changes
          fetchRef.current(companyIdRef.current!, { silent: true });
        })
      );
    }

    // Try to register immediately
    registerListeners();

    // If socket wasn't available yet, wait for connect event and register then
    const cleanupConnect = onSocketEvent("connect", () => {
      registerListeners();
    });

    // Also ensure socket is connected (connectSocket is idempotent)
    connectSocket().catch(() => {});

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
      cleanupConnect();
    };
  }, [companyId]);
}
