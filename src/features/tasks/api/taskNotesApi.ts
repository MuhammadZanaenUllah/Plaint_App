// Task notes, mentions and comment reactions (contract §11).
// Every function returns ApiResult<T>.

import { File } from "expo-file-system";
import {
  apiGetWithStatus,
  apiPostWithStatus,
  apiUploadWithStatus,
} from "@/services/api/client";
import type {
  AddNoteRequest,
  DeleteNoteRequest,
  MentionUser,
  NoteReactionRequest,
  PinNoteRequest,
  TaskNote,
  UpdateNoteRequest,
} from "../types/task.types";
import {
  TASK_REQUEST_TIMEOUT_MS,
  TASK_UPLOAD_TIMEOUT_MS,
} from "../constants/taskConstants";
import { normalizeApiResponse, successResult, type ApiResult } from "./apiResult";

async function getResult<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<ApiResult<T>> {
  const response = await apiGetWithStatus<T>(path, params, {
    timeoutMs: TASK_REQUEST_TIMEOUT_MS,
  });
  return normalizeApiResponse<T>(response.body, response.status);
}

async function postResult<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  const response = await apiPostWithStatus<T>(path, body, false, {
    timeoutMs: TASK_REQUEST_TIMEOUT_MS,
  });
  return normalizeApiResponse<T>(response.body, response.status);
}

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

  const response = await apiUploadWithStatus<unknown>(
    `/tasks/addnote/${taskId}`,
    formData,
    { timeoutMs: TASK_UPLOAD_TIMEOUT_MS },
  );
  return normalizeApiResponse<string>(response.body, response.status);
}

export async function getTaskNotes(
  taskId: number,
  companyId?: number,
  companyIdentifier?: string,
): Promise<ApiResult<TaskNote[]>> {
  const body: Record<string, unknown> = {};
  if (companyId !== undefined) body.company_id = companyId;
  if (companyIdentifier !== undefined) body.company_identifier = companyIdentifier;

  return postResult<TaskNote[]>(`/tasks/showtasknote/${taskId}`, body);
}

export async function updateNote(
  noteId: number,
  data: UpdateNoteRequest,
): Promise<ApiResult<string>> {
  return postResult<string>(`/tasks/updatenote/${noteId}`, data);
}

/** The backend treats this as a toggle; callers must pass the intended value. */
export async function pinNote(
  noteId: number,
  data: PinNoteRequest,
): Promise<ApiResult<string>> {
  return postResult<string>(`/tasks/updatenotepin/${noteId}`, data);
}

export async function deleteNote(
  noteId: number,
  data: DeleteNoteRequest,
): Promise<ApiResult<string>> {
  return postResult<string>(`/tasks/deletenote/${noteId}`, data);
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
  const response = await apiPostWithStatus<unknown>(
    `/tasks/updatenotereaction/${noteId}`,
    data,
    false,
    { timeoutMs: TASK_REQUEST_TIMEOUT_MS },
  );
  const normalized = normalizeApiResponse<string>(response.body, response.status);
  if (!normalized.ok) return normalized;

  const raw = response.body as Record<string, unknown> | null;
  return successResult(
    {
      message: normalized.data ?? "Reaction updated",
      reactions: Array.isArray(raw?.reactions)
        ? (raw.reactions as { user_id: number; user_name: string; emoji: string }[])
        : [],
    },
    response.body,
  );
}

export async function getMentionUsers(companyId: number): Promise<ApiResult<{ user: MentionUser[] }>> {
  return getResult<{ user: MentionUser[] }>("/user/note-mentions", {
    company_id: companyId,
  });
}
