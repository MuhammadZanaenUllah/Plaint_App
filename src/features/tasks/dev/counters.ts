// Development-only API and socket counters
// Phase 1 — Foundation
// Used for debugging and performance monitoring during development.
// Excluded from production builds via tsconfig or process.env checks.

// API call counters (dev mode only)
export const apiCounters = {
  calls: {
    getAllTasks: 0,
    getDueTodayTasks: 0,
    getFilteredTasks: 0,
    viewTask: 0,
    createTask: 0,
    updateTaskStatus: 0,
    reassignTask: 0,
    approveTask: 0,
    rejectTask: 0,
    reopenTask: 0,
    extendDelayed: 0,
    updateTaskProject: 0,
    getDependencies: 0,
    addDependency: 0,
    removeDependency: 0,
    reorderCritical: 0,
    getProjectDetail: 0,
    createProject: 0,
    updateProject: 0,
    getProjectUsers: 0,
    getProjectSprints: 0,
    createSprint: 0,
    // Add more as needed
  },
  increment: (service: keyof typeof apiCounters.calls) => {
    if (process.env.NODE_ENV !== "production") {
      apiCounters.calls[service as keyof typeof apiCounters.calls] =
        (apiCounters.calls[service as keyof typeof apiCounters.calls] ?? 0) + 1;
    }
  },
  reset: () => {
    if (process.env.NODE_ENV !== "production") {
      Object.keys(apiCounters.calls).forEach((key) => {
        apiCounters.calls[key as keyof typeof apiCounters.calls] = 0;
      });
    }
  },
};

// Socket event counters (dev mode only)
export const socketCounters = {
  events: {
    create: 0,
    update: 0,
    status_update: 0,
    status_change: 0,
    critical_reorder: 0,
    sprint_assigned: 0,
    delete: 0,
    add_note: 0,
    update_note: 0,
    delete_note: 0,
    update_note_pin: 0,
    update_note_reaction: 0,
    add_attachment: 0,
    delete_attachment: 0,
    project_update: 0,
    priority_update: 0,
    user_update: 0,
    task_scheduling_settings_update: 0,
    notification: 0,
  },
  increment: (event: keyof typeof socketCounters.events) => {
    if (process.env.NODE_ENV !== "production") {
      socketCounters.events[event as keyof typeof socketCounters.events] =
        (socketCounters.events[event as keyof typeof socketCounters.events] ?? 0) + 1;
    }
  },
  reset: () => {
    if (process.env.NODE_ENV !== "production") {
      Object.keys(socketCounters.events).forEach((key) => {
        socketCounters.events[key as keyof typeof socketCounters.events] = 0;
      });
    }
  },
};

// Log counter snapshot (dev only)
export function logCounters(label?: string) {
  if (process.env.NODE_ENV !== "production") {
    const api = apiCounters.calls;
    const socket = socketCounters.events;
    const totalApi = Object.values(api).reduce((a, b) => a + b, 0);
    const totalSocket = Object.values(socket).reduce((a, b) => a + b, 0);
    console.log(
      `[Dev Counters ${label || ""}] API calls: ${totalApi}, Socket events: ${totalSocket}`,
      { api, socket }
    );
  }
}