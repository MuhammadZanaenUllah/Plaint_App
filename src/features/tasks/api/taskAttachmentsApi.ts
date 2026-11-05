// Task attachment services (contract §11.3).
// The server may reject uploads with a 500 HTML page; normalizeApiResponse
// converts that into a generic ApiResult error.

import { apiPostWithStatus, apiUploadWithStatus } from "@/services/api/client";
import type { DeleteAttachmentRequest } from "../types/task.types";
import {
  TASK_REQUEST_TIMEOUT_MS,
  TASK_UPLOAD_TIMEOUT_MS,
} from "../constants/taskConstants";
import { normalizeApiResponse, type ApiResult } from "./apiResult";

export async function uploadAttachment(
  taskId: number,
  formData: FormData,
): Promise<ApiResult<{ id: number; attachment_file: string }>> {
  const response = await apiUploadWithStatus<unknown>(
    `/tasks/attachments/${taskId}`,
    formData,
    { timeoutMs: TASK_UPLOAD_TIMEOUT_MS },
  );
  return normalizeApiResponse<{ id: number; attachment_file: string }>(
    response.body,
    response.status,
  );
}

export async function deleteAttachment(
  attachmentId: number,
  data: DeleteAttachmentRequest,
): Promise<ApiResult<string>> {
  const response = await apiPostWithStatus<unknown>(
    `/tasks/attachmentdelete/${attachmentId}`,
    data,
    false,
    { timeoutMs: TASK_REQUEST_TIMEOUT_MS },
  );
  return normalizeApiResponse<string>(response.body, response.status);
}
