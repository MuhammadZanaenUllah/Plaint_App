// Task notes, mentions and comment reactions (contract §11).
// Every function returns ApiResult<T>.

import { File } from "expo-file-system";
import { apiGet, apiPost, apiUpload } from "@/services/api/client";
import type {
  AddNoteRequest,
  DeleteNoteRequest,
  MentionUser,
  NoteReactionRequest,
  PinNoteRequest,
  TaskNote,
  UpdateNoteRequest,
} from "../types/task.types";
import { normalizeApiResponse, successResult, type ApiResult } from "./apiResult";

export async function addNote(
  taskId: number,
  data: AddNoteRequest,
  file?: File | { uri: string; name: string; type: string },
): Promise<ApiResult<string>> {
  const formData = new FormData();
  formData.append("notes", data.notes);
  formData.append("company_id", String(data.company_id));
  formData.append("company_identifier", data.company_identifier);
  if (data.reply_to) formData.append("reply_to", JSON.stringify(data.reply_to));
  if (data.mentions?.length) formData.append("mentions", JSON.stringify(data.mentions));
  if (file) formData.append("file", file instanceof File ? file : new File(file.uri));

  const body = await apiUpload<unknown>(`/tasks/addnote/${taskId}`, formData);
  return normalizeApiResponse<string>(body);
}

export async function getTaskNotes(
  taskId: number,
  companyId?: number,
  companyIdentifier?: string,
): Promise<ApiResult<TaskNote[]>> {
  const body: Record<string, unknown> = {};
  if (companyId !== undefined) body.company_id = companyId;
  if (companyIdentifier !== undefined) body.company_identifier = companyIdentifier;

  const response = await apiPost<unknown>(`/tasks/showtasknote/${taskId}`, body);
  return normalizeApiResponse<TaskNote[]>(response);
}

export async function updateNote(
  noteId: number,
  data: UpdateNoteRequest,
): Promise<ApiResult<string>> {
  const body = await apiPost<unknown>(`/tasks/updatenote/${noteId}`, data);
  return normalizeApiResponse<string>(body);
}

/** The backend treats this as a toggle; callers must pass the intended value. */
export async function pinNote(
  noteId: number,
  data: PinNoteRequest,
): Promise<ApiResult<string>> {
  const body = await apiPost<unknown>(`/tasks/updatenotepin/${noteId}`, data);
  return normalizeApiResponse<string>(body);
}

export async function deleteNote(
  noteId: number,
  data: DeleteNoteRequest,
): Promise<ApiResult<string>> {
  const body = await apiPost<unknown>(`/tasks/deletenote/${noteId}`, data);
  return normalizeApiResponse<string>(body);
}

export async function updateNoteReaction(
  noteId: number,
  data: NoteReactionRequest,
): Promise<
  ApiResult<{
    message: string;
    reactions: { user_id: number; user_name: string; emoji: string }[];
  }>
> {
  const response = await apiPost<unknown>(`/tasks/updatenotereaction/${noteId}`, data);
  const normalized = normalizeApiResponse<string>(response);
  if (!normalized.ok) return normalized;

  const raw = response as Record<string, unknown> | null;
  return successResult(
    {
      message: normalized.data ?? "Reaction updated",
      reactions: Array.isArray(raw?.reactions)
        ? (raw.reactions as { user_id: number; user_name: string; emoji: string }[])
        : [],
    },
    response,
  );
}

export async function getMentionUsers(companyId: number): Promise<ApiResult<{ user: MentionUser[] }>> {
  const body = await apiGet<unknown>("/user/note-mentions", { company_id: companyId });
  return normalizeApiResponse<{ user: MentionUser[] }>(body);
}
