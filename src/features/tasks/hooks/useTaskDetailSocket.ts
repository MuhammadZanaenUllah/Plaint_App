// Keeps the open task detail sheet in sync with task_update events.

import { onSocketEvent } from "@/services/socket/socketService";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { sameNumericId } from "../utils/realtime";

type Options = {
  visible: boolean;
  taskId?: number | null;
  companyId: number;
  onReloadDetail: () => void;
  onReloadNotes: () => void;
  onClose: () => void;
};

const NOTE_ACTIONS = new Set([
  "add_note",
  "update_note",
  "delete_note",
  "update_note_pin",
  "update_note_reaction",
  "add_attachment",
  "delete_attachment",
]);

type Envelope = {
  company_id?: number | string;
  action?: string;
  data?: Record<string, unknown>;
};

export function useTaskDetailSocket({
  visible,
  taskId,
  companyId,
  onReloadDetail,
  onReloadNotes,
  onClose,
}: Options): void {
  const detailRef = useRef(onReloadDetail);
  const notesRef = useRef(onReloadNotes);
  const closeRef = useRef(onClose);

  useEffect(() => {
    detailRef.current = onReloadDetail;
  }, [onReloadDetail]);
  useEffect(() => {
    notesRef.current = onReloadNotes;
  }, [onReloadNotes]);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible || !taskId || !companyId) return;

    const cleanupTask = onSocketEvent("task_update", (payload: unknown) => {
      const p = payload as Envelope;
      if (!sameNumericId(p.company_id, companyId)) return;
      if (!p.action) return;

      const data = p.data ?? {};
      const eventTaskId = Number(data.task_id ?? data.id);
      if (!sameNumericId(eventTaskId, taskId)) return;

      if (p.action === "delete") {
        closeRef.current();
        return;
      }

      if (NOTE_ACTIONS.has(p.action)) {
        notesRef.current();
      }
      detailRef.current();
    });

    // Socket.IO reconnects on the same instance, so the task listener stays
    // registered; resync the open detail explicitly after reconnect.
    const cleanupConnect = onSocketEvent("connect", () => {
      detailRef.current();
    });

    let appState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      const wasBackgrounded =
        appState === "background" || appState === "inactive";
      appState = next;
      if (next === "active" && wasBackgrounded) {
        detailRef.current();
      }
    });

    return () => {
      cleanupTask();
      cleanupConnect();
      appStateSubscription.remove();
    };
  }, [companyId, taskId, visible]);
}
