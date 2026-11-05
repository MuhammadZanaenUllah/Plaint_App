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
import { getSprints } from "@/features/projects/api/sprintsApi";
import type { ApiResult } from "@/features/tasks/api/apiResult";
import type {
  CreateProjectPayload,
  ProjectDetailData,
  ProjectEntity,
  ProjectUser,
  Sprint,
  UpdateProjectRequest,
} from "@/features/projects/types/project.types";

export type ProjectsState = {
  projects: ProjectEntity[];
  projectDetail: ProjectDetailData | null;
  sprints: Sprint[];
  projectUsers: ProjectUser[];
  isLoading: boolean;
  error: string | null;

  loadProjects: (companyId: number, options?: { scope?: "all"; lite?: boolean }) => Promise<void>;
  loadProjectDetail: (projectId: number) => Promise<void>;
  loadSprints: (companyId: number, projectId: number) => Promise<void>;
  loadProjectUsers: (companyId: number) => Promise<void>;
  createProject: (
    payload: CreateProjectPayload,
  ) => Promise<ApiResult<{ id: number }>>;
  updateProject: (
    projectId: number,
    payload: UpdateProjectRequest,
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
  projectUsers: [] as ProjectUser[],
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
    set({ sprints: result.data, isLoading: false });
  },

  loadProjectUsers: async (companyId) => {
    const result = await getProjectUsers(companyId);
    if (!result.ok) {
      set({ error: result.message });
      return;
    }
    set({ projectUsers: result.data });
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

  uploadAttachment: async (projectId, formData) => {
    const result = await uploadProjectAttachmentApi(projectId, formData);
    if (result.ok) await get().loadProjectDetail(projectId);
    return result;
  },

  deleteAttachment: async (attachmentId) => {
    return deleteProjectAttachmentApi(attachmentId);
  },

  clearDetail: () => set({ projectDetail: null, sprints: [] }),
  reset: () => set({ ...initialState }),
}));

export const projectsStore = useProjectsStore;
