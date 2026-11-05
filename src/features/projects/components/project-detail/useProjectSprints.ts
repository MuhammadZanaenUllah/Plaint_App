import { useProjectsStore } from "@/features/projects/store/projectsStore";
import type {
  ProjectDetailData,
  Sprint,
} from "@/features/projects/types/project.types";
import {
  validateSprint,
  validateSprintDateForTasks,
} from "@/features/projects/utils/projectValidation";
import { showError, showSuccess } from "@/utils/toast";
import { Alert } from "react-native";
import { useCallback, useMemo, useState } from "react";

type Options = {
  companyId: number;
  companyIdentifier: string;
  userId: number;
  project: ProjectDetailData | null;
  sprints: Sprint[];
};

type ModalState =
  | { mode: "create"; sprint: null }
  | { mode: "date"; sprint: Sprint }
  | null;

export function useProjectSprints({
  companyId,
  companyIdentifier,
  userId,
  project,
  sprints,
}: Options) {
  const createSprint = useProjectsStore((state) => state.createSprint);
  const updateSprint = useProjectsStore((state) => state.updateSprint);
  const deleteSprint = useProjectsStore((state) => state.deleteSprint);

  const [modal, setModal] = useState<ModalState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const closeModal = useCallback(() => {
    if (saving) return;
    setModal(null);
    setError(null);
  }, [saving]);

  const openCreate = useCallback(() => {
    setError(null);
    setModal({ mode: "create", sprint: null });
  }, []);

  const openDate = useCallback((sprint: Sprint) => {
    setError(null);
    setModal({ mode: "date", sprint });
  }, []);

  const submit = useCallback(
    async (values: { name: string; dueDate: string }) => {
      if (!project?.id || !companyId || saving) return;

      if (modal?.mode === "create") {
        const validation = validateSprint({
          name: values.name,
          dueDate: values.dueDate,
          projectDueDate: project.due_date,
        });
        if (!validation.valid) {
          setError(Object.values(validation.errors)[0] ?? "Invalid sprint.");
          return;
        }

        setSaving(true);
        setError(null);
        try {
          const result = await createSprint({
            name: values.name.trim(),
            due_date: values.dueDate,
            project_id: project.id,
            company_id: companyId,
            company_identifier: companyIdentifier,
            created_by: userId,
          });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          showSuccess("Success", "Sprint created!");
          setModal(null);
        } finally {
          setSaving(false);
        }
        return;
      }

      if (modal?.mode !== "date") return;
      const sprint = modal.sprint;
      const bounds = validateSprint({
        name: sprint.name,
        dueDate: values.dueDate,
        projectDueDate: project.due_date,
      });
      if (!bounds.valid) {
        setError(Object.values(bounds.errors)[0] ?? "Invalid sprint date.");
        return;
      }

      const sprintTasks = (project.tasks ?? []).filter(
        (task) => Number(task.sprint_id) === Number(sprint.id),
      );
      const validation = validateSprintDateForTasks(
        values.dueDate,
        sprintTasks.map((task) => task.due_date),
      );
      if (!validation.valid) {
        setError(Object.values(validation.errors)[0] ?? "Invalid sprint date.");
        return;
      }

      setSaving(true);
      setError(null);
      try {
        const result = await updateSprint(
          sprint.id,
          { due_date: values.dueDate },
          { companyId, projectId: project.id },
        );
        if (!result.ok) {
          setError(result.message);
          return;
        }
        showSuccess("Success", "Sprint date updated.");
        setModal(null);
      } finally {
        setSaving(false);
      }
    },
    [
      companyId,
      companyIdentifier,
      createSprint,
      modal,
      project,
      saving,
      updateSprint,
      userId,
    ],
  );

  const requestDelete = useCallback(
    (sprint: Sprint) => {
      if (!project?.id || !companyId || deletingId !== null) return;
      Alert.alert(
        "Delete Sprint",
        "Are you sure? Tasks in this sprint will be moved to the general project pool.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setDeletingId(sprint.id);
              try {
                const result = await deleteSprint(sprint.id, {
                  companyId,
                  projectId: project.id,
                });
                if (!result.ok) {
                  showError("Delete Failed", result.message);
                  return;
                }
                showSuccess("Success", "Sprint deleted.");
              } finally {
                setDeletingId(null);
              }
            },
          },
        ],
      );
    },
    [companyId, deleteSprint, deletingId, project?.id],
  );

  const modalProps = useMemo(
    () => ({
      visible: modal !== null,
      mode: modal?.mode ?? ("create" as const),
      sprintName: modal?.sprint?.name,
      initialDueDate: modal?.sprint?.due_date ?? null,
      error,
      saving,
      onClose: closeModal,
      onSubmit: submit,
    }),
    [closeModal, error, modal, saving, submit],
  );

  return {
    createModalProps: modalProps,
    openCreate,
    openDate,
    requestDelete,
    deletingId,
    sprintCount: sprints.length,
  };
}
