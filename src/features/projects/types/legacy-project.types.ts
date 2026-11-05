// Legacy shapes kept only for the unmounted ProjectContext / old project UI.
// New Project/Sprint code must use `project.types.ts` (`ProjectDetailData`,
// `Sprint`, `ProjectEntity`). The contract does not return `sprints` in project
// detail, and sprint fields are `name`/`due_date`, not `title`/`date`.

import type { TaskListItem } from "@/features/tasks/types/task.types";
import type {
  ProjectAttachment,
  ProjectStatus,
} from "./project.types";

/** @deprecated Use `Sprint`. */
export type ProjectSprint = {
  id: number;
  title: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  name?: string;
  due_date?: string;
};

/** @deprecated Use `ProjectDetailData` + `GET /sprints`. */
export type ProjectDetail = {
  name: string;
  status: ProjectStatus;
  description: string;
  due_date: string;
  attachments: ProjectAttachment[];
  owner: number;
  created_by: number;
  created_by_user: { id: number; first_name: string; last_name?: string };
  tasks: TaskListItem[];
  sprints?: ProjectSprint[];
};

/** @deprecated Use `getProjectDetail` from projectsApi. */
export type GetProjectDetailResponse = {
  Good: boolean;
  data: ProjectDetail;
  status: string[];
  priority: { id: number; name: string }[];
};
