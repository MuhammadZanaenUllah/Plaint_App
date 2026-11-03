// Project/Sprint store scaffolding. This lives under features/tasks/store for
// now because the plan lists it as a shared Task Module store; Phase 8 can move
// or re-export it from features/projects/store.

import { create } from "zustand";
import {
  getAllProjects,
  getProjectDetail,
  getProjectUsers,
} from "@/features/projects/api/projectsApi";
import { getSprints } from "@/features/projects/api/sprintsApi";
import type {
  ProjectDetailData,
  ProjectEntity,
  ProjectUser,
  Sprint,
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

export const useProjectsStore = create<ProjectsState>()((set) => ({
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

  clearDetail: () => set({ projectDetail: null, sprints: [] }),
  reset: () => set({ ...initialState }),
}));

export const projectsStore = useProjectsStore;
