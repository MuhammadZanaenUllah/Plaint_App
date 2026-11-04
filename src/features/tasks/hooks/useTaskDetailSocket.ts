// Keeps the open task detail sheet in sync with task_update events.

import { onSocketEvent } from "@/services/socket/socketService";
import { useEffect, useRef } from "react";

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

    return onSocketEvent("task_update", (payload: unknown) => {
      const p = payload as Envelope;
      if (Number(p.company_id) !== Number(companyId)) return;
      if (!p.action) return;

      const data = p.data ?? {};
      const eventTaskId = Number(data.task_id ?? data.id);
      if (!Number.isFinite(eventTaskId) || eventTaskId !== Number(taskId)) {
        return;
      }

      if (p.action === "delete") {
        closeRef.current();
        return;
      }

      if (NOTE_ACTIONS.has(p.action)) {
        notesRef.current();
      }
      detailRef.current();
    });
  }, [companyId, taskId, visible]);
}
