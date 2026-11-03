// Project/Sprint store
// Phase 1 — Foundation
// Zustand store for projects and sprints, loaded alongside task state

import create from "zustand";
import { ProjectListItem, ProjectDetailData, SprintListItem } from "../projects/types/project.types";
import { parseApiResponse, extractError } from "../api/error-extractor";

interface ProjectsState {
  projects: ProjectListItem[];
  projectDetail: ProjectDetailData | null;
  sprints: SprintListItem[];
  isLoading: boolean;
  error?: string;
}

const initialState: ProjectsState = {
  projects: [],
  projectDetail: null,
  sprints: [],
  isLoading: false,
  error: undefined,
};

export type ProjectsStore = ReturnType<typeof projectsStore>;

export const projectsStore = create<ProjectsState>((set) => ({
  ...initialState,

  loadProjects: async (companyId: number) => {
    set({ isLoading: true, error: undefined });
    try {
      const projects = await apiGet<ProjectListItem[]>(`/projects?company_id=${companyId}`, {});
      const { body, good } = parseApiResponse(/* dummy */ {});
      set({ projects, isLoading: false });
    } catch (err: any) {
      set({ error: extractError(err.message), isLoading: false });
    }
  },

  loadProjectDetail: async (projectId: number) => {
    set({ isLoading: true, error: undefined });
    try {
      const detail = await apiGet<ProjectDetailData>(`/projects/detail/${projectId}`, {});
      set({ projectDetail: detail, isLoading: false });
    } catch (err: any) {
      set({ error: extractError(err.message), isLoading: false });
    }
  },

  loadSprints: async (companyId: number, projectId: number) => {
    set({ isLoading: true, error: undefined });
    try {
      const sprints = await apiGet<SprintListItem[]>(`/sprints?company_id=${companyId}&project_id=${projectId}`, {});
      set({ sprints, isLoading: false });
    } catch (err: any) {
      set({ error: extractError(err.message), isLoading: false });
    }
  },

  clearDetail: () => set({ projectDetail: null, isLoading: false }),
}));