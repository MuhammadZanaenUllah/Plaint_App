import type { TaskRowProps } from "@/components/TaskRow";
import { useProjectsStore } from "@/features/projects/store/projectsStore";
import type {
  ProjectEntity,
  Sprint,
} from "@/features/projects/types/project.types";
import { validateSprintAssignment } from "@/features/projects/utils/projectValidation";
import { showError, showSuccess } from "@/utils/toast";
import { useCallback, useMemo, useRef, useState } from "react";
import { updateTaskProject } from "../api/taskApi";
import { useTasksStore } from "../store/tasksStore";
import { isCompletedStatus } from "../utils/taskStatus";

export type AssignmentProject = {
  id: number;
  name: string;
  status?: string;
  due_date?: string | null;
};

type Options = {
  companyId: number;
  companyIdentifier: string;
  canAssign: boolean;
  canCreateProject?: boolean;
  refresh?: () => void;
};

function isActiveSprint(sprint: Sprint): boolean {
  return String(sprint.status ?? "").toLowerCase() !== "completed";
}

export function useTaskProjectAssignment({
  companyId,
  companyIdentifier,
  canAssign,
  canCreateProject = false,
  refresh,
}: Options) {
  const assignableProjects = useProjectsStore(
    (state) => state.assignableProjects,
  );
  const assignableProjectsLoading = useProjectsStore(
    (state) => state.assignableProjectsLoading,
  );
  const assignableProjectsError = useProjectsStore(
    (state) => state.assignableProjectsError,
  );
  const assignmentSprints = useProjectsStore(
    (state) => state.assignmentSprints,
  );
  const assignmentSprintsProjectId = useProjectsStore(
    (state) => state.assignmentSprintsProjectId,
  );
  const assignmentSprintsLoading = useProjectsStore(
    (state) => state.assignmentSprintsLoading,
  );
  const assignmentSprintsError = useProjectsStore(
    (state) => state.assignmentSprintsError,
  );
  const loadAssignableProjects = useProjectsStore(
    (state) => state.loadAssignableProjects,
  );
  const loadAssignmentSprints = useProjectsStore(
    (state) => state.loadAssignmentSprints,
  );

  const [target, setTarget] = useState<TaskRowProps | null>(null);
  const targetRef = useRef<TaskRowProps | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [sprintPickerOpen, setSprintPickerOpen] = useState(false);
  const [selectedProject, setSelectedProject] =
    useState<AssignmentProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [createProjectVisible, setCreateProjectVisible] = useState(false);

  const setTargetTask = useCallback((task: TaskRowProps | null) => {
    targetRef.current = task;
    setTarget(task);
  }, []);

  const openForTask = useCallback(
    (row: TaskRowProps) => {
      if (!canAssign) {
        showError(
          "Not Allowed",
          "You do not have permission to assign tasks to projects.",
        );
        return;
      }
      if (row._raw && row._raw.can_edit !== true) {
        showError("Not Allowed", "You cannot change this task's project.");
        return;
      }
      setTargetTask(row);
      setSelectedProject(null);
      setSubmissionError(null);
      setProjectPickerOpen(true);
      if (companyId) loadAssignableProjects(companyId).catch(() => {});
    },
    [canAssign, companyId, loadAssignableProjects, setTargetTask],
  );

  const openSprintForTask = useCallback(
    (row: TaskRowProps, project: AssignmentProject) => {
      if (!canAssign) {
        showError(
          "Not Allowed",
          "You do not have permission to assign tasks to sprints.",
        );
        return;
      }
      if (row._raw && row._raw.can_edit !== true) {
        showError("Not Allowed", "You cannot change this task's sprint.");
        return;
      }
      setTargetTask(row);
      setSelectedProject(project);
      setSubmissionError(null);
      setProjectPickerOpen(false);
      setSprintPickerOpen(true);
      if (companyId) {
        loadAssignmentSprints(companyId, project.id).catch(() => {});
      }
    },
    [canAssign, companyId, loadAssignmentSprints, setTargetTask],
  );

  const assign = useCallback(
    async (project: AssignmentProject, sprint: Sprint | null) => {
      const row = targetRef.current;
      const taskId = Number(row?.id ?? 0);
      if (!row?._raw || !taskId || !companyId || saving) return;

      if (sprint) {
        const deadline = validateSprintAssignment(
          sprint.due_date,
          row._raw.due_date,
        );
        if (!deadline.valid) {
          setSubmissionError(
            Object.values(deadline.errors)[0] ??
              "The task due date exceeds the sprint deadline.",
          );
          return;
        }
      }

      setSaving(true);
      setSubmissionError(null);
      try {
        const result = await updateTaskProject(taskId, {
          project_id: project.id,
          sprint_id: sprint ? sprint.id : null,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        if (!result.ok) {
          setSubmissionError(result.message);
          showError("Assignment Failed", result.message);
          return;
        }

        const status = String(row._raw.status ?? "");
        const onPlanningHold =
          (project.status === "Planning" || project.status === "On Hold") &&
          !isCompletedStatus(status) &&
          status !== "Abandoned";
        useTasksStore.getState().patchTask(taskId, {
          project_id: project.id,
          project_name: project.name,
          sprint_id: sprint ? sprint.id : null,
          sprint_name: sprint?.name ?? null,
          ...(onPlanningHold ? { status: "On-Hold" } : {}),
        });

        showSuccess(
          "Success",
          sprint ? "Project & Sprint assigned" : "Project assigned",
        );
        setProjectPickerOpen(false);
        setSprintPickerOpen(false);
        setTargetTask(null);
        setSelectedProject(null);

        const projects = useProjectsStore.getState();
        if (projects.projects.length > 0) {
          projects.loadProjects(companyId).catch(() => {});
        }
        refresh?.();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to assign the task to a project.";
        setSubmissionError(message);
        showError("Assignment Failed", message);
      } finally {
        setSaving(false);
      }
    },
    [
      companyId,
      companyIdentifier,
      refresh,
      saving,
      setTargetTask,
    ],
  );

  const selectProject = useCallback(
    async (project: ProjectEntity) => {
      setSelectedProject(project);
      setSubmissionError(null);
      setProjectPickerOpen(false);
      const sprints = await loadAssignmentSprints(companyId, project.id);
      if (!sprints) {
        setSubmissionError(
          useProjectsStore.getState().assignmentSprintsError ??
            "Could not load this project's sprints.",
        );
        setProjectPickerOpen(true);
        return;
      }
      const active = sprints.filter(isActiveSprint);
      if (active.length === 0) {
        await assign(project, null);
        return;
      }
      setSprintPickerOpen(true);
    },
    [assign, companyId, loadAssignmentSprints],
  );

  const selectSprint = useCallback(
    (sprint: Sprint | null) => {
      if (!selectedProject) return;
      assign(selectedProject, sprint).catch(() => {});
    },
    [assign, selectedProject],
  );

  const closeProjectPicker = useCallback(() => {
    if (saving) return;
    setProjectPickerOpen(false);
    setTargetTask(null);
    setSubmissionError(null);
  }, [saving, setTargetTask]);

  const closeSprintPicker = useCallback(() => {
    if (saving) return;
    setSprintPickerOpen(false);
    setTargetTask(null);
    setSelectedProject(null);
    setSubmissionError(null);
  }, [saving, setTargetTask]);

  const openCreateProject = useCallback(() => {
    if (!canCreateProject) return;
    setProjectPickerOpen(false);
    setSubmissionError(null);
    setCreateProjectVisible(true);
  }, [canCreateProject]);

  const closeCreateProject = useCallback(() => {
    setCreateProjectVisible(false);
    setTargetTask(null);
  }, [setTargetTask]);

  const handleProjectCreated = useCallback(
    async (projectId: number) => {
      setCreateProjectVisible(false);
      const projects = await loadAssignableProjects(companyId);
      const created =
        projects?.find((project) => Number(project.id) === projectId) ??
        ({
          id: projectId,
          name: `Project #${projectId}`,
          status: "Planning",
        } as ProjectEntity);
      await assign(created, null);
    },
    [assign, companyId, loadAssignableProjects],
  );

  const activeSprints = useMemo(
    () =>
      selectedProject &&
      assignmentSprintsProjectId === Number(selectedProject.id)
        ? assignmentSprints.filter(isActiveSprint)
        : [],
    [assignmentSprints, assignmentSprintsProjectId, selectedProject],
  );

  return {
    openForTask,
    openSprintForTask,
    projectPicker: {
      visible: projectPickerOpen,
      projects: assignableProjects,
      loading: assignableProjectsLoading,
      error: submissionError ?? assignableProjectsError,
      canCreateProject,
      onClose: closeProjectPicker,
      onSelect: (project: ProjectEntity) => {
        selectProject(project).catch(() => {});
      },
      onCreateProject: openCreateProject,
    },
    sprintPicker: {
      visible: sprintPickerOpen,
      projectName: selectedProject?.name ?? "Project",
      sprints: activeSprints,
      loading: assignmentSprintsLoading,
      error: submissionError ?? assignmentSprintsError,
      saving,
      onClose: closeSprintPicker,
      onSelect: selectSprint,
    },
    createProject: {
      visible: createProjectVisible,
      onClose: closeCreateProject,
      onCreated: (projectId: number) => {
        handleProjectCreated(projectId).catch(() => {});
      },
    },
    assigning: saving,
    targetTask: target,
  };
}
