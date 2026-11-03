# Task Module Details

**Frontend implementation, API usage, business logic, permissions, socket events, complete website flow inventory request, and backend/website frontend contract review**

| Item | Value |
|---|---|
| Product | Plaint / Planit mobile app |
| Module | Task module (with Project-in-Task features; Project module currently disabled) |
| Document date | 2026-10-21 |
| Prepared for | Backend team and Website frontend team |
| Source of truth | Mobile app repository at `D:\Websouls\Projects\Plaint_App` |
| Tech stack | Expo SDK ~57, React Native 0.86.x, React 19, TypeScript, Expo Router, React Context + `useReducer` |
| Task module status | Active in mobile app |
| Project module status | Coded but disabled in mobile app; to be activated after backend contract review |
| Purpose | Let backend and website frontend review the current mobile task implementation, identify missing/changed contracts and missing website flows, and return one complete Markdown contract + flow inventory document |

---

## 0. What we need from the backend and website frontend teams

We have already implemented a substantial part of the Task module. The backend may have changed since this frontend was written, and the mobile app may have missed website flows, UI states, or business logic. We need you to compare this document against the current backend and website implementation and tell us:

1. Which APIs still exist and are unchanged.
2. Which APIs have changed; please provide the old contract and the new contract.
3. Which APIs are missing/deprecated/renamed.
4. Which new APIs, socket events, permissions, or business rules the mobile frontend must add.
5. Which frontend checks/rules currently active on the website must also be applied on mobile.
6. What exactly we need to change on the mobile frontend to be compatible.
7. The full Task + Project-in-Task contract so we can safely activate the Project features in the Task module.
8. **Every possible Task-related flow that exists on the website**, even flows the mobile app currently does not have. We may have missed flows, screens, modals, actions, states, edge cases, or UI behavior.
9. **Every possible Project-in-Task flow that exists on the website**, including project assignment, project task lists, sprint behavior, project permissions, and project task actions.
10. For each flow: the step-by-step UI, all validations/checks, permissions, API call sequence, socket events, state updates, empty/loading/error states, confirmation dialogs, navigation/back behavior, notifications/toasts, and implementation guidance.

**Please have both the backend team and the website frontend team review this file.** The backend should answer API/socket/permission/business-rule questions. The website frontend team should provide the complete flow inventory, UI behavior, validations, and frontend checks that are currently active on the website.

**Please reply with a single Markdown file** named `TASK_MODULE_BACKEND_CONTRACT.md` (or provide a link) containing everything requested in Section 19, including the complete website flow inventory requested in Section 18.O, Section 19.1 items 15-17, and the templates in Sections 19.5-19.7. Please answer the questions in Section 18 by question number.

We are deliberately listing even APIs that are coded but not currently wired in the UI. Please do not assume an endpoint is unused just because it is not visible in the app today; it may be used when the Project features are activated.

---

## 1. How to read this document

- **Section 2-4:** current mobile architecture, conventions, and module state.
- **Section 5-8:** Task data model, screens, UX flows, and API inventory with exact payloads.
- **Section 9-11:** shared APIs, Project APIs already coded, permissions, and checks.
- **Section 12-15:** business logic, socket events, notifications/push, state/fetch behavior.
- **Section 16-17:** known gaps, dead code, assumptions, and Project-in-Task implementation.
- **Section 18:** numbered questions for backend and website frontend (Q1-Q142), including the complete website flow inventory request in Section 18.O.
- **Section 19:** requested `TASK_MODULE_BACKEND_CONTRACT.md` format, website flow inventory template, and checklists.
- **Section 20:** final handoff checklist.

Terms used:

- **Current mobile UI:** code reachable by a user in the current build.
- **Coded but not wired:** function/component/API exists but no active UI caller.
- **Disabled:** code exists but is commented out or provider is unmounted because the Project module is off.
- **Assumption:** a frontend assumption that must be confirmed by backend.
- **Task in this document:** a task record under `/tasks/*`, not a chat message or project.
- **Website flow inventory:** an exhaustive list of every Task / Project-in-Task user flow on the website, including screens, entry points, actions, modals, checks, API sequence, states, and edge cases. This is requested because mobile may have missed flows, UI, or logic.

---

## 2. Current module state and navigation

### 2.1 Active modules

The mobile app currently activates:

- **Tasks**
- **Chat**

The Project module is present in code but disabled. Project-related task actions are also disabled.

### 2.2 Current navigation

- Default authenticated route: `/(tabs)/tasks`.
- Tab bar: floating `CustomTabBar` with **Tasks** then **Chat**.
- Tasks header: shared `AppHeader`; search is forced open and collapses on list scroll.
- Chat remains fully available as the second tab.
- Task-provider tree:

```text
GestureHandlerRootView
└─ AuthProvider
   └─ TaskProvider
      └─ NotificationProvider
         └─ ChatProvider
            └─ PushNotificationProvider
               └─ BottomSheetModalProvider
                  └─ PushNotificationLifecycle + RootNavigator + Toast
```

### 2.3 Restoration note

The Task module was previously commented out for a Chat-only build. It was fully restored on 2026-10-21:

- `TaskProvider` is mounted again.
- The real `TasksScreen` is restored.
- Tasks tab is registered and is the default tab.
- Custom floating tab bar is restored.
- Task notifications, mentions, and push deep links are restored.
- Chat's Add-People default list again merges task owners from `TaskContext`.
- The old task-push ignore guard was removed.

Only the Project module and project actions remain disabled.

### 2.4 Critical cross-module dependency

`ChatScreen` calls `useTasks()` to merge `taskState.taskOwners` into its Add-People default contact list. Therefore:

- `TaskProvider` must stay mounted above `ChatProvider`.
- Removing or reordering `TaskProvider` breaks Chat with `"useTasks must be used within a TaskProvider"`.

---

## 3. Architecture and relevant files

### 3.1 Task files

| File | Responsibility |
|---|---|
| `src/app/(tabs)/tasks.tsx` | Task dashboard: stat tabs, client-side filtering/search, pagination, swipe rows, create/detail/reject/delay modals, `taskId` deep link. |
| `src/context/TaskContext.tsx` | Task state, reducer, two-phase fetch, optimistic updates, task actions, owner/priority/status lists. |
| `src/hooks/useTasks.ts` | Re-export of `useTasks` from `TaskContext`. |
| `src/hooks/useTaskSocket.ts` | Company-wide task socket listeners; mounted by `TasksScreen`. |
| `src/services/api/tasks.service.ts` | All `/tasks/*` REST functions. |
| `src/types/task.types.ts` | Task API/UI types and request payloads. |
| `src/utils/statusMapper.ts` | `TaskListItem` to UI row mapping, API/UI status conversion, due-date formatting. |
| `src/components/TaskTable.tsx` | Alias: `export { default } from "./SingleTaskTable"`. |
| `src/components/SingleTaskTable.tsx` | Task table, swipe gestures, status/assignee dropdowns, virtualization. |
| `src/components/TaskRow.tsx` | Row prop types, `STATUS_COLORS`, priority accents, `ALL_STATUSES` (not a component). |
| `src/components/TaskTableSkeleton.tsx` | Loading skeleton. |
| `src/components/CreateTaskModal.tsx` | Create task bottom sheet, recurrence, dependencies, advanced effort, critical conflict popup. |
| `src/components/TaskDetailModal.tsx` | Task detail/comment bottom sheet, inline edits, dependencies table, mention composer. |
| `src/components/RejectTaskModal.tsx` | Rejection reason + additional effort. |
| `src/components/CriticalTaskModal.tsx` | `CriticalTaskPopUpModal` and `OrderCriticalTasksModal`. |
| `src/components/DependencyModal.tsx` | Searchable/paginated dependency picker. |
| `src/components/taskdelay.tsx` | Overdue escalation popup with effort extension. |
| `src/components/StatCard.tsx` | Stat tab card (also used by leaves). |
| `src/components/AnimatedFAB.tsx` | Create-task floating action button. |
| `src/components/TaskRefreshHeader.tsx` | Present but unused. |
| `src/components/AssignTaskProjectModal.tsx` | Project assignment picker; currently unreachable because Project module is disabled. |
| `src/utils/permissions.ts` | Task and project permission helpers. |
| `src/services/socket/socketService.ts` | Socket singleton and task event payload types. |
| `src/context/NotificationContext.tsx` | Task mention local notifications/toasts. |
| `src/context/PushNotificationContext.tsx` | Task/lead push deep links. |
| `src/components/headerapp.tsx` | Header notification inbox; opens task detail on task notification tap. |
| `src/app/notifications.tsx` | Full Inbox; opens task detail on task notification tap. |
| `src/context/AuthContext.tsx` | Resolves `hasAdvancedTaskModule` from company modules. |

### 3.2 Project files relevant to Task module

| File | Current state |
|---|---|
| `src/context/ProjectContext.tsx` | Coded but provider unmounted. Fetches project list, project users, creates projects. |
| `src/services/api/projects.service.ts` | Project REST layer; some functions unused. |
| `src/types/project.types.ts` | Project/project-detail/sprint types. |
| `src/components/AssignTaskProjectModal.tsx` | Project picker used only by disabled task project actions. |
| `src/components/ProjectDetailModal.tsx` | Project detail with project tasks table, task status/reassign, sprints display. Currently unreachable. |
| `src/components/CreateProjectModal.tsx` | Create-project UI; currently unreachable. |
| `src/components/ProjectQuickMenuModal.tsx` | Project quick menu; currently unreachable. |
| `src/utils/permissions.ts` | Project permission helpers. |

### 3.3 Request flow

```text
TasksScreen / CreateTaskModal / TaskDetailModal / ProjectDetailModal / ChatScreen
        │
        ▼
TaskContext (state + reducer + optimistic patches)
        │
        ▼
tasks.service.ts → client.ts (apiGet/apiPost/apiDelete/apiUpload) → backend /api/v1/tasks/*
```

Task IDs are numeric. This differs from Chat, where room/message IDs are Mongo ObjectId strings.

---

## 4. Shared request/auth/response conventions

### 4.1 API base and headers

- Base path: `{API_BASE_URL}/api/v1`.
- Headers on requests:
  - `x-access-token: <token>`
  - `authToken: <token>`
  - `x-client-platform: mobile`
  - `Content-Type: application/json` for non-FormData requests.
- Auth token is read from SecureStore.
- `company_id` and `company_identifier` come from `authState.company` in the authenticated session.
- Session expiry is detected by a response body containing the string `"Un-Athunticated request"` (backend spelling) and triggers logout.

### 4.2 Response envelope

Every endpoint is expected to return:

```ts
{
  Good: boolean;
  data?: T;
  message?: string;  // sometimes `msg`
}
```

The mobile code checks `Good`. Some service calls also read `message`, `data` as a string, or nested `data`.

### 4.3 Date/time and IDs

- Task `id`, `taskId`, `project_id`, `sprint_id`, `parent_id`, user IDs, priority IDs are numbers.
- `task_id` inside push notification data is currently typed as a string, then converted with `Number(...)` on the mobile side.
- Due dates are sent in two formats depending on the flow:
  - Create (normal flow): JavaScript `Date.toISOString()`.
  - Detail edit: `YYYY-MM-DD`.
- Recurring time default: `"09:00"`.
- Screen date filters use local device dates and timestamps.

We need backend confirmation of the canonical date/time format and timezone rules. See Q41-Q45.

---

## 5. Task data model and enums used by mobile

### 5.1 Task status

**API `TaskStatus` values used in types:**

- `Pending`
- `In-Progress`
- `On Hold`
- `Complete`
- `Pending-Approval`
- `Rejected`
- `Recurring`

**UI `UiTaskStatus` values:**

- `Pending`
- `In-Progress`
- `On Hold`
- `Completed`
- `Pending-Approval`
- `Rejected`
- `Recurring`

**Conversion (`src/utils/statusMapper.ts`):**

- API to UI:
  - `complete`, `completed`, `done` -> `Completed`
  - `in-progress`, `inprogress`, `in progress` -> `In-Progress`
  - `on hold`, `onhold`, `on_hold` -> `On Hold`
  - `pending-approval`, `pendingapproval`, `pending_approval` -> `Pending-Approval`
  - `rejected`, `recurring`, `pending` -> normalized equivalents
  - unknown value -> returned as-is
- UI to API:
  - `Completed` -> `Complete`
  - all other values pass through unchanged.

### 5.2 Task priority

- `TaskListItem.priority`: numeric company priority ID.
- `TaskListItem.priority_name`: display name.
- `TaskListItem.priority_color`: display color.
- `TaskListItem.task_priority`: `normal` or `critical`.
- `TaskListItem.critical_order`: ordering value for critical tasks.
- Create modal currently offers hard-coded `Normal` and `Critical`; it does not let the user choose a company priority name during create.
- Detail modal lets the user select a company priority ID from `taskState.priorities`, and separately toggles `task_priority` between `normal` and `critical`.

### 5.3 Filter enum

`TaskFilter`:

```ts
"delayed"
| "due_in_7_days"
| "created_by_me"
| "assigned_to_me"
| "pending_approval"
| "recurring"
| "complete"
```

This is used only by `POST/GET /tasks/filter` through `fetchFiltered`, which currently has no active screen caller. The Task screen filters client-side.

### 5.4 Task list item fields currently expected from backend

```ts
{
  id: number;
  title: string;
  status: TaskStatus;
  due_date: string;
  priority: number;
  task_priority: "normal" | "critical";
  critical_order: number | null;
  assignee: number;
  asigned_to: number;          // backend spelling, single "s"
  parent_id: number;
  company_id: number;
  is_recurring: boolean;
  approval_required: number;   // 0 or 1
  created_by: number;
  module: string;
  project_id: number;
  sprint_id: number | null;
  subtask_count: number;
  notes_count: number;
  can_edit: boolean;
  can_edit_status: boolean;
  can_edit_subtask: boolean;
  description?: string;
  rejection_reason?: string;
  task_assignee: TaskPerson;
  task_assigned_to: TaskPerson;
  priority_color: string;
  priority_name: string;
  updatedAt: string;
  createdAt?: string;
  effort_hours?: number;
  effort_unit?: string;
}
```

**Naming trap in current mapper:**

- `task_assignee` is used as the **creator** display.
- `task_assigned_to` is used as the **assignee** display.
- Assignment field is `asigned_to` (single “s”), mirrored by `assignee`.

Please confirm whether this is intentional and stable.

### 5.5 Task list response

```ts
{
  task_owner: TaskOwner[];
  priority: TaskPriority[];
  status: string[];
  tasks_assigned_to_me: TaskListItem[];
  tasksByme: TaskListItem[];
  all_other_tasks: TaskListItem[];
}
```

`TaskOwner`:

```ts
{
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string;
  company_id?: number;
  image: string | null;
}
```

`TaskPriority`:

```ts
{
  id: number;
  name: string;
  color: string;
  order: number | null;
  company_id?: number;
}
```

### 5.6 View task response expected

```ts
{
  task: {
    id: number;
    title: string;
    asigned_to: number | { id, first_name?, last_name?, full_name?, image? };
    created_by: number | { id, first_name?, last_name?, full_name?, image? };
    due_date: string;
    start_date: string;
    priority: string;
    task_priority: "normal" | "critical";
    status: TaskStatus;
    description: string;
    is_recurring: boolean;
    recurring_period: RecurringPeriod | null;
    recurring_time: string | null;
    recurring_total_count: number;
    recurring_exclude_days: string[];
    recurring_week_day: string | null;
    recurring_month_date: string | null;
    recurring_annual_month: string | null;
    recurring_annual_date: string | null;
    project_id: number | null;
    project_name: string | null;
    sprint_id: number | null;
    sprint_name: string | null;
    parent_id: number;
    subtask_count: number;
    sub_tasks: SubTask[];
    approval_required: number;
    effort_hours: number;
    effort_unit: string;
    can_edit: boolean;
    can_edit_status: boolean;
    task_notes: TaskNote[];
    task_notifications: any[];
    task_notes_attachments: any[];
    task_attachments: TaskAttachment[];
    created_at?: string;
    completed_at?: string;
    actual_completion?: string;
    effort_logs?: any[];
    effort_logs_count?: number;
  }
}
```

### 5.7 Note model

```ts
{
  id: number;
  notes: string;
  user_id: number;
  user_name: string;
  user_image: string;
  pin_top: number;       // 0 or 1
  is_edited: number;
  reactions: {
    user_id: number;
    user_name: string;
    emoji: string;
  }[];
  reply_to: {
    note_id: number;
    user_id: number;
    content: string;
  } | null;
  created_at: string;
}
```

### 5.8 Recurring period

Type supports:

```ts
"daily" | "weekly" | "monthly" | "annually" | "quarterly" | "semi-annually"
```

Current create UI offers only:

```ts
"daily" | "weekly" | "monthly" | "annually"
```

Quarterly/semi-annually are commented out.

---

## 6. Task screens and UX flows

### 6.1 Tasks dashboard (`src/app/(tabs)/tasks.tsx`)

**Stat tabs (8):**

| Tab ID | Label | Current mobile definition |
|---|---|---|
| `all` | All Tasks | All mapped tasks; with no status filter, Completed tasks are removed (Completed has its own tab). |
| `today` | Due Today | `due_date >= today 00:00`, `< tomorrow 00:00`, and `>= now` (past-due excluded). |
| `week` | Due in 7 days | `due_date` from tomorrow 00:00 to +7 days; sorted by due date. |
| `overdue` | Delayed | `due_date < now` and status not `Completed`. |
| `created` | Created by me | `tasksByme`, sorted by due date. |
| `assigned` | Assigned to me | `tasks_assigned_to_me`, sorted by due date. |
| `recurring` | Recurring | `is_recurring === true`, sorted by due date. |
| `completed` | Completed | status `Completed`. |

Default tab: `today`.

**Header/search:**

- Header search is forced open for Tasks.
- Placeholder: `Search Tasks...`.
- Search is client-side across:
  - title
  - id
  - assignee display name
  - status
  - raw description
  - priority name
- Scrolling past 8 px sets `isHeaderCompact`, shrinking the search bar and stat cards.

**Filters via `FilterModal`:**

- status
- priority (`Normal`, `Critical`)
- due-date range
- created by (single or multi)
- assigned to (single or multi)

Status filter intentionally shows only:

```text
Pending, In-Progress, On Hold, Completed
```

With no status filter:

- non-completed tabs exclude `Completed`;
- the `completed` tab keeps only `Completed`.

The `Recurring` filter is special-cased to match `is_recurring` or status `Recurring`.

**Counts:**

- Every stat card count runs the same tab scope + filters as the list.
- While the first phase (`/tasks/duetoday`) has loaded and the full list is still loading, all counts except Due Today show `"···"`.

**Sorting:**

- Critical tasks first, ordered by `critical_order` ascending, then due date.
- Normal tasks follow.
- Some tabs sort by due date before the critical partition.

**Pagination:**

- Client-side page size: 20.
- `loadMore` has a re-entrancy guard and a 350 ms simulated delay.
- Switching tab/search/filter resets to page 1.
- Pull-to-refresh silently refetches and resets to page 1.

**Other UI:**

- Loading uses `TaskTableSkeleton`; stat cards and create/detail/delay modals stay mounted.
- Create FAB visible only when `canCreateTask` is true.
- Create FAB opens `CreateTaskModal`; after success the screen switches to the `created` tab.
- Task row press opens task detail.
- Comment press opens detail on the Comments tab.
- Swipe row actions are described in Section 6.4.
- `?taskId=` deep link (from task push) opens task detail once per param value.
- `filter` push param is currently ignored by the screen.
- Once per session, an overdue summary toast is shown for all non-completed tasks with a past due date.
- Once per session, an overdue task created by the current user but assigned to another user opens the `TaskDelay` popup.
- The delay popup calls `extendDelayedTask` with effort and unit (`Mins` -> `minutes`, `Hours` -> `hours`, `Days` -> `days`).

### 6.2 Create Task modal (`src/components/CreateTaskModal.tsx`)

Modal type: `BottomSheetModal`, snap points `50%` and `70%`.

**Required fields:**

- Title.
- Assignee.
- Due date in normal companies.
- Effort hours in Advanced Task Module companies.
- Priority.

**Fields/chips:**

- title
- rich description (HTML from editor)
- assignee picker, searchable from `taskState.taskOwners`
- due date (normal)
- effort + unit (advanced; minutes/hours/days)
- priority (`Normal`/`Critical`)
- status (`Pending`, `In-Progress`, `On Hold`, `Completed`, `Rejected`; `Recurring` and `Pending-Approval` are excluded from the create status list; default is `Pending`, or `Recurring` when the recurring toggle is on)
- approval required (`Yes`/`No`)
- dependencies
- recurring settings
- attachments
- critical-task conflict popup
- dependency picker modal
- recurring settings popup

**Advanced Task Module:**

- `isAdvanced = authState.hasAdvancedTaskModule === true`.
- Resolved in `AuthContext` from `company.modules`.
- Matches module names containing “advance” and “task”, or numeric module IDs resolved through `GET /modules/all`.
- Advanced companies:
  - no due-date requirement
  - effort hours + unit required
  - sends `due_date: null`
  - backend scheduling engine is expected to compute the due date.
- Normal companies:
  - due date required
  - sends `effort_hours: 0`
  - sends `effort_unit: "hours"`.

**Recurring settings:**

- Daily: exclude weekdays.
- Weekly: one weekday.
- Monthly: day of month.
- Annually: month + date.
- Time: default `"09:00"`.
- Total count.
- `quarterly` and `semi-annually` are typed but not offered in the create UI.

**Dependencies:**

- `DependencyModal` lists only tasks with status `Pending` or `In-Progress`.
- Search + 20-row pagination.
- Selected IDs become `depends_on: number[]`.

**Attachments caveat:**

- Files can be picked, listed, removed, and downloaded.
- They are **not uploaded** by the create flow.
- There is no `uploadAttachment` call in `CreateTaskModal`.

**Create payload currently sent:**

```ts
{
  title: string,
  company_identifier: string,
  company_id: number,
  assign_to: number,
  due_date: string | null,
  task_priority: "normal" | "critical",
  bump_to_front: boolean,
  approval_required: 0 | 1,
  status: string,
  description: string,
  project_id: null,
  sprint_id: null,
  parent_id: 0,
  is_recurring: boolean,
  recurring_period: RecurringPeriod | null,
  recurring_time: string | null,
  recurring_total_count: number,
  recurring_exclude_days: string[],
  recurring_week_day: string | null,
  recurring_month_date: number | null,
  recurring_annual_month: number | null,
  recurring_annual_date: number | null,
  effort_hours: number,
  effort_unit: string,
  depends_on: number[]
}
```

**Critical conflict flow:**

- Condition: `task_priority === "critical"` and the selected assignee already has an active critical task.
- Active critical task definition used by mobile:
  - `asigned_to === selected assignee`
  - `task_priority === "critical"`
  - status is not `Complete` and not `Rejected`
  - searched across assigned-to-me, created-by-me, and all-other buckets.
- Popup choices:
  - **Stop & start immediately** -> create with `bump_to_front: true`.
  - **Wait & schedule** -> create with `bump_to_front: false`.
- `OrderCriticalTasksModal` exists and `handleConfirmOrder` calls `reorderCritical`, but `orderModalVisible` is never set to true. The reorder modal is currently unreachable.

**After create:**

- success toast
- silent `fetchAllTasks`
- reset form
- close modal
- call `onCreated`

**Live directory sync:**

- While visible, listens to `user_update` for the company and silently refetches task owners.

### 6.3 Task detail modal (`src/components/TaskDetailModal.tsx`)

**Opened from:**

- task list row (details or comments)
- header notification popup
- full Inbox screen
- task push deep link
- task list `?taskId=` deep link

**On open:**

- calls `viewTask`
- loads dependencies
- loads notes when Comments tab is active

**Tabs:**

- `Task Details`
- `Comments`

**Editable details:**

- title (save on blur)
- assignee
- due date
- company priority
- `task_priority` (Normal/Critical)
- task status
- approval required
- effort hours/unit
- description (save on blur)

**Read-only details displayed:**

- created by
- created at
- start date
- estimated completion
- actual completion
- recurring summary
- dependencies table
- attachments
- effort logs modal

**Save behavior:**

- Every edit rebuilds a full `UpdateTaskRequest` from current state + overrides.
- Calls `updateTask`.
- `updateTask` patches the task list optimistically.
- Detail then reloads.
- The task list is deliberately **not** refetched after detail edits, to avoid slow `/tasks/all` and stale-response races.

**Status behavior:**

- Status picker uses API values:
  - `Pending`
  - `In-Progress`
  - `On Hold`
  - `Complete`
  - `Pending-Approval`
  - `Rejected`
- Selecting `Rejected` opens `RejectTaskModal`.
- Selecting `In-Progress` is blocked if another task in `assignedToMe` is already in progress.
- Status edits call `updateTask`, not `updateTaskStatus`.

**Permissions:**

- `canEdit = (taskDetail.task.can_edit ?? task.canEdit) !== false`.
- Unset means editable.
- All detail edits are gated by `canEdit`.

**Comments:**

- Notes are sorted pinned first, then original order.
- Send comment calls `addNote`.
- `@` opens mention picker from `GET /user/note-mentions`.
- Plain `@Full Name` tokens are converted to backend markup `@[Full Name](userId)`.
- Numeric `mentions` array is sent with the note.
- Pin is optimistic and enforces only one pinned note; previously pinned note is unpinned.
- Delete note is immediate.
- Reactions are displayed only; no reaction-send UI.
- `addNote` supports a file, but the detail modal does not pass one.

**Attachments caveat:**

- Attachments are displayed with a download icon.
- The download `TouchableOpacity` has no `onPress`.
- Task attachment download/open from detail is currently non-functional.

**Not wired in detail:**

- approve task
- reopen task
- reschedule reopened
- add/remove dependency
- recalculate schedule
- create subtask
- update note
- reply-to comment
- note reactions
- attachment upload/delete
- `task_notifications` and `task_notes_attachments` from `viewTask` are not rendered.

**Socket refresh:**

- While visible, listens to `task_update` for the open task ID.
- Note/attachment actions reload notes.
- Any task update reloads detail.

### 6.4 Task table and rows (`SingleTaskTable.tsx`)

- Default columns: `Task Title`, `Created By`, `Due Date`.
- `Assigned To` and `Status` are column types but are shown in the swiped details panel.
- Project column is project-gated and currently disabled.
- Leading cell:
  - priority accent bar
  - completion checkbox
  - checkbox toggles `Completed` and `Pending`
  - disabled when `canEditStatus === false`.
- Swipe left opens the actions strip:
  - `More`
  - `Status`
  - current status badge
- `More` opens the details panel:
  - assignee dropdown with search (only when reassignment is allowed)
  - status dropdown
  - comment button
  - project button only when project actions are enabled
- Status dropdown options:
  - all statuses except `Pending-Approval` and `Recurring`.
- Row selection:
  - title press opens detail
  - due-date cell press also opens detail
- Pagination:
  - virtualized FlatList on the Tasks screen
  - non-virtualized ScrollView inside task detail/project sheets
- Dependency rows:
  - built with `canEditStatus: false`
  - no comment/reassign handlers
  - display-only in practice.

### 6.5 Reject task modal (`RejectTaskModal.tsx`)

- Requires a rejection reason.
- Optional additional effort input.
- Unit options: `Hrs`, `Days`, `Min`.
- Converts to **minutes** before sending:

```text
Hrs  -> value * 60
Days -> value * 8 * 60
Min  -> value
```

- Calls `rejectTask`.
- Success calls `onSuccess`.

### 6.6 Task delay popup (`taskdelay.tsx`)

- Shows task title and assignee.
- Inputs effort and unit (`Mins`, `Hours`, `Days`).
- Calls `extendDelayedTask`.
- Mobile expects backend to emit `task_update` with `action: "schedule_update"` after extension, so the list can be patched without a manual refetch.

---

## 7. Complete Task API inventory

All task service functions live in `src/services/api/tasks.service.ts`. Every endpoint is under `/api/v1`.

### 7.1 Endpoint summary

| # | Mobile function | Method + path | Request currently sent | Response expected by mobile | Current consumer / state |
|---|---|---|---|---|---|
| 1 | `getAllTasks` | `GET /tasks/all` | query `company_id`; optional `skipTasks=true` (string) | `TaskListResponse` | Active: `fetchAllTasks` phase 2 and silent refresh |
| 2 | `getDueTodayTasks` | `GET /tasks/duetoday` | query `company_id` | `TaskListResponse` | Active: `fetchAllTasks` phase 1 |
| 3 | `getFilteredTasks` | `GET /tasks/filter` | query `company_id`, `filter` (`TaskFilter`) | `TaskListResponse` | Coded but no active UI caller |
| 4 | `viewTask` | `POST /tasks/view/:taskId` | body `{ company_id }` | `ViewTaskData` | Active: list detail, deep link, notifications, detail modal |
| 5 | `createTask` | `POST /tasks/create` | `CreateTaskRequest` | `{ id: number }` | Active: create modal |
| 6 | `createSubtask` | `POST /tasks/createsubtask/:parentId` | `CreateTaskRequest` | `{ id: number }` | Coded but no UI caller |
| 7 | `updateTask` | `POST /tasks/update/:taskId` | `UpdateTaskRequest` | string message | Active: detail edits |
| 8 | `updateTaskStatus` | `POST /tasks/updatetaskstatus/:taskId` | `{ status, company_id, company_identifier }` | string | Active: list/swipe status changes |
| 9 | `reassignTask` | `POST /tasks/updateasignedto/:taskId` | `{ asigned_to, assignee, company_id, company_identifier }` | string | Active: list swipe reassign |
| 10 | `deleteTask` | `DELETE /tasks/:taskId` | no body | string | Coded in context; no active UI caller |
| 11 | `approveTask` | `POST /tasks/approve/:taskId` | `{ company_id, company_identifier }` | string | Coded in context; no active UI caller |
| 12 | `rejectTask` | `POST /tasks/reject/:taskId` | `{ company_id, company_identifier, reason, additional_hours }` | string | Active: reject modal |
| 13 | `updateTaskDueDate` | `POST /tasks/updatetaskduedate/:taskId` | `{ duedate, company_id, company_identifier }` | string | Coded; no UI caller |
| 14 | `extendDelayedTask` | `POST /tasks/extend-delayed/:taskId` | `{ additional_effort, unit, company_id }` | string | Active: delay popup |
| 15 | `updateTaskProject` | `POST /tasks/updatetaskproject/:taskId` | `{ project_id, sprint_id?, company_id, company_identifier }` | string | Coded in context; no active UI (Project disabled) |
| 16 | `updateLeadSource` | `POST /tasks/updateleadsource/:taskId` | `{ source, company_id, company_identifier }` | string | Coded; no UI caller |
| 17 | `recalculateSchedule` | `POST /tasks/recalculate/:taskId` | `{ company_id, company_identifier, completed_at? }` | string | Coded in context; no UI caller |
| 18 | `getDependencies` | `GET /tasks/dependencies/:taskId` | query `company_id` | `DependencyData[]` | Active: detail dependencies table |
| 19 | `addDependency` | `POST /tasks/dependencies/add` | `{ task_id, depends_on, company_id, company_identifier }` | string | Coded in context; no UI caller |
| 20 | `removeDependency` | `POST /tasks/dependencies/remove` | `{ task_id, depends_on, company_id, company_identifier }` | string | Coded in context; no UI caller |
| 21 | `reorderCritical` | `POST /tasks/reorder-critical` | `{ orderedIds: (number \| string)[], company_id }` | `{ blockedTasks: {id,title}[] }` | Coded; only reached by unreachable order modal |
| 22 | `rescheduleReopened` | `POST /tasks/reschedule-reopened/:taskId` | `{ company_id, company_identifier, effort_hours }` | string | Coded in context; no UI caller |
| 23 | `reopenTask` | `POST /tasks/reopen/:taskId` | `{ company_id, company_identifier, status, priority, effort_hours, effort_unit, bump_to_front }` | string | Coded in context; no UI caller |
| 24 | `migratePriorities` | `POST /tasks/migrate-priorities` | `{ company_id }` | any | Coded; no UI caller |
| 25 | `migrateEffortToMinutes` | `POST /tasks/migrate-effort-to-minutes` | `{ company_id }` | any | Coded; no UI caller |
| 26 | `addNote` | `POST /tasks/addnote/:taskId` | FormData (see 7.2) | string | Active: detail comment send |
| 27 | `getMentionUsers` | `GET /user/note-mentions` | query `company_id` | `{ user: MentionUser[] }` | Active: comment mention picker |
| 28 | `getTaskNotes` | `POST /tasks/showtasknote/:taskId` | optional `{ company_id, company_identifier }` | `TaskNote[]` | Active: detail comments |
| 29 | `updateNote` | `POST /tasks/updatenote/:noteId` | `{ notes, company_id, company_identifier }` | string | Coded; no UI caller |
| 30 | `pinNote` | `POST /tasks/updatenotepin/:noteId` | `{ pin_top, company_id, company_identifier }` | string | Active: detail pin |
| 31 | `deleteNote` | `POST /tasks/deletenote/:noteId` | `{ company_id, company_identifier }` | string | Active: detail delete |
| 32 | `updateNoteReaction` | `POST /tasks/updatenotereaction/:noteId` | `{ emoji, company_id, user_id, user_name }` | `{ reactions[] }` | Coded; no UI caller |
| 33 | `uploadAttachment` | `POST /tasks/attachments/:taskId` | FormData | `{ id, attachment_file }` | Coded; no UI caller |
| 34 | `deleteAttachment` | `POST /tasks/attachmentdelete/:attachmentId` | `{ company_id, company_identifier }` | string | Coded; no UI caller |

### 7.2 Exact current create payload example

```json
{
  "title": "Prepare weekly report",
  "company_identifier": "COMPANY_IDENTIFIER",
  "company_id": 123,
  "assign_to": 456,
  "due_date": "2026-10-30T00:00:00.000Z",
  "task_priority": "normal",
  "bump_to_front": false,
  "approval_required": 0,
  "status": "Pending",
  "description": "<p>Report details</p>",
  "project_id": null,
  "sprint_id": null,
  "parent_id": 0,
  "is_recurring": false,
  "recurring_period": null,
  "recurring_time": null,
  "recurring_total_count": 0,
  "recurring_exclude_days": [],
  "recurring_week_day": null,
  "recurring_month_date": null,
  "recurring_annual_month": null,
  "recurring_annual_date": null,
  "effort_hours": 0,
  "effort_unit": "hours",
  "depends_on": []
}
```

Advanced flow differences:

```json
{
  "due_date": null,
  "effort_hours": 4,
  "effort_unit": "hours"
}
```

Recurring flow differences:

```json
{
  "is_recurring": true,
  "status": "Recurring",
  "recurring_period": "weekly",
  "recurring_time": "09:00",
  "recurring_total_count": 8,
  "recurring_week_day": "Monday"
}
```

### 7.3 Exact current update payload example

Mobile builds a full update payload on every detail edit. All fields are sent; changing one field sends the current values of the rest.

```json
{
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER",
  "title": "Prepare weekly report",
  "assign_to": 456,
  "due_date": "2026-10-30",
  "priority": 2,
  "status": "In-Progress",
  "description": "Plain text description",
  "is_recurring": false,
  "recurring_period": null,
  "recurring_time": null,
  "recurring_total_count": 0,
  "recurring_exclude_days": [],
  "project_id": 0,
  "sprint_id": null,
  "approval_required": 0,
  "effort_hours": 4,
  "effort_unit": "hours",
  "task_priority": "normal",
  "bump_to_front": false
}
```

### 7.4 Exact current reject payload example

```json
{
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER",
  "reason": "Requirements unclear",
  "additional_hours": 120
}
```

`additional_hours` is in **minutes** in the mobile implementation (2 hours = 120).

### 7.5 Exact current status/reassign payloads

Status:

```json
{
  "status": "Complete",
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER"
}
```

Reassign:

```json
{
  "asigned_to": 789,
  "assignee": 789,
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER"
}
```

### 7.6 Exact current note form data

`POST /tasks/addnote/:taskId` uses `FormData`:

| Field | Value |
|---|---|
| `notes` | Text, with backend mention markup `@[Full Name](userId)` when applicable |
| `company_id` | number as string |
| `company_identifier` | string |
| `reply_to` | optional JSON string `{ id, user_name, content }` |
| `mentions` | optional JSON string of numeric user IDs |
| `file` | optional file |

`GET /user/note-mentions?company_id=` expects `{ Good, data: { user: MentionUser[] } }`.

`POST /tasks/showtasknote/:taskId` body is optional:

```json
{
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER"
}
```

### 7.7 Exact current dependency payloads

Get:

```text
GET /tasks/dependencies/:taskId?company_id=123
```

Add/remove:

```json
{
  "task_id": 111,
  "depends_on": 222,
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER"
}
```

Reorder critical:

```json
{
  "orderedIds": [111, 222, 333],
  "company_id": 123
}
```

Expected response:

```json
{
  "Good": true,
  "blockedTasks": [
    { "id": 222, "title": "Blocked task" }
  ]
}
```

### 7.8 Exact current extend-delay payload

```json
{
  "additional_effort": 2,
  "unit": "hours",
  "company_id": 123
}
```

Unit values sent by mobile: `"minutes" | "hours" | "days"`.

### 7.9 Exact current remaining-write payloads

Approve:

```json
{ "company_id": 123, "company_identifier": "COMPANY_IDENTIFIER" }
```

Reopen:

```json
{
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER",
  "status": "Pending",
  "priority": "2",
  "effort_hours": 4,
  "effort_unit": "hours",
  "bump_to_front": false
}
```

Reschedule reopened:

```json
{
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER",
  "effort_hours": 4
}
```

Update due date:

```json
{
  "duedate": "2026-10-30",
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER"
}
```

Update project:

```json
{
  "project_id": 55,
  "sprint_id": 66,
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER"
}
```

Update lead source:

```json
{
  "source": "source-value",
  "company_id": 123,
  "company_identifier": "COMPANY_IDENTIFIER"
}
```

---

## 8. Response/error behavior currently assumed by mobile

- Every response is expected to contain `Good`.
- `Good: false` is handled differently by action:
  - `createTask` throws.
  - `updateTask` throws.
  - `assignTaskToProject` throws.
  - `fetchAllTasks` sets error state.
  - `updateTaskStatusApi` logs the failure but does not throw after optimistic update.
  - `addNote`, `deleteNote`, `pinNote`, `approveTask`, `rejectTask`, `deleteTask`, `addDependency`, `removeDependency`, `rescheduleReopened`, `reopenTask` log failure.
  - `getDependencies`, `fetchNotes`, `fetchMentionUsers` return empty arrays on failure.
  - `reorderCritical` returns `{ blockedTasks: [] }` on failure.
  - `recalculateSchedule` swallows errors.
- Network errors still propagate unless the function catches them.
- The app does not currently use HTTP status codes for business decisions; it reads the body.

---

## 9. Shared APIs used by Task flows

### 9.1 Modules

`GET /modules/all`

- No query params.
- Auth token scopes it to the company.
- Expected:

```ts
{
  Good: boolean;
  data: {
    modules: { id: number; name: string; status: number }[];
  };
}
```

Used by `AuthContext` to resolve `hasAdvancedTaskModule`.

Mobile matches “advanced” + “task” in module names. If `company.modules` contains numeric IDs instead of names, mobile fetches this catalog and matches IDs.

### 9.2 Notification endpoints

| Function | Method + path | Request |
|---|---|---|
| `getNotifications` | `GET /notification/all` | `company_id`, `include_read` |
| `markNotificationRead` | `POST /notification/readone/:notificationId` | no body |
| `markAllNotificationsRead` | `GET /notification/readall` | `company_id` |

Task notifications are identified by non-zero `task_id` on `NotificationItem`.

Expected `NotificationItem` fields:

```ts
{
  id: number;
  title: string;
  task_id: number;
  lead_id: number;
  created_by: number;
  company_id: number;
  assigned_to: number;
  typ: string;
  identifier: string;
  description: string;
  createdAt: string;
  readed: number;
  assigned: { id, first_name, last_name, email, image };
}
```

### 9.3 Push/device endpoints

| Function | Method + path | Request |
|---|---|---|
| `registerDevice` | `POST /notification/register-device` | `fcm_token`, `expo_push_token?`, `token_type?`, `platform`, `device_name?`, `company_id` |
| `unregisterDevice` | `POST /notification/unregister-device` | `fcm_token`, `company_id?` |
| `updateDeviceToken` | `POST /notification/update-device-token` | `old_fcm_token?`, `new_fcm_token`, `company_id?` |
| `resetBadge` | `POST /notification/reset-badge` | `company_id` |
| `getPushNotificationSettings` | `GET /notification/settings` | no body |
| `updatePushNotificationSettings` | `POST /notification/settings` | `task_assigned?`, `task_status_changed?`, `task_comment?`, `task_mention?`, `chat_message?`, `chat_mention?`, `channel_invite?`, `push_enabled?` |

### 9.4 Other shared user/project APIs

| Function | Method + path | Request | Used by |
|---|---|---|---|
| `getProjectUsers` | `GET /username/project-users` | `company_id` | Project owner pickers |
| `getMentionUsers` | `GET /user/note-mentions` | `company_id` | Task comment mentions |
| `getModules` | `GET /modules/all` | none | Advanced task module resolution |

---

## 10. Project APIs currently coded in the mobile app

The Project module is disabled, but these functions exist. They are relevant because the Task module includes project assignment/project tasks and will be activated later.

| # | Function | Method + path | Request | Response expected |
|---|---|---|---|---|
| 1 | `getAllProjects` | `GET /projects` | `company_id` | `{ Good, data: { projects: Project[] } }` |
| 2 | `getAllProjectsForAssignment` | `GET /projects` | `company_id`, `scope=all` | same as above; function unused |
| 3 | `getProjectsList` | `GET /projects/list` | `company_id` | `{ Good, projects: {id,name}[] }`; unused |
| 4 | `createProject` | `POST /projects/create` | `{ name, owner, status, description?, company_id, due_date? }` | `{ Good, data: { id } }` |
| 5 | `updateProject` | `POST /projects/update/:id` | partial/full `{ name?, owner?, status?, description?, due_date?, company_id?, company_identifier? }` | `{ Good, data: string }` |
| 6 | `deleteProject` | `DELETE /projects/delete/:id` | no body | `{ Good, data: string }`; unused |
| 7 | `getProjectDetail` | `GET /projects/detail/:id` | no query | `{ Good, data: ProjectDetail, status: string[], priority: {id,name}[] }` |
| 8 | `uploadProjectAttachment` | `POST /projects/attachments/:projectId` | FormData | `{ Good }`; unused |
| 9 | `deleteProjectAttachment` | `POST /projects/attachmentdelete/:attachmentId` | no body | `{ Good }`; unused |
| 10 | `getProjectUsers` | `GET /username/project-users` | `company_id` | `{ Good, data: { user: {id,first_name,last_name}[] } }` |

### 10.1 Project types currently assumed

```ts
ProjectStatus = "Planning" | "In Progress" | "Pending" | "Completed"

Project = {
  id: number;
  name: string;
  status: ProjectStatus;
  due_date?: string | null;
  owner?: number;
  description?: string;
}

ProjectDetail = {
  name: string;
  status: ProjectStatus;
  description: string;
  due_date: string;
  attachments: { id: number; attachment: string }[];
  owner: number;
  created_by: number;
  created_by_user: { id, first_name, last_name? };
  tasks: TaskListItem[];
  sprints?: ProjectSprint[];
}

ProjectSprint = {
  id: number;
  title: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}
```

### 10.2 Project tasks currently implemented

`ProjectDetailModal.tsx`:

- Loads project detail (`GET /projects/detail/:id`).
- Displays/edits:
  - project name
  - owner
  - status
  - due date
  - description
- Saves with `POST /projects/update/:id`.
- Project owner candidates are merged from `projectState.projectUsers` (`GET /username/project-users`) and `taskState.taskOwners`.
- Save payload currently includes `name`, `owner`, `status`, `description`, `due_date` (ISO string), `company_id`, `company_identifier`.
- Shows `PROJECT SPRINTS` from `ProjectDetail.sprints`.
- "Create Sprint" is a placeholder toast; no sprint create API is wired.
- Project attachments button is a placeholder toast.
- Displays `PROJECT TASKS` using `SingleTaskTable`.
- Project task status change:
  - calls `updateTaskStatusApi`
  - then reloads project detail.
- Project task assignee change:
  - calls `reassignTask`
  - then reloads project detail.
- Project task list is paginated client-side at 20 rows.
- Project tasks come from `ProjectDetail.tasks`, not from `/tasks/all`.
- `ProjectDetailModal` passes `canReassign={true}` unconditionally (not gated by `is_head` like the Tasks screen); status editing still respects each task's `canEditStatus`.

`AssignTaskProjectModal.tsx`:

- Loads project list from `ProjectContext` / `GET /projects`.
- Search by project name.
- Selects one project.
- Calls `onAssign(projectId, project)`.
- The task screen callback (currently commented out) calls `assignTaskToProject`, which uses `POST /tasks/updatetaskproject/:taskId`.

Current task-screen project actions (disabled):

- `canAssignProject` permission check.
- swipe `Project` button.
- `handleAddToProjectPress`.
- `AssignTaskProjectModal` render.

### 10.3 Project permissions currently defined

| Helper | Permission key | Current usage |
|---|---|---|
| `canViewProjects` | `project-list` | Used by ProjectContext auto-load |
| `canCreateProject` | `project-create` | Coded; used by disabled task project assign |
| `canEditProject` | `project-edit` | Coded; unused |
| `canDeleteProject` | `project-delete` | Coded; unused |
| `canAccessProjectsQuickMenu` | any of the four above | Coded; quick menu disabled |

ProjectContext also auto-loads projects/users once per company session only when `canViewProjects` is true.

---

## 11. Permissions and frontend checks currently implemented

### 11.1 Global task checks

| Check | Code | Effect |
|---|---|---|
| Create task | `canCreateTask(user) = isUserHead(user)` | Shows create FAB, opens create modal, enables row reassignment. |
| `is_head` parsing | any non-empty value except `0`, `false`, `no` | String comparison on `user.is_head`. |
| View tasks | `canViewTasks` = `tasks-list` permission | Defined but **not used** by the Task screen. |
| Task tab visibility | none | Any authenticated user can open the Tasks tab. |

### 11.2 Per-task checks

- API-provided flags are authoritative:
  - `can_edit`
  - `can_edit_status`
  - `can_edit_subtask`
- Detail modal uses `can_edit` (falls back to previous prop `canEdit`; unset means editable).
- Row completion checkbox and status dropdown use `canEditStatus !== false`.
- Reassignment is gated only by `is_head`; no per-task `can_reassign` flag is used.
- Backend is presumably also enforcing permissions; mobile is mostly hiding/disabling controls.

### 11.3 Business checks currently enforced on the client

1. **Create validation:**
   - title required
   - assignee required
   - due date required (normal) or effort > 0 (advanced)
   - priority required

2. **Reject validation:**
   - reason required
   - optional additional effort, converted to minutes

3. **One In-Progress task:**
   - When changing status to `In-Progress`, mobile checks `taskState.assignedToMe` for another task already in progress.
   - If found, shows “Another task is already in progress. You can only have one task in progress at a time.”
   - This check does not scan created-by-me or all-other buckets.
   - It is a client-side check only.

4. **Critical conflict:**
   - Before creating a critical task, if the assignee has an active critical task, show popup.
   - User chooses bump-to-front or wait.

5. **Status change to Rejected:**
   - Always routes through reject modal; does not call status endpoint directly.

6. **Task detail edit permission:**
   - All inline edits gated by `can_edit`.

7. **Task list status filter:**
   - Only Pending, In-Progress, On Hold, Completed are offered.
   - Recurring is handled through recurrence data.

8. **Comment mention validation:**
   - `@` must start a new token
   - query cannot contain spaces
   - max query length 32
   - current user excluded from suggestions
   - max 6 suggestions

9. **Attachment picking (create):**
   - Document picker validates extensions against the allowed list:
     `png, jpg, jpeg, pdf, doc, docx, csv, txt, zip, rar, sql, ppt, xls, xlsx, svg, webp, avif`
   - Files are not uploaded by create currently.

10. **Overdue detection (client):**
    - due date in the past
    - status not Completed
    - once-per-session summary toast and once-per-session delay prompt

### 11.4 Permission helpers defined but unused by Task UI

- `canViewTasks`
- `canEditTask`
- `canEditStatus`
- `canDeleteTask`
- `canReassignTask`
- `canApproveReject`
- `canCreateSubtask`

There is currently **no approve UI**, **no reopen UI**, **no delete-task UI**, and **no subtask UI**.

---

## 12. Business logic implemented in mobile

### 12.1 Task list loading

`TaskContext.fetchAllTasks(companyId, { silent? })`:

- In-flight deduplication: concurrent calls share the same promise.
- Foreground load is two-phase:
  1. `GET /tasks/duetoday` first, show it with `isPartialLoad: true`.
  2. `GET /tasks/all` second, merge and replace with full data.
- Silent load fetches both endpoints in parallel and merges by task `id`.
- Merge keeps the first occurrence and fills missing tasks from the other response.
- Main screen calls it on mount/company change.
- Pull-to-refresh calls it silently.
- `fetchDueToday`, `fetchFiltered`, and `setActiveFilter` are exposed but unused by the screen.

### 12.2 Optimistic updates

- `updateTaskStatusLocal` patches all three buckets immediately.
- `updateTaskStatusApi` applies optimistic status first, then calls API.
- `updateTaskLocal` patches a task after a detail edit before API response.
- `updateTask` calls `updateTaskLocal`, then `updateTask` API, then throws on failure.
- `assignTaskToProject` optimistically patches `project_id`.
- Detail edits reload detail after save but do not refetch all tasks.
- List status changes do not roll back on `Good:false`; failure is logged.

### 12.3 Fetch/refresh behavior

- Socket events trigger debounced silent refetch.
- Pull-to-refresh triggers silent refetch.
- Create success triggers silent refetch.
- Reassign triggers silent refetch.
- Reject from the list triggers parent refetch on success.
- Detail edit does **not** refetch the list.
- Project task status/assignee change in `ProjectDetailModal` reloads project detail.

### 12.4 Overdue/delay

- Client detects overdue tasks.
- Summary toast shown once per session.
- Delay popup shown once per session for the earliest overdue task created by the current user and assigned to someone else.
- Delay extension calls `extendDelayedTask`.
- Mobile expects backend to emit `task_update` `schedule_update` with:
  - task `id`
  - `due_date`
  - `remaining_effort_hours`

### 12.5 Recurring tasks

- Create UI supports daily, weekly, monthly, annually.
- `quarterly` and `semi-annually` are supported by types but not offered by UI.
- Backend is expected to create/advance recurring instances (mobile does not create instances itself).
- Mobile has no series-edit/delete UI yet.

### 12.6 Dependencies

- Create UI can select multiple dependencies from Pending/In-Progress tasks.
- Detail shows existing dependencies in a read-only table.
- Add/remove dependency APIs exist but are not wired.
- Mobile does not perform cycle detection; backend must enforce.
- `reorderCritical` response can include `blockedTasks`; current UI does not display it.

### 12.7 Critical tasks

- `task_priority` is normal or critical.
- Critical tasks are sorted first by `critical_order`.
- Conflict popup on create.
- `bump_to_front` sent per user choice.
- `reorderCritical` API coded but UI path unreachable.

### 12.8 Advanced Task Module

- Mobile resolves advanced mode from company modules.
- Advanced create uses effort instead of manual due date.
- Scheduling engine is expected on backend.
- Mobile expects `task_update` `schedule_update` events for date/effort changes.
- Detail still shows/edits due date and effort; backend contract for advanced edit is unclear.

### 12.9 Approvals

- `approval_required` is sent on create/update.
- `Pending-Approval` status exists in types.
- Approve/reject APIs exist.
- Mobile has no approve button and no approval-history UI.
- Reject is available through the status picker/reject modal.

### 12.10 Subtasks

- `ViewTaskData` has `sub_tasks`, `subtask_count`, `parent_id`.
- `can_edit_subtask` flag exists.
- `createSubtask` API exists.
- No UI currently creates or displays subtasks.

### 12.11 Leads

- Push type `lead` routes to the Tasks tab.
- `updateLeadSource` API exists but is unused.
- `NotificationItem` has `lead_id`.
- Relationship between leads and tasks is not implemented beyond the above.

---

## 13. Socket events and realtime behavior

### 13.1 Connection

- One global Socket.IO singleton.
- JWT handshake.
- Transports: websocket + polling.
- Infinite reconnection.
- App connects when authenticated and not using default password.
- `connectSocket()` is idempotent.
- Shared lifecycle events: `connect`, `disconnect`, `connect_error`; task listeners are registered immediately when a socket exists, otherwise on `connect`.

### 13.2 Task socket listeners

Mounted by `useTaskSocket()` from `TasksScreen` only.

No task rooms exist. All task events are company-wide broadcasts; every listener filters by `company_id`.

| Event | Payload currently expected | Mobile behavior |
|---|---|---|
| `task_update` | `{ company_id, action, data, assignee?, asigned_to? }` | If `action === "schedule_update"` and `data.id` exists, patch `due_date` and `remaining_effort_hours` locally. All other actions trigger a 400 ms debounced silent full refetch. |
| `priority_update` | `{ company_id, action: "create"\|"update"\|"delete", data: { id, name?, color?, order?, company_id? } }` | Create appends; update replaces by ID; delete removes. |
| `jobstatus_update` | `{ company_id, action: "create"\|"update"\|"delete", data: { id, name?, company_id?, status? } }` | Only `create` appends the status name; update/delete are no-ops. |
| `project_update` | `{ company_id, action, data? }` | Debounced silent task refetch. |
| `user_update` | `{ company_id, action, data? }` | Debounced silent task refetch (owners). |
| `task_scheduling_settings_update` | `{ company_id }` | Debounced silent task refetch. |

`task_update` actions currently recognized by types:

```text
create
create_subtask
update
status_update
delete
sprint_assigned
schedule_update
add_note
update_note
delete_note
update_note_pin
update_note_reaction
add_attachment
delete_attachment
```

Example payload shapes (illustrative; the exact `data` contents for each action need backend confirmation because mobile mostly refetches on non-schedule actions):

```json
{
  "company_id": 123,
  "action": "status_update",
  "data": { "id": 111, "task_id": 111, "status": "Complete" }
}
```

```json
{
  "company_id": 123,
  "action": "schedule_update",
  "data": {
    "id": 111,
    "due_date": "2026-10-30T00:00:00.000Z",
    "remaining_effort_hours": 4
  }
}
```

No task-specific event room joining exists.

### 13.3 Other task-related listeners

- `TaskDetailModal` also listens to `task_update` while visible:
  - filters by company
  - compares `data.task_id` or `data.id` with the open task
  - note/attachment actions reload notes
  - any action reloads detail
- `CreateTaskModal` listens to `user_update` while visible and silently refetches task owners.
- `NotificationContext` listens to `task_update` for note mentions and creates local `task_mention` notifications/toasts.
- Shared socket events affecting Task flows:
  - `notification` -> `NotificationContext` silently refreshes the inbox; task notifications are identified by `task_id`.
  - `role_update` -> `AuthContext` refreshes `user_permissions`; task permission flags from the API should be rechecked/refetched after role changes.
- `ChatContext` has a separate `project_update` listener that is inert for Chat because project rooms are filtered out.

### 13.4 Missing/unknown realtime cases

We need backend to confirm:

- exact payload for every action
- whether payload includes full task or only IDs
- event ordering
- idempotency/duplicate behavior
- whether mobile should patch or refetch
- whether socket events are company-scoped or user-scoped
- reconnect/resync strategy
- whether `project_update` is used for tasks, projects, or both
- whether sprint events exist
- whether permission/role changes have task-specific events

---

## 14. Task notifications and push

### 14.1 Notification inbox

- Header bell opens `InboxModal`.
- Full Inbox: `app/notifications.tsx`.
- `NotificationItem.task_id` non-zero identifies a task notification.
- Chat notification branch is handled first; task branch opens detail.
- Task notification tap:
  1. `viewTask(task_id, company_id)`
  2. `buildTaskDetailFromViewTask`
  3. open `TaskDetailModal`.

### 14.2 Local task mention notifications

`NotificationContext` listens to `task_update`:

- action must be `add_note` or `update_note`
- company must match
- note text must mention current user
- author must not be current user
- extracts mention IDs from note text
- shows toast: `<author> mentioned you`
- adds local notification:
  - negative ID
  - title `Mentioned you in a comment`
  - `task_id` from `data.task_id` or `data.mod_id`
  - `typ: "task_mention"`
  - `identifier: "task"`
  - `assigned` = author

### 14.3 Push payloads

`PushNotificationData`:

```ts
{
  type: "task" | "tasks" | "lead" | "chat" | "notification";
  task_id?: string;
  lead_id?: string;
  room_id?: string;
  filter?: string;
  screen?: string;
}
```

Current mobile handling:

| Type | Mobile action |
|---|---|
| `task` | `/(tabs)/tasks` with `params.taskId` (opens detail) |
| `tasks` | `/(tabs)/tasks` with `params.filter` if present; screen currently ignores filter |
| `lead` | `/(tabs)/tasks`; no separate lead screen |
| `notification` / default | `taskId` detail if present, else `/(tabs)/tasks` |
| `chat` | Existing chat conversation deep link |
| null data | `/(tabs)/tasks` |

Cold-start behavior:

- Pending tap is stashed until auth is ready.
- Splash screen consumes it and navigates after boot.
- This prevents the default tab redirect from overriding the deep link.

### 14.4 Push settings fields

- `task_assigned`
- `task_status_changed`
- `task_comment`
- `task_mention`
- `push_enabled`
- plus chat settings.

Task push sending is assumed to be backend-only.

---

## 15. State management, caching, and persistence

- `TaskContext` uses one `useReducer`.
- No persistent task storage.
- No local task database.
- No offline queue.
- No retry queue.
- Optimistic updates live only in memory.
- App restart refetches tasks.
- Task owners/priorities/status lists come from `/tasks/all` / `/tasks/duetoday`.
- `statusList` is stored in TaskContext but not currently used by the Task UI; status options are hard-coded.
- `priorities` is used by the task detail priority picker.
- `logout()` resets TaskContext but currently has no caller; in-process logout/login may retain stale task state until the next fetch.
- Shared `SearchContext` holds task search text and header compact state.
- Task detail comment mentions load from backend each time needed.
- Create-task owner list refreshes on `user_update`.
- No pagination on `/tasks/all`; all filtering/pagination is client-side.
- Task list may hold 500+ tasks for some companies; this is why two-phase fetch and in-flight dedupe exist.

---

## 16. Current gaps, dead code, and assumptions

### 16.1 Implemented and currently active

- Tasks dashboard with 8 tabs.
- Client-side filter/search/sort/pagination.
- Pull-to-refresh.
- Create task (normal and advanced).
- Recurring create settings.
- Create-time dependencies.
- Task detail view.
- Inline detail edits.
- List status changes.
- List reassignment (heads).
- Reject flow.
- Comments, mentions, pin, delete.
- Task notification popup and full Inbox.
- Task push deep links.
- Task mention local notifications.
- Overdue summary toast.
- Delay extension popup.
- Socket-driven refresh.
- Loading skeleton.
- Task owner merge into Chat.

### 16.2 Coded but not wired

| Feature | API/component |
|---|---|
| Approve task | `approveTask` |
| Reopen task | `reopenTask`, `rescheduleReopened` |
| Delete task | `deleteTask` |
| Subtasks | `createSubtask`, no UI |
| Dependency add/remove | `addDependency`, `removeDependency` |
| Server-side task filter | `getFilteredTasks`, `fetchFiltered` |
| Manual due-date update endpoint | `updateTaskDueDate` |
| Lead source update | `updateLeadSource` |
| Note edit | `updateNote` |
| Note reactions send | `updateNoteReaction` |
| Task attachments upload/delete | `uploadAttachment`, `deleteAttachment` |
| Critical reorder modal | `OrderCriticalTasksModal`, `reorderCritical` |
| Recalculate schedule | `recalculateSchedule` |
| Priority/effort migrations | `migratePriorities`, `migrateEffortToMinutes` |
| Task refresh header | `TaskRefreshHeader` |
| Project assignment | `AssignTaskProjectModal`, `assignTaskToProject` |
| Project module | `ProjectProvider` unmounted |

### 16.3 Client-side assumptions requiring backend confirmation

1. `GET /tasks/all` and `/tasks/duetoday` are unpaginated and return all buckets.
2. `GET /tasks/filter` uses the `TaskFilter` strings already defined.
3. `tasksByme` spelling is stable.
4. `asigned_to` is the canonical assignment field, with `assignee` as a mirror.
5. `task_assignee` means creator display and `task_assigned_to` means assignee display.
6. `updateTask` is a full replace payload.
7. Status values `Complete`/`In-Progress` are canonical API values.
8. Company statuses are a mix of these plus custom values; list filter intentionally uses four.
9. Reject `additional_hours` is minutes.
10. `task_update` is company-wide and can be handled by a single refetch.
11. `schedule_update` uses `remaining_effort_hours` to mean remaining effort.
12. Advanced module is detected from company module names/IDs.
13. Advanced create sends `due_date: null` and backend schedules.
14. One in-progress task is a hard business rule, not only a UI suggestion.
15. Critical conflict should be resolved before create; `bump_to_front` controls scheduling.
16. `reorderCritical.orderedIds` can include the new task ID.
17. `blockedTasks` is a warning list; mobile does not currently render it.
18. Only one note can be pinned per task.
19. Backend parses `@[Full Name](userId)` mention markup.
20. `mentions` JSON is required for mention notifications.
21. Task notes are ordered pinned-first by mobile after fetching.
22. Task attachment paths can be resolved by the existing secure-file proxy.
23. `notifications` with `task_id` are task notifications.
24. Task push payload `task_id` may be a string.
25. `type: "lead"` push means a task/lead-related item in Tasks.
26. No separate task socket rooms are required.
27. Project module can be activated by mounting `ProjectProvider` and re-enabling UI once contract is confirmed.
28. `ProjectDetail.tasks` is the canonical project task list.
29. Sprints are read-only from `ProjectDetail.sprints`; there is no create-sprint API wired.
30. Project task assignment uses `/tasks/updatetaskproject/:taskId`.

If any of these are wrong, please correct them in your response.

---

## 17. Project-in-Task implementation details

### 17.1 Current project-related task fields

`TaskListItem`:

- `project_id`
- `sprint_id`
- `project_name` is present in `ViewTaskData`, not necessarily in list items.

`ViewTaskData.task`:

- `project_id`
- `project_name`
- `sprint_id`
- `sprint_name`

Create task:

- sends `project_id: null`
- sends `sprint_id: null`
- sends `parent_id: 0`

Detail edit:

- preserves `project_id` and `sprint_id` from the API unless a project assign action changes them.

### 17.2 Disabled project actions in Tasks

In `tasks.tsx`, these are commented out:

- `AssignTaskProjectModal` import/render.
- `assignTaskToProject` from TaskContext.
- `canAssignProject` permission check.
- `handleAddToProjectPress`.
- `handleAssignProjectToTask`.
- `Project` column/button on swipe rows.

In `SingleTaskTable`, the project button only appears if `canAssignProject` is true. The Tasks screen currently does not pass it.

In `ProjectDetailModal`, project tasks can change status/assignee using the same task APIs, but the modal itself is unreachable.

`TaskContext.assignTaskToProject` currently sends only `project_id` and does **not** pass `sprint_id`, even though `UpdateProjectRequest` allows it (`src/context/TaskContext.tsx:971-1007`).

### 17.3 Project provider state

`ProjectProvider` is not mounted in the root layout.

The Chat-side Projects UI is also disabled:

- Projects chip in the chat list is commented out.
- `CreateProjectModal` and `ProjectDetailModal` renders in `chat.tsx` are commented out.
- Project-type rooms are filtered out of the chat list.
- Tasks-tab long-press for the project quick menu is commented out in `CustomTabBar`.

`ProjectContext` currently supports:

- `fetchProjects` (`GET /projects`)
- `fetchProjectUsers` (`GET /username/project-users`)
- `createProject` (`POST /projects/create`)

`ProjectDetailModal` calls services directly for:

- `GET /projects/detail/:id`
- `POST /projects/update/:id`

`ProjectContext` does **not** currently expose:

- project detail
- project update
- project delete
- project attachments
- sprints
- project task assignment

### 17.4 Project UI currently implemented

- `CreateProjectModal`:
  - name
  - owner
  - status
  - due date
  - description
- `ProjectDetailModal`:
  - name
  - owner
  - status
  - due date
  - description
  - attachments placeholder
  - sprints table
  - create-sprint placeholder
  - project tasks table with status/reassign
- `ProjectQuickMenuModal`:
  - project quick menu, currently unreachable.
  - The old interaction was a long-press on the Tasks tab in `CustomTabBar`; that long-press and the modal render are commented out.
- `AssignTaskProjectModal`:
  - select/search a project for a task.

### 17.5 Project permissions currently defined

- `project-list` -> view projects
- `project-create` -> create projects / add task to project
- `project-edit` -> edit projects
- `project-delete` -> delete projects
- `canAccessProjectsQuickMenu` -> any of the four

Only `canViewProjects` is currently used for auto-load gating. `canCreateProject` is used only in disabled code.

### 17.6 Project questions

The backend response must let us safely activate project features in the Task module. See Q66-Q80.

---

## 18. Questions for the backend and website frontend teams

Please answer by number. If a question does not apply, say “not applicable” and explain briefly. If an endpoint changed, please provide the old and new contracts. The backend team should answer groups A-N; the website frontend team should answer group O and all website UI/flow/check parts of group N.

### A. Current endpoint existence and compatibility

**Q1.** Does `GET /tasks/all?company_id=...` still exist with the same response shape (`task_owner`, `priority`, `status`, `tasks_assigned_to_me`, `tasksByme`, `all_other_tasks`)?

**Q2.** What does the optional `skipTasks=true` query parameter do? Is it still supported?

**Q3.** Does `GET /tasks/duetoday?company_id=...` still exist with the same response shape? What exactly does “due today” mean (timezone, inclusive boundaries, overdue inclusion)?

**Q4.** Does `GET /tasks/filter?company_id=...&filter=...` still exist? What are the accepted filter values and response shape? Is it intended for mobile use, or should mobile keep client-side filtering?

**Q5.** Does `POST /tasks/view/:taskId` still accept `{ company_id }`? Is the expected response still `data.task` with notes, attachments, sub-tasks, effort logs, and task notifications?

**Q6.** Do all task endpoints still require both `company_id` and `company_identifier` where this document shows them? Which endpoints do **not** need `company_identifier`?

**Q7.** Are any task endpoints deprecated, renamed, or moved from `/tasks/*`?

**Q8.** Are any new task endpoints required for mobile that are not listed in Section 7?

**Q9.** Are there task endpoints used by the website that are missing from this document? Please list them with their purpose.

### B. Create task

**Q10.** Is the `CreateTaskRequest` in Section 7.2 still the exact required schema? Which fields are required and which are optional?

**Q11.** Is `project_id: null` / `sprint_id: null` accepted, or should omitted/null differ?

**Q12.** Is `parent_id: 0` correct for a normal task? What is the correct way to create a subtask (`/tasks/createsubtask/:parentId`)?

**Q13.** Is `status` allowed to be `Recurring`, `Rejected`, or `Pending-Approval` at create time? What values does the backend accept?

**Q14.** Is `due_date` required for non-advanced companies? What exact format/timezone do you expect?

**Q15.** For advanced companies, should `due_date` be `null`, omitted, or a computed value? What does the scheduling engine expect?

**Q16.** Is `task_priority` independent of company priority `priority`? Which one should the mobile create form send if the company has custom priority names?

**Q17.** What does `bump_to_front` do exactly, and when should mobile send it true?

**Q18.** What is the exact validation for recurring fields for each period (daily/weekly/monthly/annually/quarterly/semi-annually)? Which fields are required per period?

**Q19.** What is the exact recurring time format and timezone?

**Q20.** What does `recurring_total_count = 0` mean: unlimited, unset, or no recurrence?

**Q21.** Are `quarterly` and `semi-annually` supported by the backend? If yes, what UI rules should we use?

**Q22.** Does `depends_on` need to reference only Pending/In-Progress tasks, or any task? Does the backend validate and reject cycles?

**Q23.** Are create-task attachments expected in `POST /tasks/create`, or must we call `POST /tasks/attachments/:taskId` after creation? Please provide the exact attachment flow.

**Q24.** Is `POST /tasks/create` idempotent? Does it support a client request ID to prevent duplicates on retry?

### C. Update task and status

**Q25.** Is `updateTask` a full replace, partial update, or both? If a field is omitted, is it cleared or left unchanged?

**Q26.** Which fields are required in `UpdateTaskRequest`? Is `priority` a numeric priority ID, a name, or both?

**Q27.** Does `updateTask` recalculate the schedule/due date? Does it trigger `task_update` `schedule_update`?

**Q28.** Should status changes use `POST /tasks/updatetaskstatus/:taskId` or `POST /tasks/update/:taskId`? The mobile detail currently uses `updateTask` while the list uses `updateTaskStatus`. Which is correct?

**Q29.** What are the allowed status transitions? Who can perform each transition (creator, assignee, head, admin, approver)?

**Q30.** Is the “only one In-Progress task per user” rule enforced by the backend? Is it per company, per assignee, or global? Does it include tasks outside `assignedToMe`?

**Q31.** What happens when a task is set to `Complete`? Does the backend set `completed_at`, update effort, or recalculate the schedule?

**Q32.** Does `updateTask`/`updateTaskStatus` accept `"Completed"` as well as `"Complete"`, or only one?

**Q33.** What are the exact permission flags semantics for `can_edit`, `can_edit_status`, `can_edit_subtask`?

**Q34.** Why does mobile have both `assignee` and `asigned_to`? Which is authoritative? Should reassign send both?

**Q35.** Does reassignment require the target user to have a specific permission or project membership?

### D. Approval, rejection, delete, reopen

**Q36.** What is the exact approval workflow? Which statuses require approval, who can approve/reject, and what API/UI should mobile use?

**Q37.** Is `approveTask` still valid? What body/response? Does it notify the assignee?

**Q38.** Is `rejectTask` still valid? Is `additional_hours` really in minutes? Is `reason` required and is there a max length?

**Q39.** After rejection, what status does the task become? Is a new task created? Does it reopen automatically?

**Q40.** Is `deleteTask` a hard delete or soft delete? Does it delete subtasks/dependencies/notes/attachments? Who can delete? Is there a confirmation requirement?

**Q41.** What is the reopen flow? When should mobile show “Reopen”? What are the exact `reopenTask` and `rescheduleReopened` semantics?

### E. Dates, IDs, and time zones

**Q42.** Are task IDs always numeric integers? Are they ever strings/ObjectIds?

**Q43.** Is `task_id` in push payloads always a string? Should mobile parse it as a number?

**Q44.** What exact date format does each endpoint expect: ISO 8601, `YYYY-MM-DD`, Unix timestamp, or other?

**Q45.** What timezone are due dates, recurring times, “due today”, and overdue rules evaluated in: company timezone, device timezone, or UTC?

**Q46.** What are `created_at`, `start_date`, `completed_at`, and `actual_completion` formats?

### F. List/filter/sort/pagination

**Q47.** Are `/tasks/all` and `/tasks/duetoday` still unpaginated? If pagination was added, what are the query/response parameters?

**Q48.** What is the canonical sort order? Should mobile rely on backend order or sort locally?

**Q49.** What exactly do the three buckets mean: `tasks_assigned_to_me`, `tasksByme`, `all_other_tasks`? Can a task appear in more than one bucket?

**Q50.** Does `/tasks/all` include project tasks, sprint tasks, deleted tasks, completed tasks, and recurring series? Any filters?

**Q51.** Is there a task count endpoint or should mobile keep computing counts from the full list?

**Q52.** What does `/tasks/filter` return for each filter value? Is it paginated?

**Q53.** Does the backend support project/sprint filtering on task list endpoints? If not, which endpoint should mobile use for “tasks in project X” and “tasks in sprint Y”?

**Q54.** Should mobile use server-side search, or is client-side search over the loaded list acceptable? Is there a search endpoint?

### G. Dependencies and critical tasks

**Q55.** Confirm the dependency direction: does `{ task_id, depends_on }` mean “task_id depends on depends_on”?

**Q56.** What statuses are allowed as dependencies? Does the backend enforce cycle detection?

**Q57.** What does the scheduling engine do with dependencies? Does it change `due_date`/`start_date` automatically?

**Q58.** What is `reorderCritical.orderedIds` expected to include? Does it include the new task? Are IDs task IDs or something else?

**Q59.** What do `blockedTasks` mean, and how should mobile display them?

**Q60.** Is there a maximum number of critical tasks per assignee? Should mobile enforce the conflict popup, or does backend reject?

**Q61.** Should mobile use `POST /tasks/reorder-critical` after creating a critical task? Is `bump_to_front` enough?

### H. Notes, mentions, attachments

**Q62.** Is `POST /tasks/addnote/:taskId` still a multipart endpoint with `notes`, `company_id`, `company_identifier`, optional `reply_to`, `mentions`, and `file`?

**Q63.** What is the exact expected `reply_to` shape: `{ id, user_name, content }` or `{ note_id, user_id, content }`?

**Q64.** Is `@[Full Name](userId)` the correct mention markup? Does the backend parse plain `@Full Name` too?

**Q65.** Are mention notifications generated by the backend? Should mobile also create local notifications?

**Q66.** Is only one note allowed to be pinned per task? What does `pin_top` mean?

**Q67.** Are note edits time-limited or permission-limited? What about note deletion?

**Q68.** Are note reactions toggled or set? What is the exact reaction payload/response? Does the backend return the full reaction list?

**Q69.** Are task attachments and note attachments separate? What is the exact upload flow, max size, allowed types, and secure-file URL behavior?

**Q70.** Why does mobile have both `POST /tasks/attachments/:taskId` and `POST /tasks/addnote/:taskId` with a file? Which should be used for task attachments vs comment attachments?

**Q71.** Is the existing secure-file proxy (`/api/v1/secure-file?p=...`) still the correct way to download task attachments? Should mobile send auth headers?

### I. Socket events

**Q72.** Please provide the exact payload schema for every `task_update` action, including which fields are in `data`, whether a full task is included, and who receives each event.

**Q73.** Is `task_update` company-wide or user-specific? Are there task rooms we should join?

**Q74.** Is `schedule_update` still sent with `data.id`, `data.due_date`, and `data.remaining_effort_hours`? Should mobile patch or refetch?

**Q75.** What are the exact payloads for `priority_update`, `jobstatus_update`, `user_update`, `project_update`, and `task_scheduling_settings_update`?

**Q76.** Are there new task socket events (for example, approval, sprint, project assignment, reminders, overdue, recurring) that mobile must handle?

**Q77.** How should mobile handle missed events after reconnect: full refetch, event replay, or both?

**Q78.** Are events ordered and idempotent? Can the same event arrive multiple times?

**Q79.** Does `project_update` notify task changes (project assignment/due date) as well as project changes? Should `useTaskSocket` keep refetching tasks on it?

### J. Permissions and frontend checks

**Q80.** Please provide the complete task permission matrix: permission key, scope (company/role/project/task), who has it, and which action it gates.

**Q81.** Is `is_head` still the correct rule for create-task? Is there a separate `task-create` permission? Should mobile use `is_head` or `user_permissions`?

**Q82.** What are the exact website checks for create/edit/status/reassign/delete/approve/reject/subtask/comment/mention/attachment? Which controls are hidden vs disabled?

**Q83.** Are there role-based checks (company admin, SaaS admin, department head, project owner) that mobile is missing?

**Q84.** Should the mobile Tasks tab be visible to every authenticated user, or only users with `tasks-list` permission?

**Q85.** Are project permissions independent of task permissions? What does a user need to assign a task to a project, view project tasks, or change project-task status?

### K. Notifications and push

**Q86.** What exact task notification `typ` values does the backend send (for example `task_mention`, `task_assigned`, `task_status`, `task_comment`)?

**Q87.** What do `task_id`, `lead_id`, `identifier`, and `description` contain for each task notification type?

**Q88.** When are task pushes sent, and what exact payloads (`type`, `task_id`, `lead_id`, `filter`, `screen`) do they contain?

**Q89.** What should `type: "tasks"` with `filter` do on mobile? Which filter values are valid?

**Q90.** What should `type: "lead"` do? Is a lead a task, or does it need a separate screen/API?

**Q91.** Are push settings still the same fields? Which settings gate which task notifications?

**Q92.** Does `x-client-platform: mobile` still filter notifications/pushes? Does it hide task notifications?

**Q93.** Should the backend generate the “mentioned you in a comment” notification/push, or should mobile keep generating the local in-app notification?

### L. Advanced module, effort, scheduling

**Q94.** What is the canonical way for mobile to know a company uses Advanced Task Module? Is `company.modules` reliable, or is there a dedicated flag?

**Q95.** In advanced companies, should `due_date` be null/omitted on create and update? Should mobile still allow manual due-date edits in detail?

**Q96.** What is the exact effort unit model: minutes, hours, days? Are `effort_hours` and `effort_unit` both required? How does `remaining_effort_hours` relate to `effort_hours`?

**Q97.** What is the scheduling engine’s expected behavior for dependencies, critical tasks, recurring tasks, and effort changes?

**Q98.** What are effort logs, and when should mobile create/display them? Which endpoint returns them?

**Q99.** What is the correct flow for extending delayed tasks? Does `extendDelayedTask` update due date, remaining effort, or both? Does it emit `schedule_update`?

**Q100.** Should mobile call `recalculateSchedule` after status changes or edits, or does the backend do it automatically?

### M. Projects in the Task module

**Q101.** Please provide the complete current Project API contract: list, detail, create, update, delete, attachments, project users, and project tasks.

**Q102.** What is the exact difference between `GET /projects`, `GET /projects?scope=all`, and `GET /projects/list`? Which should mobile use for the Assign-to-Project picker?

**Q103.** What are the canonical project status values and transitions? Are they the same as mobile’s `Planning`, `In Progress`, `Pending`, `Completed`?

**Q104.** What is the exact `GET /projects/detail/:id` response? Does it still return `data.tasks` and `data.sprints`? Are `status` and `priority` top-level siblings of `data`?

**Q105.** Which endpoint should mobile use to assign/unassign a task to/from a project? Is `POST /tasks/updatetaskproject/:taskId` current and correct? Does it require `sprint_id`?

**Q106.** What are the permissions/checks for assigning a task to a project, moving it between projects, and removing it from a project?

**Q107.** What is the complete sprint contract: list, create, update, delete, assign task to sprint? Is `ProjectSprint` shape current? Why is “Create Sprint” not implemented on mobile yet?

**Q108.** Should project tasks be fetched through `GET /projects/detail/:id`, `/tasks/all?project_id=...`, or another endpoint? Which is the website using?

**Q109.** Who can view a project and its tasks? Do project tasks inherit project permissions or task permissions?

**Q110.** What are the exact website frontend checks for project tasks (status changes, reassignment, assignment, removal, sprint changes, attachments)?

**Q111.** Can a task belong to multiple projects/sprints? Can a project task be changed to another project from the task detail screen?

**Q112.** Does project task status/assignee use the same `/tasks/updatetaskstatus` and `/tasks/updateasignedto` endpoints? Any project-specific validation?

**Q113.** How should project creation/update/delete be handled on mobile? Which fields are required? Is owner required? Are project attachments expected?

**Q114.** Should project task changes emit `project_update`, `task_update`, or both? What should mobile refetch?

**Q115.** What is the relationship between project chat rooms and project tasks? Does assigning a task to a project affect chat membership/notifications?

### N. Website parity and implementation guidance

**Q116.** Please provide the website’s current task module logic and frontend checks, including:
- visible/hidden/disabled controls per role
- status transition rules
- approval/rejection rules
- create/edit validation
- recurrence validation
- dependency/critical rules
- overdue/delay behavior
- project assignment/project task rules

**Q117.** Please provide the website’s current project-in-task logic and checks, including the project task table, sprint behavior, and project-task permissions.

**Q118.** Which frontend checks are currently only client-side on the website and are not enforced by the backend? Which ones must mobile replicate?

**Q119.** Are there any plans to rename `asigned_to`, `tasksByme`, `task_assignee`, or other legacy naming? Will old fields remain for backward compatibility?

**Q120.** What is the current backend version/branch/environment (staging and production) we should test against? Are there feature flags or company module settings we need enabled for task/project testing?

**Q121.** Can you provide Swagger/OpenAPI/Postman collections or backend route files for tasks, projects, notifications, and socket events?

**Q122.** Please list any known backend bugs or recent changes that affect the mobile implementation described here.

### O. Complete website flow inventory (Tasks + Projects in Tasks)

The website frontend team should answer this group. We need every flow, not only the flows listed in this document, because the mobile app may have missed screens, actions, modals, states, validations, or logic.

**Q123.** Please provide an exhaustive inventory of every Task-related flow currently available on the website. Include, at minimum: task dashboard/list, task create, task view, task edit, inline edits, status changes, reassignment, delete, approve, reject, reopen, complete, subtasks, dependencies, critical-task handling, recurring tasks, filters, search, sorting, pagination, bulk actions, comments/notes, mentions, attachments, notifications, quick actions, and any admin/manager-only flows.

**Q124.** For every flow, list its name/ID, screen/route/URL, entry points, and the components/modals/drawers/popovers involved.

**Q125.** For every flow, list which roles, permissions, feature flags, or company modules can see and use it. State exactly which controls are hidden, disabled, or shown with a tooltip/message.

**Q126.** For every flow, provide the step-by-step UI flow: what the user sees, what they click, what opens, what happens next, and how the flow ends or navigates back.

**Q127.** For every flow, list every validation and business check: required/optional fields, max lengths, date constraints, recurrence constraints, dependency constraints, critical-task constraints, status-transition constraints, file limits, and confirmation rules.

**Q128.** For every flow, list the exact API call sequence: which calls happen before/after the action, which are blocking, which are optimistic, which trigger refetch, and how failures are handled/retried.

**Q129.** For every flow, list the socket events the website expects/consumes and how the UI updates in response.

**Q130.** For every flow, describe empty, loading, error, offline, permission-denied, and partial-data states, including the exact UI/message shown.

**Q131.** For every flow, describe navigation behavior, back behavior, unsaved-changes handling, confirmation dialogs, and success/error toasts.

**Q132.** List any bulk/multi-select actions, import/export, duplicate/template, quick-action, keyboard/desktop-only, or table-column customization flows in the website Task module.

**Q133.** List every notification, in-app toast, push notification, email, or badge the website generates or receives for each Task flow.

**Q134.** Provide the same exhaustive flow inventory for Project-in-Task features: project list, project create, project view/detail, project edit, project delete, project attachments, project users, project tasks table, assign/remove task to/from project, sprint list/create/edit/delete, assign task to sprint, filters/search/sort/pagination, bulk actions, and project permissions.

**Q135.** For each Project-in-Task flow, provide the step-by-step UI, validation/checks, API sequence, socket events, and permission rules, including project task status changes and reassignment.

**Q136.** Describe all Advanced Task Module flows on the website: effort/scheduling, due-date computation, effort logs, remaining effort, dependencies, critical ordering, and how the UI changes versus normal task companies.

**Q137.** Describe the exact website flows for approval, rejection, reopening, completing, deleting, and undoing these actions, including who can do them and what happens to related tasks/notifications.

**Q138.** Describe the exact website flows for recurring tasks, subtasks, dependencies, and critical tasks, including create, edit, delete, pause/stop, series changes, ordering, and conflict handling.

**Q139.** Provide the website route map and component/file references for each Task and Project-in-Task flow (links to repository files, route names, or component names).

**Q140.** If possible, provide screenshots, screen recordings, test accounts, or seed data for each flow so we can reproduce the website behavior on mobile.

**Q141.** List known edge cases, limitations, hidden flows, feature-flagged flows, and known website bugs that mobile should replicate or avoid.

**Q142.** Provide a prioritized parity matrix for mobile: flow name, website status (live/beta/hidden), current mobile status (implemented/partial/missing), gap description, must-have/optional for mobile, and recommended implementation guideline.

---

## 19. Requested backend + website frontend response document

Please send one Markdown file named:

```text
TASK_MODULE_BACKEND_CONTRACT.md
```

It should contain all of the following. The backend should complete the API/socket/permission/business-rule sections; the website frontend team should complete the complete flow inventory and frontend checks sections. If something is unchanged, explicitly say “UNCHANGED” so we do not re-implement it.

### 19.1 Required sections

1. **Backend version/date/environment**
   - branch/commit/version
   - staging and production base URLs
   - auth/header requirements
   - feature flags and required company modules

2. **Complete Task API catalog**
   - every current endpoint
   - method + full path
   - auth/headers
   - query parameters
   - request body schema
   - response schema
   - error status codes and error body examples
   - whether mobile may call it
   - whether it is deprecated/removed/new

3. **Complete Project API catalog relevant to tasks**
   - project list/detail/create/update/delete
   - project users
   - project attachments
   - project tasks
   - sprints
   - task-to-project assignment/removal
   - project permissions

4. **Socket event catalog**
   - event name
   - direction
   - room/scope (company/user/other)
   - exact payload schema
   - when emitted
   - ordering/idempotency/replay behavior
   - recommended mobile reaction (patch vs refetch)
   - all `task_update` actions and their `data` fields
   - any new task/project/sprint events

5. **Permission matrix**
   - permission key
   - scope
   - which roles get it
   - which action it gates
   - backend enforcement vs frontend-only check
   - website behavior for hidden/disabled controls
   - mobile behavior expected

6. **Status, priority, and transition matrix**
   - canonical status strings
   - allowed transitions
   - who can change each transition
   - approval/rejection/reopen rules
   - priority model and `task_priority`
   - critical-task rules and ordering

7. **Business logic**
   - scheduling engine rules
   - advanced task module behavior
   - dependency rules/cycle detection
   - recurring task generation/editing/deletion
   - overdue/delayed task rules
   - effort logs and remaining effort
   - one-in-progress rule
   - approval/rejection flow
   - subtask rules
   - lead relationship
   - project task rules
   - notification/push triggers

8. **Frontend checks currently active on the website**
   - create/edit validation
   - required/optional fields
   - max lengths
   - date constraints
   - recurrence constraints
   - dependency/critical checks
   - status transition checks
   - permission-based hiding/disabling
   - confirmation dialogs
   - project assignment checks
   - project task checks
   - error/empty/loading states

9. **Push notification contract**
   - event types
   - payloads
   - task/lead/chat fields
   - when sent
   - settings that gate them
   - deep-link expectations

10. **Attachments/mentions/file contract**
    - upload endpoints
    - field names
    - max size/types
    - download/secure-file behavior
    - note attachments vs task attachments
    - mention markup and mention notification behavior

11. **Backend change log since this mobile implementation**
    - what changed
    - what was added/removed/renamed
    - what mobile must change
    - migration/backward-compatibility notes

12. **Answers to Q1-Q142**
    - answer by question number

13. **Website implementation guide**
    - current website logic/checks for tasks
    - current website logic/checks for projects in tasks
    - code/route references if useful

14. **Recommended frontend implementation sequence**
    - exact order to implement/activate missing features
    - which APIs/events to use for each screen
    - any required migrations or feature flags

15. **Complete website Task flow inventory**
    - every Task flow (including flows mobile may not have)
    - flow ID/name, screen/route, entry points, UI components/modals
    - roles/permissions/feature flags
    - step-by-step UI
    - validations/checks
    - API sequence
    - socket events
    - empty/loading/error/offline/permission states
    - navigation/back/confirmation/toast behavior
    - bulk/import/export/quick actions
    - notifications/push/email generated
    - known edge cases and bugs

16. **Complete website Project-in-Task flow inventory**
    - project list/create/view/edit/delete
    - project attachments/users
    - project tasks table and filters
    - assign/remove task to/from project
    - sprints: list/create/edit/delete/assign task
    - project task status/reassignment
    - project permissions and checks
    - same level of detail as item 15

17. **Flow-by-flow mobile implementation guideline**
    - for each website flow: expected mobile screen, API calls, socket handling, state updates, validations, guards, error handling, and navigation
    - mark each flow must-have/optional for mobile parity

### 19.2 Current-endpoint review table

Please fill this table for every endpoint in Sections 7 and 10.

| Mobile function | Current method + path | Backend status | New method + path (if changed) | Request schema changed? | Response schema changed? | Required mobile change | Notes |
|---|---|---|---|---|---|---|---|
| `getAllTasks` | `GET /tasks/all` |  |  |  |  |  |  |
| `getDueTodayTasks` | `GET /tasks/duetoday` |  |  |  |  |  |  |
| `getFilteredTasks` | `GET /tasks/filter` |  |  |  |  |  |  |
| `viewTask` | `POST /tasks/view/:taskId` |  |  |  |  |  |  |
| `createTask` | `POST /tasks/create` |  |  |  |  |  |  |
| `createSubtask` | `POST /tasks/createsubtask/:parentId` |  |  |  |  |  |  |
| `updateTask` | `POST /tasks/update/:taskId` |  |  |  |  |  |  |
| `updateTaskStatus` | `POST /tasks/updatetaskstatus/:taskId` |  |  |  |  |  |  |
| `reassignTask` | `POST /tasks/updateasignedto/:taskId` |  |  |  |  |  |  |
| `deleteTask` | `DELETE /tasks/:taskId` |  |  |  |  |  |  |
| `approveTask` | `POST /tasks/approve/:taskId` |  |  |  |  |  |  |
| `rejectTask` | `POST /tasks/reject/:taskId` |  |  |  |  |  |  |
| `updateTaskDueDate` | `POST /tasks/updatetaskduedate/:taskId` |  |  |  |  |  |  |
| `extendDelayedTask` | `POST /tasks/extend-delayed/:taskId` |  |  |  |  |  |  |
| `updateTaskProject` | `POST /tasks/updatetaskproject/:taskId` |  |  |  |  |  |  |
| `updateLeadSource` | `POST /tasks/updateleadsource/:taskId` |  |  |  |  |  |  |
| `recalculateSchedule` | `POST /tasks/recalculate/:taskId` |  |  |  |  |  |  |
| `getDependencies` | `GET /tasks/dependencies/:taskId` |  |  |  |  |  |  |
| `addDependency` | `POST /tasks/dependencies/add` |  |  |  |  |  |  |
| `removeDependency` | `POST /tasks/dependencies/remove` |  |  |  |  |  |  |
| `reorderCritical` | `POST /tasks/reorder-critical` |  |  |  |  |  |  |
| `rescheduleReopened` | `POST /tasks/reschedule-reopened/:taskId` |  |  |  |  |  |  |
| `reopenTask` | `POST /tasks/reopen/:taskId` |  |  |  |  |  |  |
| `migratePriorities` | `POST /tasks/migrate-priorities` |  |  |  |  |  |  |
| `migrateEffortToMinutes` | `POST /tasks/migrate-effort-to-minutes` |  |  |  |  |  |  |
| `addNote` | `POST /tasks/addnote/:taskId` |  |  |  |  |  |  |
| `getMentionUsers` | `GET /user/note-mentions` |  |  |  |  |  |  |
| `getTaskNotes` | `POST /tasks/showtasknote/:taskId` |  |  |  |  |  |  |
| `updateNote` | `POST /tasks/updatenote/:noteId` |  |  |  |  |  |  |
| `pinNote` | `POST /tasks/updatenotepin/:noteId` |  |  |  |  |  |  |
| `deleteNote` | `POST /tasks/deletenote/:noteId` |  |  |  |  |  |  |
| `updateNoteReaction` | `POST /tasks/updatenotereaction/:noteId` |  |  |  |  |  |  |
| `uploadAttachment` | `POST /tasks/attachments/:taskId` |  |  |  |  |  |  |
| `deleteAttachment` | `POST /tasks/attachmentdelete/:attachmentId` |  |  |  |  |  |  |
| `getAllProjects` | `GET /projects` |  |  |  |  |  |  |
| `getAllProjectsForAssignment` | `GET /projects?scope=all` |  |  |  |  |  |  |
| `getProjectsList` | `GET /projects/list` |  |  |  |  |  |  |
| `createProject` | `POST /projects/create` |  |  |  |  |  |  |
| `updateProject` | `POST /projects/update/:id` |  |  |  |  |  |  |
| `deleteProject` | `DELETE /projects/delete/:id` |  |  |  |  |  |  |
| `getProjectDetail` | `GET /projects/detail/:id` |  |  |  |  |  |  |
| `uploadProjectAttachment` | `POST /projects/attachments/:projectId` |  |  |  |  |  |  |
| `deleteProjectAttachment` | `POST /projects/attachmentdelete/:attachmentId` |  |  |  |  |  |  |
| `getProjectUsers` | `GET /username/project-users` |  |  |  |  |  |  |

### 19.3 Socket review table

| Event | Current mobile expectation | Backend status | New payload | Scope/room | Recommended mobile behavior | Notes |
|---|---|---|---|---|---|---|
| `task_update` | See Section 13 |  |  |  |  |  |
| `priority_update` | See Section 13 |  |  |  |  |  |
| `jobstatus_update` | See Section 13 |  |  |  |  |  |
| `user_update` | See Section 13 |  |  |  |  |  |
| `project_update` | See Section 13 |  |  |  |  |  |
| `task_scheduling_settings_update` | See Section 13 |  |  |  |  |  |
| `notification` | Shared |  |  |  |  |  |
| `role_update` | Shared |  |  |  |  |  |

### 19.4 Permission review table

| Permission/check | Current mobile behavior | Backend enforcement | Website behavior | Required mobile behavior | Notes |
|---|---|---|---|---|---|
| `is_head` / create task | FAB + create modal + reassign |  |  |  |  |
| `tasks-list` | Not used by screen |  |  |  |  |
| `can_edit` | Detail edit gate |  |  |  |  |
| `can_edit_status` | Row status/checkbox |  |  |  |  |
| `can_edit_subtask` | Not used |  |  |  |  |
| `project-list` | Project auto-load |  |  |  |  |
| `project-create` | Disabled task assign |  |  |  |  |
| `project-edit` | Unused |  |  |  |  |
| `project-delete` | Unused |  |  |  |  |
| one In-Progress rule | Client check |  |  |  |  |
| reject reason/effort | Client validation |  |  |  |  |
| critical conflict | Client popup |  |  |  |  |
| attachment limits | Create picker only |  |  |  |  |
| note mention rules | Client trigger only |  |  |  |  |

### 19.5 Website flow inventory template

The website frontend team should fill this for **every** Task and Project-in-Task flow, including flows that do not exist in the mobile app. Add rows as needed; do not limit the list to the flows in this document.

| Flow ID | Flow name | Area | Website route/screen | Entry points | Roles/permissions/feature flags | UI elements and steps | Validations/checks | API sequence | Socket events | Loading/empty/error/offline/permission states | Navigation/back/confirmation/toasts | Notifications/push/email | Edge cases/known issues | Current mobile status | Must-have for mobile? | Implementation notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T-001 |  | Task |  |  |  |  |  |  |  |  |  |  |  | implemented / partial / missing | yes / no |  |
| T-002 |  | Task |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| P-001 |  | Project-in-Task |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| P-002 |  | Project-in-Task |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

### 19.6 Per-flow implementation guideline template

For each flow in the inventory, please provide:

| Field | Required content |
|---|---|
| Flow ID and name | Match the flow inventory ID. |
| Preconditions | Auth, role, permissions, feature flags, company module, project membership, task state. |
| Step-by-step UI | Exact user steps, screens, modals, pickers, and transitions. |
| API sequence | Ordered calls with method/path/body and whether they block UI, are optimistic, or trigger refetch. |
| State updates | Local state changes, cache/refetch behavior, and rollback behavior. |
| Socket events | Events emitted/consumed and UI reaction. |
| Validations/checks | Required fields, limits, date/recurrence/dependency/critical/project checks. |
| Error handling | Exact error cases, messages, retry/rollback behavior, and permission-denied behavior. |
| Navigation | Back behavior, unsaved-changes handling, confirmation dialogs, success/error toasts. |
| Mobile guidance | Whether mobile should implement it, and any platform-specific changes. |

### 19.7 Flow coverage statement

Please include an explicit statement in your response covering:

- Every Task flow that exists on the website.
- Every Project-in-Task flow that exists on the website.
- Every flow that is hidden/beta/feature-flagged.
- Every flow that is **not** present in the current mobile app.
- Every flow that mobile partially implements but differs from the website.
- Every flow that mobile should **not** implement (deprecated/internal-only).

---

## 20. Final handoff checklist for backend and website frontend

Please confirm each item in your response:

- [ ] Every endpoint in Section 7 is marked unchanged/changed/removed/new.
- [ ] Every endpoint in Section 10 is marked unchanged/changed/removed/new.
- [ ] Exact request and response schemas are provided for all changed/new endpoints.
- [ ] Exact error bodies/status codes are provided.
- [ ] All task socket events and `task_update` actions are documented with payloads.
- [ ] Socket scope/rooms/ordering/idempotency/reconnect behavior is documented.
- [ ] Complete task and project permission matrix is provided.
- [ ] Website frontend checks for tasks and project tasks are provided.
- [ ] Status/priority/transition matrix is provided.
- [ ] Business logic for scheduling, advanced module, dependencies, recurrence, approval/rejection, critical tasks, overdue/delay, effort logs, and subtasks is provided.
- [ ] Task/project push payloads and triggers are provided.
- [ ] Attachment/mention/file contract is provided.
- [ ] Change log since this mobile implementation is provided.
- [ ] Recommended mobile implementation sequence is provided.
- [ ] **Every Task flow on the website is listed**, including flows mobile does not have.
- [ ] **Every Project-in-Task flow on the website is listed**, including flows mobile does not have.
- [ ] **Every flow includes step-by-step UI, validations, permissions, API sequence, socket events, states, navigation, notifications, and edge cases.**
- [ ] **Every flow is marked implemented/partial/missing on mobile and must-have/optional for mobile parity.**
- [ ] **A flow-by-flow mobile implementation guideline is provided.**
- [ ] Q1-Q142 are answered by number.
- [ ] A single `TASK_MODULE_BACKEND_CONTRACT.md` file (or link) is returned.

Thank you. We will use your response to update the mobile Task module and safely activate the Project features in the Task module.
