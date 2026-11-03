// Task attachment services (contract §11.3).
// The server may reject uploads with a 500 HTML page; normalizeApiResponse
// converts that into a generic ApiResult error.

import { apiPost, apiUpload } from "@/services/api/client";
import type { DeleteAttachmentRequest } from "../types/task.types";
import { normalizeApiResponse, type ApiResult } from "./apiResult";

export async function uploadAttachment(
  taskId: number,
  formData: FormData,
): Promise<ApiResult<{ id: number; attachment_file: string }>> {
  const body = await apiUpload<unknown>(`/tasks/attachments/${taskId}`, formData);
  return normalizeApiResponse<{ id: number; attachment_file: string }>(body);
}

export async function deleteAttachment(
  attachmentId: number,
  data: DeleteAttachmentRequest,
): Promise<ApiResult<string>> {
  const body = await apiPost<unknown>(`/tasks/attachmentdelete/${attachmentId}`, data);
  return normalizeApiResponse<string>(body);
}
