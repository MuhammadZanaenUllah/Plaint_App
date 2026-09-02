import { ApiResponse } from "@/types/api.types";
import {
  AddDependencyRequest,
  AddNoteRequest,
  ApproveTaskRequest,
  CreateTaskRequest,
  DeleteAttachmentRequest,
  DeleteNoteRequest,
  DependencyData,
  ExtendDelayedRequest,
  MentionUser,
  NoteReactionRequest,
  PinNoteRequest,
  RecalculateScheduleRequest,
  RejectTaskRequest,
  RemoveDependencyRequest,
  ReopenTaskRequest,
  ReorderCriticalRequest,
  ReorderCriticalResponse,
  RescheduleReopenedRequest,
  TaskFilter,
  TaskListResponse,
  TaskNote,
  UpdateAssigneeRequest,
  UpdateDueDateRequest,
  UpdateNoteRequest,
  UpdateProjectRequest,
  UpdateTaskRequest,
  UpdateTaskStatusRequest,
  ViewTaskData,
} from "@/types/task.types";
import { File } from "expo-file-system";
import { apiDelete, apiGet, apiPost, apiUpload } from "./client";

export async function getAllTasks(
  companyId: number,
  params?: { skipTasks?: boolean },
): Promise<ApiResponse<TaskListResponse>> {
  const query: Record<string, any> = { company_id: companyId };
  if (params?.skipTasks) query.skipTasks = "true";
  return apiGet<ApiResponse<TaskListResponse>>("/tasks/all", query);
}

export async function getDueTodayTasks(
  companyId: number,
): Promise<ApiResponse<TaskListResponse>> {
  return apiGet<ApiResponse<TaskListResponse>>("/tasks/duetoday", {
    company_id: companyId,
  });
}

export async function getFilteredTasks(
  companyId: number,
  filter: TaskFilter,
): Promise<ApiResponse<TaskListResponse>> {
  return apiGet<ApiResponse<TaskListResponse>>("/tasks/filter", {
    company_id: companyId,
    filter,
  });
}

export async function viewTask(
  taskId: number,
  companyId: number,
): Promise<ApiResponse<ViewTaskData>> {
  console.log(`[TaskDetail API] ---> Sending POST /tasks/view/${taskId}`, {
    company_id: companyId,
  });
  const res = await apiPost<ApiResponse<ViewTaskData>>(`/tasks/view/${taskId}`, {
    company_id: companyId,
  });
  console.log(
    `[TaskDetail API] <--- Received response for /tasks/view/${taskId}:`,
    JSON.stringify(
      {
        taskId,
        effort_hours: res?.data?.task?.effort_hours,
        effort_unit: res?.data?.task?.effort_unit,
        start_date: res?.data?.task?.start_date,
        due_date: res?.data?.task?.due_date,
        effort_logs: (res?.data?.task as any)?.effort_logs,
        full_task: res?.data?.task,
      },
      null,
      2,
    ),
  );
  return res;
}

export async function createTask(
  data: CreateTaskRequest,
): Promise<ApiResponse<{ id: number }>> {
  console.log(
    `[CreateTask API] ---> Sending POST /tasks/create with payload:`,
    JSON.stringify(data, null, 2),
  );
  const res = await apiPost<ApiResponse<{ id: number }>>("/tasks/create", data);
  console.log(
    `[CreateTask API] <--- Received response from /tasks/create:`,
    JSON.stringify(res, null, 2),
  );
  return res;
}

export async function createSubtask(
  parentId: number,
  data: CreateTaskRequest,
): Promise<ApiResponse<{ id: number }>> {
  console.log(
    `[CreateSubtask API] ---> Sending POST /tasks/createsubtask/${parentId} with payload:`,
    JSON.stringify(data, null, 2),
  );
  const res = await apiPost<ApiResponse<{ id: number }>>(
    `/tasks/createsubtask/${parentId}`,
    data,
  );
  console.log(
    `[CreateSubtask API] <--- Received response from /tasks/createsubtask/${parentId}:`,
    JSON.stringify(res, null, 2),
  );
  return res;
}

export async function updateTask(
  taskId: number,
  data: UpdateTaskRequest,
): Promise<ApiResponse<string>> {
  console.log(
    `[UpdateTask API] ---> Sending POST /tasks/update/${taskId} with payload:`,
    JSON.stringify(data, null, 2),
  );
  const res = await apiPost<ApiResponse<string>>(`/tasks/update/${taskId}`, data);
  console.log(
    `[UpdateTask API] <--- Received response from /tasks/update/${taskId}:`,
    JSON.stringify(res, null, 2),
  );
  return res;
}

export async function updateTaskStatus(
  taskId: number,
  data: UpdateTaskStatusRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(
    `/tasks/updatetaskstatus/${taskId}`,
    data,
  );
}

export async function reassignTask(
  taskId: number,
  data: UpdateAssigneeRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/updateasignedto/${taskId}`, data);
}

export async function deleteTask(taskId: number): Promise<ApiResponse<string>> {
  return apiDelete<ApiResponse<string>>(`/tasks/${taskId}`);
}

export async function approveTask(
  taskId: number,
  data: ApproveTaskRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/approve/${taskId}`, data);
}

export async function rejectTask(
  taskId: number,
  data: RejectTaskRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/reject/${taskId}`, data);
}

export async function updateTaskDueDate(
  taskId: number,
  data: UpdateDueDateRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(
    `/tasks/updatetaskduedate/${taskId}`,
    data,
  );
}

export async function extendDelayedTask(
  taskId: number,
  data: ExtendDelayedRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/extend-delayed/${taskId}`, data);
}

export async function updateTaskProject(
  taskId: number,
  data: UpdateProjectRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(
    `/tasks/updatetaskproject/${taskId}`,
    data,
  );
}

export async function updateLeadSource(
  taskId: number,
  data: { source: string; company_id: number; company_identifier: string },
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(
    `/tasks/updateleadsource/${taskId}`,
    data,
  );
}

export async function recalculateSchedule(
  taskId: number,
  data: RecalculateScheduleRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/recalculate/${taskId}`, data);
}

export async function getDependencies(
  taskId: number,
  companyId: number,
): Promise<ApiResponse<DependencyData[]>> {
  return apiGet<ApiResponse<DependencyData[]>>(
    `/tasks/dependencies/${taskId}`,
    { company_id: companyId },
  );
}

export async function addDependency(
  data: AddDependencyRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>("/tasks/dependencies/add", data);
}

export async function removeDependency(
  data: RemoveDependencyRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>("/tasks/dependencies/remove", data);
}

export async function reorderCritical(
  data: ReorderCriticalRequest,
): Promise<ApiResponse<ReorderCriticalResponse>> {
  return apiPost<ApiResponse<ReorderCriticalResponse>>(
    "/tasks/reorder-critical",
    data,
  );
}

export async function rescheduleReopened(
  taskId: number,
  data: RescheduleReopenedRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(
    `/tasks/reschedule-reopened/${taskId}`,
    data,
  );
}

export async function reopenTask(
  taskId: number,
  data: ReopenTaskRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/reopen/${taskId}`, data);
}

export async function migratePriorities(
  companyId: number,
): Promise<ApiResponse<any>> {
  return apiPost<ApiResponse<any>>("/tasks/migrate-priorities", {
    company_id: companyId,
  });
}

export async function migrateEffortToMinutes(
  companyId: number,
): Promise<ApiResponse<any>> {
  return apiPost<ApiResponse<any>>("/tasks/migrate-effort-to-minutes", {
    company_id: companyId,
  });
}

export async function addNote(
  taskId: number,
  data: AddNoteRequest,
  file?: File | { uri: string; name: string; type: string },
): Promise<ApiResponse<string>> {
  const formData = new FormData();
  formData.append("notes", data.notes);
  formData.append("company_id", String(data.company_id));
  formData.append("company_identifier", data.company_identifier);
  if (data.reply_to) {
    formData.append("reply_to", JSON.stringify(data.reply_to));
  }
  if (data.mentions && data.mentions.length > 0) {
    formData.append("mentions", JSON.stringify(data.mentions));
  }
  if (file) {
    formData.append("file", file instanceof File ? file : new File(file.uri));
  }
  return apiUpload<ApiResponse<string>>(`/tasks/addnote/${taskId}`, formData);
}

export async function getMentionUsers(
  companyId: number,
): Promise<ApiResponse<{ user: MentionUser[] }>> {
  return apiGet<ApiResponse<{ user: MentionUser[] }>>("/user/note-mentions", {
    company_id: companyId,
  });
}

export async function getTaskNotes(
  taskId: number,
  companyId?: number,
  companyIdentifier?: string,
): Promise<ApiResponse<TaskNote[]>> {
  const body: Record<string, any> = {};
  if (companyId !== undefined) {
    body.company_id = companyId;
  }
  if (companyIdentifier !== undefined) {
    body.company_identifier = companyIdentifier;
  }
  return apiPost<ApiResponse<TaskNote[]>>(
    `/tasks/showtasknote/${taskId}`,
    body,
  );
}

export async function updateNote(
  noteId: number,
  data: UpdateNoteRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/updatenote/${noteId}`, data);
}

export async function pinNote(
  noteId: number,
  data: PinNoteRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/updatenotepin/${noteId}`, data);
}

export async function deleteNote(
  noteId: number,
  data: DeleteNoteRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(`/tasks/deletenote/${noteId}`, data);
}

export async function updateNoteReaction(
  noteId: number,
  data: NoteReactionRequest,
): Promise<
  ApiResponse<{
    reactions: { user_id: number; user_name: string; emoji: string }[];
  }>
> {
  return apiPost<
    ApiResponse<{
      reactions: { user_id: number; user_name: string; emoji: string }[];
    }>
  >(`/tasks/updatenotereaction/${noteId}`, data);
}

export async function uploadAttachment(
  taskId: number,
  formData: FormData,
): Promise<ApiResponse<{ id: number; attachment_file: string }>> {
  return apiUpload<ApiResponse<{ id: number; attachment_file: string }>>(
    `/tasks/attachments/${taskId}`,
    formData,
  );
}

export async function deleteAttachment(
  attachmentId: number,
  data: DeleteAttachmentRequest,
): Promise<ApiResponse<string>> {
  return apiPost<ApiResponse<string>>(
    `/tasks/attachmentdelete/${attachmentId}`,
    data,
  );
}
