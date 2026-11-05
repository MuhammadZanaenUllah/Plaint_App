// Project/Sprint store scaffolding. This lives under features/tasks/store for
// now because the plan lists it as a shared Task Module store; Phase 8 can move
// or re-export it from features/projects/store.

import { create } from "zustand";
import {
  createProject as createProjectApi,
  deleteProjectAttachment as deleteProjectAttachmentApi,
  getAllProjects,
  getProjectDetail,
  getProjectUsers,
  updateProject as updateProjectApi,
  uploadProjectAttachment as uploadProjectAttachmentApi,
} from "@/features/projects/api/projectsApi";
import {
  createSprint as createSprintApi,
  deleteSprint as deleteSprintApi,
  getSprints,
  updateSprint as updateSprintApi,
} from "@/features/projects/api/sprintsApi";
import type { ApiResult } from "@/features/tasks/api/apiResult";
import type {
  CreateProjectPayload,
  ProjectDetailData,
  ProjectEntity,
  ProjectUser,
  Sprint,
  SprintCreatePayload,
  SprintUpdatePayload,
  UpdateProjectRequest,
} from "@/features/projects/types/project.types";

type SprintContext = { companyId: number; projectId: number };

export type ProjectsState = {
  projects: ProjectEntity[];
  projectDetail: ProjectDetailData | null;
  sprints: Sprint[];
  sprintsProjectId: number | null;
  projectUsers: ProjectUser[];
  assignableProjects: ProjectEntity[];
  assignableProjectsLoading: boolean;
  assignableProjectsError: string | null;
  assignmentSprints: Sprint[];
  assignmentSprintsProjectId: number | null;
  assignmentSprintsLoading: boolean;
  assignmentSprintsError: string | null;
  isLoading: boolean;
  error: string | null;

  loadProjects: (companyId: number, options?: { scope?: "all"; lite?: boolean }) => Promise<void>;
  loadProjectDetail: (projectId: number) => Promise<void>;
  loadSprints: (companyId: number, projectId: number) => Promise<void>;
  loadProjectUsers: (companyId: number) => Promise<void>;
  loadAssignableProjects: (companyId: number) => Promise<ProjectEntity[] | null>;
  loadAssignmentSprints: (companyId: number, projectId: number) => Promise<Sprint[] | null>;
  createProject: (
    payload: CreateProjectPayload,
  ) => Promise<ApiResult<{ id: number }>>;
  updateProject: (
    projectId: number,
    payload: UpdateProjectRequest,
  ) => Promise<ApiResult<string>>;
  createSprint: (payload: SprintCreatePayload) => Promise<ApiResult<Sprint>>;
  updateSprint: (
    sprintId: number,
    payload: SprintUpdatePayload,
    context: SprintContext,
  ) => Promise<ApiResult<Sprint>>;
  deleteSprint: (
    sprintId: number,
    context: SprintContext,
  ) => Promise<ApiResult<string>>;
  uploadAttachment: (
    projectId: number,
    formData: FormData,
  ) => Promise<ApiResult<{ id?: number; attachment?: string }>>;
  deleteAttachment: (attachmentId: number) => Promise<ApiResult<string>>;
  clearDetail: () => void;
  reset: () => void;
};

const initialState = {
  projects: [] as ProjectEntity[],
  projectDetail: null as ProjectDetailData | null,
  sprints: [] as Sprint[],
  sprintsProjectId: null as number | null,
  projectUsers: [] as ProjectUser[],
  assignableProjects: [] as ProjectEntity[],
  assignableProjectsLoading: false,
  assignableProjectsError: null as string | null,
  assignmentSprints: [] as Sprint[],
  assignmentSprintsProjectId: null as number | null,
  assignmentSprintsLoading: false,
  assignmentSprintsError: null as string | null,
  isLoading: false,
  error: null as string | null,
};

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  ...initialState,

  loadProjects: async (companyId, options = {}) => {
    set({ isLoading: true, error: null });
    const result = await getAllProjects(companyId, options);
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set({ projects: result.data, isLoading: false });
  },

  loadProjectDetail: async (projectId) => {
    set({ isLoading: true, error: null });
    const result = await getProjectDetail(projectId);
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set({ projectDetail: result.data.project, isLoading: false });
  },

  loadSprints: async (companyId, projectId) => {
    set({ isLoading: true, error: null });
    const result = await getSprints(companyId, projectId);
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set({ sprints: result.data, sprintsProjectId: projectId, isLoading: false });
  },

  loadProjectUsers: async (companyId) => {
    const result = await getProjectUsers(companyId);
    if (!result.ok) {
      set({ error: result.message });
      return;
    }
    set({ projectUsers: result.data });
  },

  loadAssignableProjects: async (companyId) => {
    set({ assignableProjectsLoading: true, assignableProjectsError: null });
    const result = await getAllProjects(companyId, { scope: "all", lite: true });
    if (!result.ok) {
      set({
        assignableProjectsLoading: false,
        assignableProjectsError: result.message,
      });
      return null;
    }
    set({
      assignableProjects: result.data,
      assignableProjectsLoading: false,
    });
    return result.data;
  },

  loadAssignmentSprints: async (companyId, projectId) => {
    set({
      assignmentSprintsLoading: true,
      assignmentSprintsError: null,
      assignmentSprintsProjectId: projectId,
    });
    const result = await getSprints(companyId, projectId);
    if (!result.ok) {
      set({
        assignmentSprintsLoading: false,
        assignmentSprintsError: result.message,
      });
      return null;
    }
    set({
      assignmentSprints: result.data,
      assignmentSprintsLoading: false,
    });
    return result.data;
  },

  createProject: async (payload) => {
    const result = await createProjectApi(payload);
    if (result.ok) {
      await get().loadProjects(payload.company_id);
    }
    return result;
  },

  updateProject: async (projectId, payload) => {
    const result = await updateProjectApi(projectId, payload);
    if (result.ok) {
      if (payload.company_id) await get().loadProjects(payload.company_id);
      await get().loadProjectDetail(projectId);
    }
    return result;
  },

  createSprint: async (payload) => {
    const result = await createSprintApi(payload);
    if (result.ok) {
      await get().loadSprints(payload.company_id, payload.project_id);
    }
    return result;
  },

  updateSprint: async (sprintId, payload, context) => {
    const result = await updateSprintApi(sprintId, payload);
    if (result.ok) {
      await get().loadSprints(context.companyId, context.projectId);
    }
    return result;
  },

  deleteSprint: async (sprintId, context) => {
    const result = await deleteSprintApi(sprintId);
    if (result.ok) {
      await Promise.all([
        get().loadSprints(context.companyId, context.projectId),
        get().loadProjectDetail(context.projectId),
      ]);
    }
    return result;
  },

  uploadAttachment: async (projectId, formData) => {
    const result = await uploadProjectAttachmentApi(projectId, formData);
    if (result.ok) await get().loadProjectDetail(projectId);
    return result;
  },

  deleteAttachment: async (attachmentId) => {
    return deleteProjectAttachmentApi(attachmentId);
  },

  clearDetail: () =>
    set({ projectDetail: null, sprints: [], sprintsProjectId: null }),
  reset: () => set({ ...initialState }),
}));

export const projectsStore = useProjectsStore;
