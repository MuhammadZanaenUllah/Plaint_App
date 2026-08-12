import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import * as chatService from "@/services/api/chat.service";
import { NotificationItem } from "@/types/chat.types";
import { extractErrorMessage } from "@/utils/errorHandler";
import { useAuth } from "@/hooks/useAuth";
import {
  connectSocket,
  onSocketEvent,
  type TaskUpdatePayload,
} from "@/services/socket/socketService";
import { showInfo } from "@/utils/toast";
import {
  extractMentionedUserIds,
  mentionMarkupToDisplay,
} from "@/utils/chatHelpers";

// ─── Actions ──────────────────────────────────────────────────────────────────

type NotificationAction =
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "LOAD_NOTIFICATIONS"; notifications: NotificationItem[] }
  | { type: "ADD_NOTIFICATION"; notification: NotificationItem }
  | { type: "MARK_READ"; id: number }
  | { type: "MARK_ALL_READ" }
  | { type: "LOGOUT" };

type NotificationState = {
  notifications: NotificationItem[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
};

const initialState: NotificationState = {
  notifications: [],
  loading: false,
  error: null,
  unreadCount: 0,
};

function notificationReducer(
  state: NotificationState,
  action: NotificationAction
): NotificationState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "LOAD_NOTIFICATIONS":
      return {
        ...state,
        notifications: action.notifications,
        unreadCount: action.notifications.filter((n) => n.readed === 0).length,
        loading: false,
        error: null,
      };
    case "ADD_NOTIFICATION": {
      const exists = state.notifications.some(
        (n) =>
          n.id === action.notification.id ||
          (action.notification.id < 0 &&
            n.id > 0 &&
            n.task_id === action.notification.task_id &&
            (n.title ?? "").toLowerCase().startsWith("mentioned you"))
      );
      if (exists) return state;
      const updated = [action.notification, ...state.notifications];
      return {
        ...state,
        notifications: updated,
        unreadCount: updated.filter((n) => n.readed === 0).length,
      };
    }
    case "MARK_READ": {
      const updated = state.notifications.map((n) =>
        n.id === action.id ? { ...n, readed: 1 } : n
      );
      return {
        ...state,
        notifications: updated,
        unreadCount: updated.filter((n) => n.readed === 0).length,
      };
    }
    case "MARK_ALL_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, readed: 1 })),
        unreadCount: 0,
      };
    case "LOGOUT":
      return initialState;
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

export type NotificationContextValue = {
  state: NotificationState;
  fetchNotifications: (companyId: number, includeRead?: boolean, silent?: boolean) => Promise<void>;
  markRead: (notificationId: number) => Promise<void>;
  markAllRead: (companyId: number) => Promise<void>;
  addNotification: (notification: NotificationItem) => void;
  logout: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(notificationReducer, initialState);

  const { state: authState } = useAuth();
  const currentUserId = authState?.user?.id ?? 0;
  const currentCompanyId = authState?.company?.company_id ?? 0;

  const fetchNotifications = useCallback(
    async (companyId: number, includeRead = false, silent = false) => {
      if (!silent) {
        dispatch({ type: "SET_LOADING", loading: true });
      }
      try {
        const res = await chatService.getNotifications(companyId, includeRead);
        if (res.Good) {
          dispatch({
            type: "LOAD_NOTIFICATIONS",
            notifications: res.data?.notifications ?? [],
          });
        } else {
          dispatch({ type: "SET_ERROR", error: "Failed to load notifications" });
        }
      } catch (error) {
        dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
      }
    },
    []
  );

  const addNotification = useCallback((notification: NotificationItem) => {
    dispatch({ type: "ADD_NOTIFICATION", notification });
  }, []);

  // ─── Live notifications via socket ──────────────────────────────────────
  // The `notification` socket event is scoped by the recipient user id
  // (payload: `{ assigned_to }`, possibly nested under `data`). On receipt we
  // silently refresh the list from REST so the bell badge and the inbox stay
  // in sync WITHOUT flashing the loading spinner (which would replace the
  // whole list on every event). Socket creation is idempotent, and
  // socketService queues this listener until the socket exists.
  //
  // The `task_update` listener mirrors the chat approach for mention pushes:
  // the backend's task-note mention detection depends on inline mention markup
  // (`@[Full Name](userId)`) in the note text, so when a note mentioning the
  // current user arrives we surface an in-app toast AND a local notification
  // row (typ `task_mention`) so it lands in the inbox Mentions tab immediately,
  // independent of whether the backend also created a notification row.
  useEffect(() => {
    if (!currentUserId) return;

    connectSocket().catch(() => {});

    const cleanupNotification = onSocketEvent("notification", (payload: unknown) => {
      const typed = payload as {
        assigned_to?: number;
        company_id?: number;
        data?: { assigned_to?: number; company_id?: number };
      };
      const assignedTo = typed.assigned_to ?? typed.data?.assigned_to;
      if (assignedTo !== undefined && String(assignedTo) !== String(currentUserId)) {
        return;
      }
      if (typed.company_id !== undefined && typed.company_id !== currentCompanyId) {
        return;
      }
      if (currentCompanyId) {
        fetchNotifications(currentCompanyId, true, true);
      }
    });

    const cleanupTaskUpdate = onSocketEvent("task_update", (payload: unknown) => {
      const p = payload as TaskUpdatePayload;
      if (!p?.action) return;
      if (String(p.company_id) !== String(currentCompanyId)) return;
      if (p.action !== "add_note" && p.action !== "update_note") return;

      const data = (p.data ?? {}) as Record<string, unknown>;
      const note =
        (data.note as Record<string, unknown> | undefined) ?? data;
      const notesText = (note.notes as string) ?? "";
      const mentionedIds = extractMentionedUserIds(notesText);
      if (!mentionedIds.includes(currentUserId)) return;

      const authorId = Number(note.user_id ?? data.user_id ?? 0);
      if (authorId === currentUserId) return;
      const authorName =
        (note.user_name as string) ||
        (data.user_name as string) ||
        "Someone";
      const taskId = Number(data.task_id ?? data.mod_id ?? 0);
      const noteId = Number(note.id ?? data.id ?? 0);
      const createdAt = (note.createdAt as string) || new Date().toISOString();
      const displayText = mentionMarkupToDisplay(notesText);

      showInfo(`${authorName} mentioned you`, displayText);
      addNotification({
        id: -Math.abs(noteId || Date.now()),
        title: "Mentioned you in a comment",
        task_id: taskId,
        lead_id: 0,
        created_by: authorId,
        company_id: Number(p.company_id),
        assigned_to: currentUserId,
        typ: "task_mention",
        identifier: "task",
        description: displayText,
        createdAt,
        readed: 0,
        assigned: {
          id: authorId,
          first_name: authorName,
          last_name: "",
          email: "",
          image: "",
        },
      });
    });

    return () => {
      cleanupNotification();
      cleanupTaskUpdate();
    };
  }, [currentUserId, currentCompanyId, fetchNotifications, addNotification]);

  const markRead = useCallback(async (notificationId: number) => {
    try {
      const res = await chatService.markNotificationRead(notificationId);
      if (res.Good) {
        dispatch({ type: "MARK_READ", id: notificationId });
      }
    } catch {
      // Silent fail
    }
  }, []);

  const markAllRead = useCallback(async (companyId: number) => {
    try {
      const res = await chatService.markAllNotificationsRead(companyId);
      if (res.Good) {
        dispatch({ type: "MARK_ALL_READ" });
      }
    } catch {
      // Silent fail
    }
  }, []);

  const logout = useCallback(() => {
    dispatch({ type: "LOGOUT" });
  }, []);

  const value: NotificationContextValue = useMemo(
    () => ({
      state,
      fetchNotifications,
      markRead,
      markAllRead,
      addNotification,
      logout,
    }),
    [
      state,
      fetchNotifications,
      markRead,
      markAllRead,
      addNotification,
      logout,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return ctx;
}
