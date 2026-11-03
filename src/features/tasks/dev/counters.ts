// Dev-only API/socket counters. Phase 10 uses these as evidence.
// No production behavior and no network calls.

export type ApiCounterName =
  | "getAllTasks"
  | "getDueTodayTasks"
  | "getFilteredTasks"
  | "getDelayedPopup"
  | "getCriticalForUser"
  | "viewTask"
  | "createTask"
  | "updateTask"
  | "updateTaskStatus"
  | "reassignTask"
  | "approveTask"
  | "rejectTask"
  | "reopenTask"
  | "extendDelayed"
  | "updateTaskProject"
  | "getDependencies"
  | "addDependency"
  | "removeDependency"
  | "reorderCritical"
  | "getProjectDetail"
  | "createProject"
  | "updateProject"
  | "getProjectUsers"
  | "getSprints"
  | "createSprint";

const apiCalls: Record<ApiCounterName, number> = {
  getAllTasks: 0,
  getDueTodayTasks: 0,
  getFilteredTasks: 0,
  getDelayedPopup: 0,
  getCriticalForUser: 0,
  viewTask: 0,
  createTask: 0,
  updateTask: 0,
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
  getSprints: 0,
  createSprint: 0,
};

export const apiCounters = {
  calls: apiCalls,
  increment(name: ApiCounterName): void {
    if (__DEV__) apiCalls[name] += 1;
  },
  reset(): void {
    (Object.keys(apiCalls) as ApiCounterName[]).forEach((key) => {
      apiCalls[key] = 0;
    });
  },
};

export type SocketCounterName =
  | "create"
  | "update"
  | "status_update"
  | "status_change"
  | "critical_reorder"
  | "sprint_assigned"
  | "schedule_update"
  | "delete"
  | "add_note"
  | "update_note"
  | "delete_note"
  | "update_note_pin"
  | "update_note_reaction"
  | "add_attachment"
  | "delete_attachment"
  | "project_update"
  | "priority_update"
  | "user_update"
  | "task_scheduling_settings_update"
  | "notification";

const socketEvents: Record<SocketCounterName, number> = {
  create: 0,
  update: 0,
  status_update: 0,
  status_change: 0,
  critical_reorder: 0,
  sprint_assigned: 0,
  schedule_update: 0,
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
};

export const socketCounters = {
  events: socketEvents,
  increment(name: SocketCounterName): void {
    if (__DEV__) socketEvents[name] += 1;
  },
  reset(): void {
    (Object.keys(socketEvents) as SocketCounterName[]).forEach((key) => {
      socketEvents[key] = 0;
    });
  },
};

export function logCounters(label = ""): void {
  if (!__DEV__) return;
  const totalApi = Object.values(apiCalls).reduce((total, value) => total + value, 0);
  const totalSocket = Object.values(socketEvents).reduce((total, value) => total + value, 0);
  console.log(
    `[Dev Counters${label ? ` ${label}` : ""}] API calls: ${totalApi}, Socket events: ${totalSocket}`,
    { api: apiCalls, socket: socketEvents },
  );
}
