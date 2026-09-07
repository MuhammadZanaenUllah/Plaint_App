import { useAuth } from "@/hooks/useAuth";
import * as projectService from "@/services/api/projects.service";
import {
  CreateProjectRequest,
  Project,
  ProjectUser,
} from "@/types/project.types";
import { extractErrorMessage } from "@/utils/errorHandler";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

type ProjectState = {
  projects: Project[];
  projectUsers: ProjectUser[];
  loading: boolean;
  creating: boolean;
  error: string | null;
};

type ProjectAction =
  | { type: "LOAD_PROJECTS"; projects: Project[] }
  | { type: "LOAD_PROJECT_USERS"; users: ProjectUser[] }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_CREATING"; creating: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "CREATE_PROJECT"; project: Project }
  | { type: "LOGOUT" };

const initialState: ProjectState = {
  projects: [],
  projectUsers: [],
  loading: false,
  creating: false,
  error: null,
};

function projectReducer(
  state: ProjectState,
  action: ProjectAction
): ProjectState {
  switch (action.type) {
    case "LOAD_PROJECTS":
      return { ...state, projects: action.projects, loading: false, error: null };
    case "LOAD_PROJECT_USERS":
      return { ...state, projectUsers: action.users, error: null };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_CREATING":
      return { ...state, creating: action.creating };
    case "SET_ERROR":
      return { ...state, error: action.error, creating: false };
    case "CREATE_PROJECT": {
      const exists = state.projects.some((p) => p.id === action.project.id);
      return {
        ...state,
        projects: exists
          ? state.projects.map((p) =>
              p.id === action.project.id ? action.project : p
            )
          : [action.project, ...state.projects],
        creating: false,
        error: null,
      };
    }
    case "LOGOUT":
      return initialState;
    default:
      return state;
  }
}

export type ProjectContextValue = {
  state: ProjectState;
  companyId: number | null;
  fetchProjects: (options?: { silent?: boolean }) => Promise<void>;
  fetchProjectUsers: () => Promise<void>;
  createProject: (
    body: Omit<CreateProjectRequest, "company_id">
  ) => Promise<Project>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { state: authState } = useAuth();
  const companyId = authState.company?.company_id ?? null;
  const [state, dispatch] = useReducer(projectReducer, initialState);

  const companyIdRef = useRef(companyId);
  useEffect(() => {
    companyIdRef.current = companyId;
  }, [companyId]);

  const fetchProjects = useCallback(
    async (options?: { silent?: boolean }) => {
      const cId = companyIdRef.current;
      if (!cId) return;
      if (!options?.silent) {
        dispatch({ type: "SET_LOADING", loading: true });
      }
      try {
        const res = await projectService.getAllProjects(cId);
        if (res.Good && res.data?.projects) {
          dispatch({ type: "LOAD_PROJECTS", projects: res.data.projects });
        } else if (!options?.silent) {
          dispatch({ type: "SET_ERROR", error: "Failed to load projects" });
        }
      } catch (error) {
        if (!options?.silent) {
          dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
        }
      }
    },
    []
  );

  const fetchProjectUsers = useCallback(async () => {
    const cId = companyIdRef.current;
    if (!cId) return;
    try {
      const res = await projectService.getProjectUsers(cId);
      if (res.Good && res.data?.user) {
        dispatch({ type: "LOAD_PROJECT_USERS", users: res.data.user });
      }
    } catch (error) {
      console.log("[ProjectContext] getProjectUsers error:", error);
    }
  }, []);

  const createProject = useCallback(
    async (
      body: Omit<CreateProjectRequest, "company_id">
    ): Promise<Project> => {
      const cId = companyIdRef.current;
      if (!cId) {
        throw new Error("No company context");
      }
      dispatch({ type: "SET_CREATING", creating: true });
      try {
        const res = await projectService.createProject({
          ...body,
          company_id: cId,
        });
        if (!res.Good || !res.data?.id) {
          const fallbackProject: Project = {
            id: -Date.now(),
            name: body.name,
            status: body.status,
            due_date: body.due_date ?? null,
            owner: body.owner,
            description: body.description,
          };
          dispatch({ type: "CREATE_PROJECT", project: fallbackProject });
          dispatch({ type: "SET_CREATING", creating: false });
          return fallbackProject;
        }
        const created: Project = {
          id: res.data.id,
          name: body.name,
          status: body.status,
          due_date: body.due_date ?? null,
          owner: body.owner,
          description: body.description,
        };
        dispatch({ type: "CREATE_PROJECT", project: created });
        return created;
      } catch (error) {
        dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
        throw error;
      }
    },
    []
  );

  // Auto-load projects + project users once per company session (silent warm-up).
  useEffect(() => {
    if (!companyId) return;
    fetchProjects({ silent: true }).catch(() => {});
    fetchProjectUsers().catch(() => {});
  }, [companyId, fetchProjects, fetchProjectUsers]);

  const value: ProjectContextValue = useMemo(
    () => ({
      state,
      companyId,
      fetchProjects,
      fetchProjectUsers,
      createProject,
    }),
    [state, companyId, fetchProjects, fetchProjectUsers, createProject]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProjects(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProjects must be used within a ProjectProvider");
  }
  return ctx;
}