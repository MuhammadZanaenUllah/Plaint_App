// Project/Sprint store. Each loader owns its own loading/error slice so the
// project detail, sprint section and owner picker cannot overwrite each other.

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
import { fromError, type ApiResult } from "@/features/tasks/api/apiResult";
import { listWithStaleRetry } from "@/features/tasks/utils/staleRetry";
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

  projectsLoading: boolean;
  projectsError: string | null;
  projectsStale: boolean;
  detailLoading: boolean;
  detailError: string | null;
  sprintsLoading: boolean;
  sprintsError: string | null;
  usersLoading: boolean;
  usersError: string | null;

  loadProjects: (
    companyId: number,
    options?: { scope?: "all"; lite?: boolean },
  ) => Promise<void>;
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
  projectsLoading: false,
  projectsError: null as string | null,
  projectsStale: false,
  detailLoading: false,
  detailError: null as string | null,
  sprintsLoading: false,
  sprintsError: null as string | null,
  usersLoading: false,
  usersError: null as string | null,
};

async function safeApi<T>(run: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try {
    return await run();
  } catch (error) {
    return fromError<T>(error);
  }
}

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  ...initialState,

  loadProjects: async (companyId, options = {}) => {
    set({ projectsLoading: true, projectsError: null });
    const result = await listWithStaleRetry((waitFresh) =>
      safeApi(() => getAllProjects(companyId, { ...options, waitFresh })),
    );
    if (!result.ok) {
      set({ projectsLoading: false, projectsError: result.message });
      return;
    }
    set({
      projects: result.data,
      projectsLoading: false,
      projectsError: null,
      projectsStale: !!result.stale,
    });
  },

  loadProjectDetail: async (projectId) => {
    set({ detailLoading: true, detailError: null });
    const result = await safeApi(() => getProjectDetail(projectId));
    if (!result.ok) {
      set({ detailLoading: false, detailError: result.message });
      return;
    }
    set({
      projectDetail: result.data.project,
      detailLoading: false,
      detailError: null,
    });
  },

  loadSprints: async (companyId, projectId) => {
    set({ sprintsLoading: true, sprintsError: null });
    const result = await safeApi(() => getSprints(companyId, projectId));
    if (!result.ok) {
      set({ sprintsLoading: false, sprintsError: result.message });
      return;
    }
    set({
      sprints: result.data,
      sprintsProjectId: projectId,
      sprintsLoading: false,
      sprintsError: null,
    });
  },

  loadProjectUsers: async (companyId) => {
    set({ usersLoading: true, usersError: null });
    const result = await safeApi(() => getProjectUsers(companyId));
    if (!result.ok) {
      set({ usersLoading: false, usersError: result.message });
      return;
    }
    set({ projectUsers: result.data, usersLoading: false, usersError: null });
  },

  loadAssignableProjects: async (companyId) => {
    set({ assignableProjectsLoading: true, assignableProjectsError: null });
    const result = await safeApi(() =>
      getAllProjects(companyId, { scope: "all", lite: true }),
    );
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
    const result = await safeApi(() => getSprints(companyId, projectId));
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
    const result = await safeApi(() => createProjectApi(payload));
    if (result.ok) {
      await get().loadProjects(payload.company_id);
    }
    return result;
  },

  updateProject: async (projectId, payload) => {
    const result = await safeApi(() => updateProjectApi(projectId, payload));
    if (result.ok) {
      if (payload.company_id) await get().loadProjects(payload.company_id);
      await get().loadProjectDetail(projectId);
    }
    return result;
  },

  createSprint: async (payload) => {
    const result = await safeApi(() => createSprintApi(payload));
    if (result.ok) {
      await get().loadSprints(payload.company_id, payload.project_id);
    }
    return result;
  },

  updateSprint: async (sprintId, payload, context) => {
    const result = await safeApi(() => updateSprintApi(sprintId, payload));
    if (result.ok) {
      await get().loadSprints(context.companyId, context.projectId);
    }
    return result;
  },

  deleteSprint: async (sprintId, context) => {
    const result = await safeApi(() => deleteSprintApi(sprintId));
    if (result.ok) {
      await Promise.all([
        get().loadSprints(context.companyId, context.projectId),
        get().loadProjectDetail(context.projectId),
      ]);
    }
    return result;
  },

  uploadAttachment: async (projectId, formData) => {
    const result = await safeApi(() => uploadProjectAttachmentApi(projectId, formData));
    if (result.ok) await get().loadProjectDetail(projectId);
    return result;
  },

  deleteAttachment: async (attachmentId) => {
    return safeApi(() => deleteProjectAttachmentApi(attachmentId));
  },

  clearDetail: () =>
    set({
      projectDetail: null,
      sprints: [],
      sprintsProjectId: null,
      detailLoading: false,
      detailError: null,
      sprintsLoading: false,
      sprintsError: null,
    }),
  reset: () => set({ ...initialState }),
}));

export const projectsStore = useProjectsStore;
