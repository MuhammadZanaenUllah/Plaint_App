import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import { extractErrorMessage } from "@/utils/errorHandler";
import { showError } from "@/utils/toast";
import { useCallback, useRef, useState } from "react";
import { useTasksStore } from "../store/tasksStore";
import type { CreateTaskResult } from "../types/task.types";
import { createTask as createTaskApi, uploadAttachment } from "../api/taskApi";
import { buildCreateTaskPayload } from "../components/create-task/createTaskPayload";
import type { CreateTaskFormState } from "../components/create-task/createTaskTypes";

type Options = {
  companyId: number;
  companyIdentifier: string;
  isAts: boolean;
  currentUserId: number;
};

export type CreateTaskSubmitResult = CreateTaskResult & {
  attachmentsFailed: { name: string; message: string }[];
};

export function buildAttachmentFormData(
  file: SelectedFile,
  company: { companyId: number; companyIdentifier: string },
): FormData {
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name || `file_${Date.now()}`,
    type: file.mimeType || "application/octet-stream",
  } as unknown as Blob);
  formData.append("company_id", String(company.companyId));
  formData.append("company_identifier", company.companyIdentifier);
  return formData;
}

/**
 * Owns the single-shot create/create-attachments/store-insert sequence.
 * Critical-conflict prompting stays in the modal because it needs the form UI.
 */
export function useCreateTaskSubmit({
  companyId,
  companyIdentifier,
  isAts,
  currentUserId,
}: Options) {
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (
      form: CreateTaskFormState,
      options: { bumpToFront?: boolean } = {},
    ): Promise<CreateTaskSubmitResult | null> => {
      if (submittingRef.current) return null;
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const payload = buildCreateTaskPayload(
          form,
          { companyId, companyIdentifier, isAts },
          options,
        );
        const result = await createTaskApi(payload);
        if (!result.ok) {
          showError("Create Failed", result.message);
          return null;
        }

        const created = result.data;
        const attachmentsFailed: { name: string; message: string }[] = [];
        for (const file of form.attachments) {
          const upload = await uploadAttachment(
            created.id,
            buildAttachmentFormData(file, { companyId, companyIdentifier }),
          );
          if (!upload.ok) {
            attachmentsFailed.push({ name: file.name, message: upload.message });
          }
        }

        if (attachmentsFailed.length > 0) {
          showError(
            "Attachment Upload Failed",
            attachmentsFailed
              .map((failure) => `Failed to upload "${failure.name}"`)
              .join("\n"),
          );
        }

        if (created.task) {
          useTasksStore.getState().applyCreatedTask(created.task, currentUserId);
        }

        return { ...created, attachmentsFailed };
      } catch (error) {
        showError("Create Failed", extractErrorMessage(error));
        return null;
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [companyId, companyIdentifier, currentUserId, isAts],
  );

  return { submit, submitting };
}
