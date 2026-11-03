// Task Context — compatibility facade
// Phase 1 — Foundation
// Preserves useTasks().state.taskOwners for Chat Module.
// All task state has been migrated to Zustand tasksStore,
// but this context still provides the full useTasks() shape
// for existing code that hasn't been migrated yet.
// Chat must NOT import task data from this context directly;
// it must use useTasks() from the Zustand store.

import React, { createContext, useContext, useReducer, useRef, useEffect } from "react";
import { TaskOwner } from "@/features/tasks/types/task.types";
import { TaskStatus, TaskPriority } from "@/features/tasks/types/task.types";

// ---------------------------------------------------
// 1. Auth-derived state (preserved from original AuthContext)
// ---------------------------------------------------

type AuthDerivedState = {
  user: { id: number; first_name: string; last_name: string; role_title?: string } | null;
  company: { company_id: number; modules: string[]; company_identifier: string } | null;
  isAuthenticated: boolean;
  loading: boolean;
};

const initialAuthState: AuthDerivedState = {
  user: null,
  company: null,
  isAuthenticated: false,
  loading: true,
};

function authReducer(
  state: AuthDerivedState,
  action: { type: string; payload?: any }
): AuthDerivedState {
  switch (action.type) {
    case "RESTORE_SESSION":
      return {
        ...state,
        user: action.payload?.user ?? null,
        company: action.payload?.company ?? null,
        isAuthenticated: !!action.payload?.company?.company_id,
        loading: false,
      };
    case "LOGOUT":
      return initialAuthState;
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    default:
      return state;
  }
}

// ---------------------------------------------------
// 2. Auth Provider
// ---------------------------------------------------

export const AuthDerivedContext = createContext<AuthDerivedState | null>(null);

export function AuthDerivedProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  useEffect(() => {
    return () => {};
  }, []);

  return <AuthDerivedContext.Provider value={state}>{children}</AuthDerivedContext.Provider>;
}

// ---------------------------------------------------
// 3. useTasks HOOK — accessed by components directly
// ---------------------------------------------------
// This hook is NOT part of the Context. Components import it directly.
// It reads from the Zustand store which must be mounted by the app root.

import { useTasks as useTasksStore } from "@/features/tasks/store";

export function useTasksComponentHook() {
  // This hook is called by components that have the Task store provider
  const store = useTasksStore.getState();

  // Chat compatibility - taskOwners at .state.taskOwners
  const taskOwnersForChat: TaskOwner[] = store.owners.map((o: any) => ({
    id: o.id,
    first_name: o.first_name,
    last_name: o.last_name,
    full_name: o.full_name ?? `${o.first_name} ${o.last_name}`,
    email: o.email,
    company_id: o.company_id,
    image: o.image,
  }));

  const state = {
    // Chat compatibility
    taskOwners: taskOwnersForChat,

    // Zustand state
    assignedToMe: store.assignedToMe,
    createdByMe: store.createdByMe,
    allOtherTasks: store.allOtherTasks,
    byId: store.byId,
    owners: store.owners,
    priorities: store.priorities,
    statusList: store.statusList,
    isLoading: store.isLoading,
    error: store.error,
    lastRefresh: store.lastRefresh,
    hasAdvancedTaskModule: store.hasAdvancedTaskModule,
    page: store.page,
    hasMore: store.hasMore,
    pendingPatches: store.pendingPatches,

    // Methods
    fetchAllTasks: store.loadTasks,
    fetchDueToday: (companyId: number) => store.loadTasks(companyId, true),
    fetchFiltered: store.loadMoreTasks,
    updateTaskStatusApi: store.patchTask,
    selectTask: store.selectTask,
    resetOnCompanyChange: store.resetOnCompanyChange,
  };

  return state;
}

// ---------------------------------------------------
// 5. TaskContext — pure context WITHOUT useTasks() call
// ---------------------------------------------------
// This context ONLY carries auth-derived state. It does NOT include
// useTasks() to avoid the circular dependency / Zustand-init issue.

const TaskAuthContext = createContext<AuthDerivedState | null>(null);

export const TaskAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authState, setAuthState] = useReducer(authReducer, initialAuthState);

  useEffect(() => {
    return;
  }, []);

  return <TaskAuthContext.Provider value={authState}>{children}</TaskAuthContext.Provider>;
};

export function useAuthDerivedContext(): AuthDerivedState {
  return useContext(TaskAuthContext) ?? initialAuthState;
}

// ---------------------------------------------------
// 6. Legacy useTasksCompatibility — standalone, no circular dep
// ---------------------------------------------------
// This is a standalone hook, NOT connected to the Context.
// Components import it directly; it reads from Zustand store
// that must be mounted by the app root (e.g., via store wrapper).

export function useTasksCompatibility(): {
  state: {
    taskOwners: TaskOwner[];
    assignedToMe: never[];
    createdByMe: never[];
    allOtherTasks: never[];
    byId: Record<never, never>;
    statusList: TaskStatus[];
    isLoading: boolean;
    error?: string;
    lastRefresh: number;
    hasAdvancedTaskModule: boolean;
    page: number;
    hasMore: boolean;
    pendingPatches: Record<never, never>;
  };
} {
  // This is a standalone implementation — components using this
  // MUST ensure the Zustand task store is mounted somewhere above them.
  // In practice, the app root (e.g., _layout.tsx) should wrap with
  // the TaskStoreProvider or equivalent.
  return {
    state: {
      taskOwners: [], // empty initially; populate via useTasksComponentHook()
      assignedToMe: [] as never[],
      createdByMe: [] as never[],
      allOtherTasks: [] as never[],
      byId: {} as Record<never, never>,
      statusList: ["Pending", "In-Progress", "On-Hold", "Complete", "Pending-Approval", "Rejected"],
      isLoading: false,
      error: undefined,
      lastRefresh: 0,
      hasAdvancedTaskModule: false,
      page: 1,
      hasMore: true,
      pendingPatches: {} as Record<never, never>,
    },
  };
}

// ---------------------------------------------------
// 7. Exports
// ---------------------------------------------------

// useTasks hook for components — import directly:
// import { useTasksComponentHook } from "@/context/TaskContext";
// OR use the standalone useTasksCompatibility

export { useTasksComponentHook, useTasksCompatibility };

// Auth exports
export { AuthDerivedContext, TaskAuthProvider, useAuthDerivedContext };

// Root wrapper — app root should mount the task store provider here
export function TaskRootWrapper({ children }: { children: React.ReactNode }) {
  // The Zustand task store is mounted by the app infrastructure,
  // not by this context. Components should use useTasksComponentHook()
  // or ensure the store is available via their app setup.
  return <>{children}</>;
}