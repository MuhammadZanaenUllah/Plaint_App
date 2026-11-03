# TASK_MODULE_BACKEND_CONTRACT.md

**Backend + website answer to "Task Module Details" (mobile, 2026-10-21)**

| Item | Value |
|---|---|
| Answer date | 2026-10-30 |
| Prepared for | Mobile team (Plaint / Planit app) |
| Backend checked | `Planit-Backend`, branch `tasks`, commit `803e41d` (2026-10-30) + the 2026-10-30 fixes listed in §12 |
| Website checked | `Planit-Frontend`, branch `task`, commit `036c443` |
| Method | Every answer was read from the code (routes, controllers, helpers, crons, React screens). File references are given as `file:line` so you can check them. |
| Mobile repo | Not available to us. We answer against what your document says the app does. |

How this file is organised:

- **§0** is the short list of things mobile must change. Read it first.
- **§1-§11** are the reference contract (the sections you asked for in 19.1, items 1-10).
- **§12** is the backend change log.
- **§13-§15** are your review tables (19.2, 19.3, 19.4) filled in.
- **§16-§17** are the complete website flow inventories (Task, then Project-in-Task).
- **§18** is the parity matrix and the flow-by-flow mobile guideline.
- **§19** answers Q1-Q142 by number.
- **§20** is the recommended implementation order.
- **§21** lists known backend bugs. **§22** is the coverage statement and checklist.

Words used in this file:

- **Creator** = the user who made the task. **Doer** = the user the task is assigned to. The backend field names are confusing (see §2.6), so we always say creator/doer.
- **ATS** = the company has the **"Advanced Task Scheduling"** module (the scheduling engine). "Normal company" = it does not.
- **PKT** = Asia/Karachi time (UTC+05:00). The backend process runs in PKT (`server.js:3`).

---

## 0. What mobile must change — the short list

These are ordered by how much damage they do today. Each one links to the detail.

| # | Problem in the current mobile build | What to do | Detail |
|---|---|---|---|
| 1 | **Effort is sent in hours/days, but the backend stores minutes.** `effort_hours: 4, effort_unit: "hours"` is saved as **4 minutes**. The website then shows "0.07 h". | Always send `effort_hours` **in minutes** (hours×60, days×8×60). Keep `effort_unit` as the unit the user picked (display only). Same for create, update, reopen, resume. | §8.6 |
| 2 | **Create sends `due_date` with `toISOString()`.** A date picked as 30 Oct at local midnight becomes `"2026-10-29T19:00:00.000Z"`. The backend treats any `YYYY-MM-DDT…` string as a PKT date-time, so the task lands on **29 Oct**. | Normal companies: send `due_date` as **`"YYYY-MM-DD"`** (the website does this). ATS companies: send `due_date: null`. | §2.7 |
| 3 | **`GET /modules/all` returns 403 for every company user** (it is SaaS-admin only). Your numeric-ID fallback can never work. | Read **`user.company.modules`** from the login response (array of names). Test with **exact** name `"Advanced Task Scheduling"`. To refresh without logging in again: `GET /companies/:company_id/modules`. | §8.2 |
| 4 | **Create is gated by `is_head`.** The backend checks the **`tasks-create`** permission. | Show the create button only if `(role_title === "Company Admin" \|\| is_head === "yes") && user_permissions.includes("tasks-create")` — this is the website rule. | §6 |
| 5 | **Reassign is gated by `is_head`.** The backend allows reassign **only for the task creator** (plus `tasks-edit`). | Gate the assignee control by the row's **`can_edit`** flag (true only for the creator). | §6, §3.13 |
| 6 | **Rejected can be chosen from any status.** The backend only accepts reject when the status is exactly **`Pending-Approval`** and the caller is the **creator or a Company Admin**. Otherwise it returns 400/403. | Show Reject only on Pending-Approval tasks, to the creator. Hide "Rejected" from normal status pickers. | §7.3, §3.18 |
| 7 | **There is no approve UI**, so tasks that need approval get stuck in Pending-Approval on mobile. | Add Approve for the creator on Pending-Approval tasks. Approve = `POST /tasks/updatetaskstatus/:id {status:"Complete"}` (what the website does) or `POST /tasks/approve/:id`. | §7.3 |
| 8 | **Detail status edits go through `/tasks/update`.** That path skips the subtask and dependency checks, and for a doer it can blank fields. | Use **`POST /tasks/updatetaskstatus/:id`** for every status change (list and detail). Use `/tasks/update` only for the "save details" edit by the creator. | §3.10, §3.12 |
| 9 | **List status changes are not rolled back** when the server says no. The server returns `400 {Good:false, data:"<reason>"}` for many rules. There is also a **success** reply that means "this became Pending-Approval". | On `Good:false`, revert the row and show `data` as the error. On `Good:true` whose `data` contains `"approval is required"`, set the row to `Pending-Approval` and show it as a warning. | §3.12 |
| 10 | **`/tasks/update` overwrites every field you send and blanks some you leave out** (Mongoose writes them as null). Mobile sends `project_id: 0` / `sprint_id: null` and a **plain-text** description. | Send the full payload exactly like the website (§3.10). **Do not send `project_id`/`sprint_id`** (the website doesn't). Send the **description HTML unchanged**. Send effort fields **only in ATS companies**. | §3.10 |
| 11 | **The Recurring tab is always empty.** `/tasks/all` and `/tasks/duetoday` never return recurring templates (the rows with `is_recurring: true`). | Load the Recurring tab from `GET /tasks/filter?filter=recurring`. | §3.4 |
| 12 | **Every launch downloads all completed tasks** (90%+ of a company's history). | Call `/tasks/all?exclude_complete=true`. Use `complete_count` for the badge. Load the Completed tab page by page from `GET /tasks/filter?filter=complete&limit=50&page=N`. | §3.1, §3.4 |
| 13 | **The delay popup is computed on the device.** The server already decides who should see which delayed task. | Use `GET /tasks/delayed-popup` and re-check at `next_check_at`. | §3.5 |
| 14 | **Task notifications were switched off for mobile** (chat-only build, 2026-10-07). **They are back on** with the next backend deploy: task rows in `GET /notification/all` and task push. | Drop your locally made "mentioned you" notifications (the server sends them now). Map push `type:"tasks"` + `filter` to the Due Today / Delayed tabs. | §10 |
| 15 | **Critical priority is offered in every company.** On the website, Normal/Critical can only be chosen in ATS companies. | In normal companies, show a fixed "Normal" badge. | §7.2 |
| 16 | **"Only one In-Progress task" is blocked on the device for every task.** The server enforces it only when **one of the two tasks has effort** (ATS). | Remove the device-side block. Show the server's 400 message instead. | §8.7 |
| 17 | **Socket handling is incomplete.** Mobile ignores `status_change`, `critical_reorder` and `sprint_assigned`. It patches only `due_date` on `schedule_update`. | Handle the actions as listed in §5.2. `company_id` arrives as a number *or* a string, so compare with `Number()`. | §5 |
| 18 | **`jobstatus_update` is treated as a task-status event.** Job statuses are *employee* job statuses, not task statuses. | Ignore `jobstatus_update` in the task module. Task statuses come from `data.status` of the list endpoints. | §5.3 |
| 19 | **Cached list replies can be old.** `/tasks/all`, `/tasks/duetoday`, `/tasks/filter` and `/projects` can return `stale: true`. | If `stale === true`, show the data, then call again with `&wait_fresh=1`. | §2.5 |
| 20 | **Project types are wrong.** The project status values are `Planning`, `In Progress`, `On Hold`, `Completed`, `Abandoned` (there is no `Pending`; sending it causes a 500). Project detail has **no `sprints`** field. | Fix the enum. Load sprints with `GET /sprints?company_id=&project_id=`. | §4 |

Two endpoints that must never be called: **`POST /tasks/statusupdate/:id`** (a legacy lead toggle that writes the status `"1"` into the task) and **`GET /tasks/:id`** (legacy, returns the wrong shape). The working replacements are `POST /tasks/updatetaskstatus/:id` and `POST /tasks/view/:id`.

---

## 1. Backend version, environment, modules

| Item | Value |
|---|---|
| Backend branch / commit | `tasks` @ `803e41d` (2026-10-30). The 2026-10-30 fixes in §12 (403 instead of a crash, task notifications on mobile, notification-endpoint fixes) go out with the next deploy. |
| Website branch / commit | `task` @ `036c443` |
| Base URLs | Base path is always `{host}/api/v1`. The website `.env` has `https://backend.planit.pk`, `https://backend-planit.soulservices.com` and `http://localhost:5025`. **Ask DevOps which host is staging and which is production** — this file does not decide that. |
| Socket | Socket.IO 4.8, path `/socket.io`, same host as the API. There is **no auth handshake** (§5.1). |
| Server timezone | `Asia/Karachi` (PKT, UTC+05:00). "Today", "overdue", crons and engine dates all use PKT. |
| Node / libs | Express 4.17, Mongoose 5.12, multer 1.4, socket.io 4.8 |

**Modules (company plan) that gate the APIs:**

| Module name (exact) | What it gates |
|---|---|
| `Tasks` | `/api/v1/tasks/*`, `/api/v1/projects/*`, `/api/v1/sprints/*`. If missing: `403 {Good:false, message:'The "Tasks" module is not included in your company\'s current plan.'}` |
| `Advanced Task Scheduling` | `/api/v1/task-scheduling-settings/*` on the backend. On the website it switches every ATS behaviour (effort instead of due date, critical priority, dependencies at create, read-only due dates, two-step reject, resume modal). **The engine itself runs for any task with `effort_hours > 0`**, whatever the module — so normal companies must not send effort. |
| `Meetings` | Optional. With ATS + the setting `reschedule_for_meetings`, meeting time is blocked out of the schedule. |

To test the project features you need a company whose plan includes `Tasks`. To test ATS, add `Advanced Task Scheduling` and create one row in Task Scheduling Settings.

---

## 2. Shared conventions

### 2.1 Headers and auth

- The token is accepted from any of: `x-access-token`, `authToken`/`authtoken` header, `?token=` query, or `token` in a JSON body. The website sends only `authToken`. Your two headers are fine.
- **Multipart uploads:** the token is read *before* the file parser runs, so a `token` field inside FormData is **not** seen. Send it as a header.
- `x-client-platform: mobile` only changes `GET /notification/all` and `GET /notification/readall` (§10). It has no effect on task endpoints.
- `x-meeting-id`: the website sends this on `tasks/*` calls made from a meeting page, so the meeting organiser may edit agenda tasks. Mobile has no meetings module — do not send it.

**Session expiry — the reply is plain text, not JSON:**

| Case | HTTP | Body |
|---|---|---|
| No token | 403 | `Un-Athunticated request` (plain text) |
| Invalid / expired token | **200** | `Un-Athunticated request` (plain text) |

Your current check ("body contains `Un-Athunticated request`") is correct. Keep it before any JSON parsing.

### 2.2 Response envelope

Every JSON reply has `Good: boolean`. The message key is **not consistent**:

| Where | Success | Error |
|---|---|---|
| Most task endpoints | `{Good:true, data:<string or object>}` | `{Good:false, data:"<message>"}` |
| `POST /tasks/update/:id` | `{Good:true, msg:"Record has Been Updated"}` — key is **`msg`** | `{Good:false, data:"<message>"}` |
| `POST /tasks/reject/:id` | `{Good:true, data:"Task has been rejected.", status:"<new status>"}` | `data` |
| `POST /tasks/updatenotereaction/:id` | `{Good:true, data:"Reaction updated", reactions:[...]}` — `reactions` is at the top level | `data` |
| `GET /tasks/all`, `/duetoday`, `/filter` without `company_id` | — | `400 {message:"Company ID is required"}` — **no `Good` key** |
| `checkPermission` failures | — | `403 {Good:false, data:"Access Denied: You do not have permission to perform this action."}` |
| `requireModule` failures, notifications, users | — | `{Good:false, message:"..."}` |
| `GET /username/project-users` errors | — | `{Good:false, error:"..."}` |
| Upload rejected by the file filter (bad type, >30 MB, 2+ files) | — | **500 with an HTML page**, not JSON (no JSON error handler is registered after the routes) |

**Rule for mobile:** use `Good` for success. Show the first string found in `data`, `message`, `msg` or `error` as the message. If the body is not JSON, show a generic error.

HTTP status codes do follow a pattern you can rely on:
- `400` = a business rule was broken (the message is user-facing and safe to show).
- `403` = no permission.
- `404` = not found.
- `500` = server error.
- List endpoints return **200** with `Good:false` for server errors.

### 2.3 IDs

- Task, note, attachment, project, sprint, priority and user IDs are **numbers** (sequential integers, not ObjectIds).
- Socket payloads and some replies carry IDs taken straight from the URL, so **`data.id` is sometimes a string** (`"111"`). Always compare with `Number(x) === Number(y)`.
- Push `task_id` is always a string (all push `data` values are strings). Parse it with `Number()`.

### 2.4 Companies

- Send `company_id` (number) and `company_identifier` (the company slug, `user.company.company_identifier` from login) wherever this file shows them. `company_identifier` is used only to build notification/email links. Leaving it out does not fail the call, but those notifications get an empty link.
- List endpoints do **not** check that `company_id` matches your token. Always send your own `company_id`.

### 2.5 List cache (`stale`, `wait_fresh`)

`GET /tasks/all`, `/tasks/duetoday`, `/tasks/filter` and `GET /projects` are cached per user + URL (`helper/listCache.js`).

- A cached copy older than 5 minutes is returned **immediately** with an extra top-level `stale: true`, and the server rebuilds it in the background.
- When you see `stale: true`, keep showing the data and **request again with `&wait_fresh=1`**. That call waits for fresh data. This is what the website does (`Tasks.jsx:582-672`).
- Writes to tasks, notes and projects clear the cache. Writes to sprints, attachments and users do not.
- `skipTasks=true` is **not read by the backend** — the full task lists are still returned. It only changes the cache key. Don't rely on it.

### 2.6 Field-name traps (all are stable; we will not rename them)

| Field | Real meaning |
|---|---|
| `assignee` (on a task row) | **CREATOR** id. It does **not** mirror `asigned_to`. Your §5.4 ("`assignee` mirrors `asigned_to`") is wrong. |
| `created_by` | Creator id as well (in `/tasks/view` it is a user **object**). |
| `asigned_to` (one "s") | **DOER** id. |
| `task_assignee` | Creator user object `{id, first_name, last_name, image, role}`. Your mapper is right to show it as "Created by". |
| `task_assigned_to` | Doer user object. Your mapper is right. |
| `asignedd_to` (double "d") | Doer user object, extra copy in some socket payloads and in `/view`. |
| `tasksByme` | "Created by me (and not assigned to me)" bucket. |
| `effort_hours`, `remaining_effort_hours`, `total_effort_hours` | **Minutes**, despite the names. |
| `additional_hours` (reject) | **Minutes**. |
| `duedate` (only on `/tasks/updatetaskduedate`) | The due date. Every other endpoint uses `due_date`. |
| `assign_to` | New doer on create and update. On `/tasks/updateasignedto` the new doer is read from **`assignee`**. Your reassign payload sends both `asigned_to` and `assignee` with the same value — keep that. |
| `priority` on `/tasks/reopen` | Means `task_priority` (`"normal"`/`"critical"`), not the company priority id. |

### 2.7 Dates and time zone

| Field | Format stored and returned |
|---|---|
| `due_date`, `start_date` (scheduled by the engine, doer has a shift) | `"YYYY-MM-DDTHH:mm"` — **PKT wall-clock, no seconds, no zone** |
| `due_date`, `start_date` (engine, doer has no shift) | `"YYYY-MM-DD"` |
| `due_date` set by hand | Stored exactly as sent. Send `"YYYY-MM-DD"`. |
| `completed_at` | `"YYYY-MM-DDTHH:mm"` PKT (or `"YYYY-MM-DD"` when the due date was date-only) |
| `createdAt`, `updatedAt`, notes `created_at` (from `/view`) | ISO-8601 UTC (`2026-10-30T07:12:44.120Z`) |
| `recurring_time` | `"HH:mm"` 24-hour, PKT, default `"09:00"` |
| `due_date: null` | Not scheduled yet (ATS create, or task put On Hold) |

How mobile should parse:
- Treat `YYYY-MM-DD` as a **calendar day**.
- Treat `YYYY-MM-DDTHH:mm` as **PKT wall-clock time**. Do **not** use `new Date("2026-10-30")` (JS reads that as UTC midnight). The website uses `moment(value)`, which reads both as local time — correct for Pakistan devices.
- "Today", "Due today", "Delayed" and the 7-day window are all PKT days on the server.

---

## 3. Task API catalog

All paths are under `/api/v1/tasks` unless stated. Every route needs auth and the `Tasks` module.

- "Perm" = route-level permission. A Company Admin passes every route-level permission.
- "Task-level" = the per-task check `checkTaskEditPermission` (`tasksController.js:1710`):
  - **Full edit** = creator only (or a meeting grant on the website).
  - **Status edit** = creator, doer, or a head (`is_head === "yes"`) whose reportee tree contains the creator or the doer.
  - **Company Admin gets no task-level rights** unless they are the creator or doer.

### 3.1 `GET /tasks/all` — UNCHANGED (one optional addition)

- **Query:**
  - `company_id` (required).
  - `exclude_complete=true` — **new, recommended.** Leaves out status `Complete` and adds `complete_count`.
  - `wait_fresh=1` — see §2.5.
  - `skipTasks` — ignored by the backend.
- **Returns every task except:** tasks **due today** (they come from `/duetoday`) and **recurring templates** (`is_recurring: true`). The two lists never overlap; together they are the full list.
- **Included:** completed tasks (unless excluded), subtasks (as their own rows, `parent_id > 0`), project and sprint tasks, recurring *instances* (`recurrence_origin_id` set), undated tasks. Deleted tasks are gone (hard delete).

**Who sees which task** — every task is in **at most one** bucket:

| Bucket | Rule |
|---|---|
| `tasks_assigned_to_me` | I am the doer (self-assigned tasks land here) |
| `tasksByme` | I am the creator and not the doer |
| `all_other_tasks` | Neither. Company Admin: all tasks. Head: tasks whose creator or doer is in my reportee tree, or where I'm @mentioned. Others: only tasks where I'm @mentioned. |

**Reply:**
```json
{
  "Good": true,
  "stale": true,
  "data": {
    "task_owner": [{ "id": 5, "first_name": "Ali", "last_name": "Khan", "email": "...", "company_id": 1, "image": "x.png" }],
    "team_member_ids": ["5", "9"],
    "priority": [{ "id": 1, "name": "High", "color": "#f00", "order": 1, "company_id": 1 }],
    "status": ["Pending", "In-Progress", "On-Hold", "Pending-Approval", "Rejected", "Complete"],
    "tasks_assigned_to_me": [],
    "tasksByme": [],
    "all_other_tasks": [],
    "complete_count": 412
  }
}
```

- `stale` appears only for a cached copy (§2.5).
- `task_owner` = the users **you may assign tasks to**: Company Admin → all active users; head → self + reportees; anyone else → **only self**. Use it for the assignee picker.
- `team_member_ids` = string ids of self + reportees, for heads only; `[]` otherwise.
- `complete_count` is present only with `exclude_complete=true`.

**Task row fields:**

- From the database: `id, title, status, due_date, start_date, priority, task_priority, critical_order, assignee (creator), asigned_to (doer), parent_id, company_id, is_recurring, recurring_period, recurring_time, recurring_total_count, recurring_completed_count, recurring_exclude_days, recurrence_origin_id, last_recurrence_spawned, approval_required, created_by, module, project_id, sprint_id, effort_hours (minutes), effort_unit, updatedAt, completed_at`.
- Added by the server:
  - `task_assignee` (creator object), `task_assigned_to` (doer object)
  - `priority_color`, `priority_name`, `project_name`
  - `sub_tasks: []` (always empty here), `subtask_count`
  - `notes_count` — also repeated as `comment_count`, `task_notes_count` and `final_note_count` (same number)
  - `can_edit`, `can_edit_status`, `can_edit_subtask`
- **Not in rows:** `description`, `rejection_reason`, `remaining_effort_hours`, `createdAt`. Get these from `/tasks/view`. (Your `TaskListItem.description`/`rejection_reason`/`createdAt` will be undefined in lists.)

**Permission flags in rows:**

| Flag | True when |
|---|---|
| `can_edit` | I am the creator |
| `can_edit_status` | I am the creator, the doer, or the head of either |
| `can_edit_subtask` | Same as `can_edit_status` |

The admin role is **not** counted. A Company Admin gets `false` on tasks they neither created nor do. The server also refuses those edits.

- **Sort:** each bucket is sorted by due date ascending, then critical first, then `critical_order`. The website re-sorts on the device anyway (§16 T-005).
- **No pagination.**
- **Errors:** `400 {message:"Company ID is required"}`; `200 {Good:false, data:"Internal server error"}`.

### 3.2 `GET /tasks/duetoday` — UNCHANGED

- Same query, reply shape, buckets, flags and errors as `/all`. There is **no** `exclude_complete` and **no** `complete_count`.
- "Due today" = `due_date` is today in PKT. It matches `"YYYY-MM-DD"`, `"YYYY-M-D"`, or `"YYYY-MM-DDT…"` starting with today.
- It **includes** completed tasks and tasks whose due time today has already passed. It never includes earlier days.
- Sorted by `start_date`, then critical first, then `critical_order`.

### 3.3 `GET /tasks/critical-for-user` — NEW for mobile (optional)

- **Query:** `company_id`, `user_id` (both required). If either is missing: `400 {Good:false, message:"company_id and user_id are required"}`.
- **Reply:** `{Good:true, data:{tasks:[{id, title, status, due_date, task_priority, critical_order, asigned_to, assignee, task_assignee:{id,first_name,last_name}, task_assigned_to:{...}}]}}`.
- The tasks are that user's (as doer) critical, not-completed, top-level tasks, sorted by `critical_order`.
- Useful for the critical-conflict prompt when you have not loaded every task. The website create form uses its already-loaded list instead (§7.2).

### 3.4 `GET /tasks/filter` — UNCHANGED (method is GET)

- **Query:** `company_id`, `filter`, optional `limit` (max 200) and `page` (from 1), `wait_fresh`.
- Paging works **only for `filter=complete`**. It then adds `data.has_more` (bool) and `data.page`.
- **Reply:** same shape as `/all`, without `complete_count`.

| `filter` | Returns |
|---|---|
| `created_by_me` | I am the creator |
| `assigned_to_me` | I am the doer |
| `pending_approval` | `approval_required = 1` **or** status `Pending-Approval`. Note this includes approval-required tasks in **any** status, completed ones too. |
| `recurring` | **Recurring templates only** (`is_recurring: true`). This is the only way to get them. |
| `complete` | status `Complete`, server-sorted newest `completed_at` first (see the bug note) |
| `delayed` | due date before now (date-time) or before today (date-only). **Completed tasks are included** — filter them out on the device. |
| `due_in_7_days` | due after today and up to today+7. Completed tasks included. |
| anything else / missing | all non-template tasks, today's included |

- Your `TaskFilter` values match the backend exactly.
- Visibility and bucket rules are the same as `/all`.
- **Bug:** within one `complete` page, the rows are re-sorted by `start_date`. Re-sort each page by `completed_at` descending on the device, as the website does.

### 3.5 `GET /tasks/delayed-popup` — NEW for mobile (must-have)

- **Query:** `company_id` (required). If missing: `400 {Good:false, data:"company_id is required"}`.
- **Candidates:** tasks **I created** (`assignee` or `created_by` = me) whose status is In Progress / In-Progress / In Review / In Testing and whose due date/time has passed. That includes tasks I created for myself. Recurring templates are excluded. Subtasks are included.
- **Order:**
  1. Tasks I created for someone else.
  2. Then tasks assigned to me.
  3. Then due today first, then due ascending, then critical.
- **Reply:**
  ```json
  { "Good": true, "data": {
      "tasks": [{ "id": 1, "title": "…", "status": "In Progress", "due_date": "2026-10-30T14:00", "start_date": "…",
                  "assignee": 3, "created_by": 3, "asigned_to": 7, "company_id": 1, "project_id": 0, "parent_id": 0,
                  "effort_hours": 120, "effort_unit": "hours", "remaining_effort_hours": 30, "task_priority": "normal",
                  "critical_order": null,
                  "task_assigned_to": { "id": 7, "first_name": "…", "last_name": "…", "image": "…" },
                  "task_assignee": { "id": 3, "first_name": "…", "last_name": "…", "image": "…" } }],
      "next_check_at": "2026-10-30T09:00:01.000Z",
      "server_time": "2026-10-30T08:41:10.000Z" } }
  ```
- `next_check_at` = when the next not-yet-delayed candidate becomes delayed (capped at +6 h). It is `null` when there are no candidates.
- Schedule your next check at `next_check_at − server_time`, clamped to 1 s – 6 h.
- The server does not store "dismissed". The website remembers dismissals per task for the browser session.
- **Error:** `500 {Good:false, data:"Server error"}`.

### 3.6 `POST /tasks/view/:taskId` — UNCHANGED, but your type is partly wrong

- **Body:** `{company_id}` (read but not used).
- **Errors:** `400 "Invalid Task ID"`, `404 "Task not found"`, `500 "Internal Server Error"`.
- **Reply:** `{Good:true, data:{task:{...}}}`. Fields of `task`:

| Group | Fields |
|---|---|
| Core | `id, title, description (HTML), status, due_date, start_date, priority (company priority id), priority_name, priority_color, task_priority, critical_order, approval_required, parent_id, parent_title ("" if none), project_id, sprint_id (or null), module, company_id` |
| People | `asigned_to` (doer **id**), `assignee` (creator **id**), `created_by` (creator **object**), `task_assigned_to` / `asignedd_to` (doer object), `task_assignee` (creator object). Objects are `{id, first_name, last_name, image, email, role, department, is_head}`. |
| Rights | `can_edit`, `can_edit_status`, `can_edit_subtask` (same rules as §3.1) |
| Recurring | `is_recurring, recurring_period, recurring_time, recurring_total_count, recurring_completed_count, recurring_exclude_days, recurring_week_day, recurring_month_date, recurring_annual_month, recurring_annual_date` |
| Effort / schedule (minutes) | `effort_hours, effort_unit (default "hours"), completed_at, completed_late, rejection_reason`, and `effort_history[]` = `{value (minutes), unit, action, from_status, to_status, changed_at, changed_by, changed_by_name, changed_by_image}`. `action` ∈ `create`, `update`, `delay_extension`, `rejection`, `reopen`, `approval_resume`. |
| Counts | `notes_count` (= `comment_count` = `task_notes_count` = `final_note_count`), `subtask_count` |
| Children | `sub_tasks[]`, `task_notes[]` (§11), `task_attachments[]` = `{id, attachment, original_name, extension, module, created_by, mod_id, created_at, updated_at}`, `task_notifications[]` (up to 10 raw notification rows), `task_notes_attachments[]` (flat file names from notes) |
| Timestamps | `created_at`, `updated_at` (ISO) |

Fields that are **not** in the reply — drop them from your type:

| Your field | Use instead |
|---|---|
| `effort_logs`, `effort_logs_count` | `effort_history` |
| `actual_completion` | `completed_at` |
| `project_name` | the list row's `project_name`, or the project list |
| `sprint_name` | the sprint list (§4.3) |
| `remaining_effort_hours` | not available here (it arrives only in `schedule_update` sockets and `/delayed-popup`) |

### 3.7 `GET /tasks/:id` — DO NOT USE

Legacy. It returns `{data:{priority:[rawDocs]}}` and can crash on bad ids. Use `/tasks/view/:id`.

### 3.8 `POST /tasks/create` — CHANGED (units and formats)

- **Perm:** `tasks-create`.
- **No server-side validation** — the client must validate (§9.1).
- **Bad values crash the request:** an invalid `task_priority` or `recurring_period` value makes the save throw. The request then hangs, so send only valid values.

| Field | Type | Required (website) | Notes |
|---|---|---|---|
| `title` | string | yes | no max length enforced |
| `company_id`, `company_identifier` | number, string | yes | |
| `assign_to` | number | yes | the doer. `asigned_to` is **not** read here. |
| `due_date` | `"YYYY-MM-DD"` / `null` | normal: yes. ATS: `null` | ignored when the engine schedules (effort > 0) |
| `status` | string | yes | `Pending`, `In-Progress`, `On-Hold` or `Complete`. Don't send `Rejected`, `Recurring` or `Pending-Approval` (§7.1). |
| `task_priority` | `"normal"` / `"critical"` | yes | `critical` only in ATS companies (website rule) |
| `bump_to_front` | bool | no | ATS + critical only (§8.5) |
| `approval_required` | `0` / `1` | yes (default 0) | |
| `description` | HTML string | no | Quill HTML. Inline images are base64 `<img>`. |
| `is_recurring` | bool | no | |
| `recurring_period` | `daily` / `weekly` / `monthly` / `annually` / `quarterly` / `semiannually` | if recurring | the semi-annual value is spelled **`semiannually`**, not `semi-annually` |
| `recurring_time` | `"HH:mm"` | if recurring | default `"09:00"` |
| `recurring_total_count` | int | no | **0 = no limit** |
| `recurring_exclude_days` | string[] | daily | lower-case day names, e.g. `["saturday","sunday"]` (case is ignored) |
| `recurring_week_day` | string | weekly | e.g. `"monday"` |
| `recurring_month_date` | int 1-31 | monthly | |
| `recurring_annual_month`, `recurring_annual_date` | int, int | annually | month 1-12 |
| `project_id` | number / `0` | no | the website sends `0` when there is no project |
| `sprint_id` | number / `null` | no | |
| `parent_id` | — | — | **ignored** (always 0). Subtasks use `/createsubtask`. |
| `effort_hours` | number, **minutes** | ATS: yes (> 0) | normal companies: **leave it out**. `> 0` turns the engine on. |
| `effort_unit` | `minutes` / `hours` / `days` | with effort | display unit only. Unknown values become `hours`. |
| `depends_on` | number[] | no | blocker task ids. Not validated here (no cycle check). |

**Reply** (sent *before* the queue is rebuilt):
```json
{ "Good": true, "data": { "id": 1234, "...": "the whole saved task" },
  "planning_hold": true, "message": "This task's project is still in Planning, so the task stays On Hold until the project starts." }
```
- `planning_hold` and `message` appear only when the project is in Planning.
- The status and dates in `data` may change straight after the reply (bump, queue placement). Rely on the socket events that follow (`create`, `status_change`, `critical_reorder`, `schedule_update`).
- Your `{ id }` read (`data.id`) works.

**Server rules on create:**
1. **Planning project** → status forced to `On-Hold`, no scheduling.
2. **Effort > 0** → the engine computes `start_date`/`due_date`.
3. **Sprint check** → if the computed due date is after the sprint deadline: `400 "This task's scheduled due date (…) is after the sprint's deadline (…). The task cannot be added to this sprint -- please choose a different sprint or reduce the task effort."`
4. **One In-Progress** (§8.7) → status lowered to `Pending`, or bump forced for critical.
5. `critical_order` is assigned to critical tasks.
6. One `TaskDependency` row is saved per `depends_on` entry.

**After the reply:**
- Socket `task_update/create`.
- Bump events (`status_change`, `critical_reorder`) and `schedule_update`s.
- `project_update/due_date_update` for project tasks.
- Notification `" Created a task "` to the doer (if the doer is not the creator) + email.

### 3.9 `POST /tasks/createsubtask/:parentId` — UNCHANGED, but subtasks are switched OFF on the website

- **Perm:** `tasks-create`.
- **Task-level:** `can_edit_subtask` on the parent, else `403 "You do not have permission to create subtasks for this task."`
- **Body:** like create, with `assign_to` (or `asigned_to`). `task_priority` is inherited from the parent; `bump_to_front`, `depends_on` and `sprint_id` are ignored.
- If the parent has effort and the subtasks' total effort would go over it: `400 "Effort limit exceeded: parent task has X total, Y already allocated. Only Z remaining."`
- **Reply:** `{Good:true, data:<saved subtask>}`.
- Socket `task_update/create_subtask`.
- **Mobile:** do not build a subtask UI now (§16 T-044).

### 3.10 `POST /tasks/update/:taskId` — CHANGED (send it like the website)

- **Perm:** `tasks-edit`.
- **Task-level:**
  - Full edit is for the creator.
  - A status-only editor (doer or head) is silently reduced to updating `status` alone.
  - Anyone else gets `403 "You do not have permission to edit this task."` (before the fix in §12 this crashed the server).
- **Important:** the backend writes most fields **even when you leave them out** (Mongoose 5 turns `undefined` into `null`). Always send the full set the website sends:

```json
{
  "company_id": 1, "company_identifier": "acme",
  "title": "Prepare weekly report",
  "description": "<p>Report details</p>",
  "assign_to": 456,
  "due_date": "2026-10-30",
  "priority": 2,
  "status": "In-Progress",
  "is_recurring": false,
  "recurring_period": "", "recurring_time": "09:00", "recurring_total_count": 0,
  "recurring_exclude_days": [], "recurring_week_day": "", "recurring_month_date": "",
  "recurring_annual_month": "", "recurring_annual_date": "",
  "approval_required": 0,
  "task_priority": "normal"
}
```

| Field | What to send |
|---|---|
| `description` | Send the **HTML as received** from `/view`. Plain text wipes the website formatting. |
| `due_date` | Normal: `"YYYY-MM-DD"`. ATS with effort: `null`. Omitting it keeps the old value. |
| `priority` | The task's existing company priority id, sent back unchanged |
| `effort_hours` + `effort_unit` | ATS only. Minutes plus display unit. Leaving them out keeps the effort; `null` or `""` clears it (and clears the dates). |
| `bump_to_front` | ATS + becoming critical only (§8.5) |
| `project_id`, `sprint_id` | **Do not send.** They are written whenever present (`0`/`null` would remove the task from its project/sprint). Use `/updatetaskproject` instead. |
| `status` | Send the current status. Change status through `/updatetaskstatus`, not here. |

**Reply:** `{Good:true, msg:"Record has Been Updated"}`.

**Rules (all return 400 with the message shown):**
- A Complete task cannot change status: `"This task is already complete. Completed tasks cannot have their status changed."`
- `due_date` after the sprint deadline: `"Task due date cannot exceed Sprint due date (MMM D, YYYY)"`
- One In-Progress: `"\"<title>\" is already in progress. Complete or pause it before starting another task."`
- Going On Hold while other tasks depend on this one: `"Other tasks depend on this task. Remove those dependencies before putting this task On Hold."`
- A held Planning-project task: `"This task's project is still in Planning, so the task stays On Hold until the project starts."`
- Subtask effort cap: `"Effort limit exceeded: …"`

**After the reply:** the queue is rebuilt as needed, then:
- Socket `task_update/update` with the saved fields plus people objects.
- Notifications `"Updated the task"` (to the doer) and `"Task you created was updated"` (to the creator), + email.

### 3.11 `POST /tasks/statusupdate/:id` — DO NOT USE

Legacy lead toggle. It writes the status `"1"` into the task.

### 3.12 `POST /tasks/updatetaskstatus/:taskId` — UNCHANGED (use it for every status change)

- **Task-level:** `can_edit_status`, else `403 "You do not have permission to update the status of this task."`
- **Body:** `{status, company_id, company_identifier}`. Optional `effort_hours` (minutes) is read **only when leaving `Pending-Approval`** (ATS "resume", §16 T-020).
- `status` must be one of the server strings: `Pending`, `In-Progress`, `On-Hold`, `Complete`, `Partial Complete` (only when the task has subtasks).
  - **Send `Complete`, never `Completed`.** `Completed` skips the approval and subtask checks (a backend bug).
  - Don't send `Pending-Approval` (the server sets it) or `Rejected` (use `/reject`).

**Replies (all `Good:true`):**

| `data` | Meaning |
|---|---|
| `"Task marked complete successfully!"` | the task is now Complete |
| `"Status has been updated"` | any other status was saved |
| `"You cannot mark the status as complete because approval is required. Please ask your team lead to mark the task as complete."` | **the task became `Pending-Approval`.** Set that locally and show the message as a warning. |

**Errors:**

| HTTP | Message |
|---|---|
| 400 | `"This task's project is still in Planning, so the task stays On Hold until the project starts."` |
| 400 | `"You cannot mark this task as complete because some subtasks are still incomplete."` |
| 400 | `"Your parent task is completed so you cannot change the status of subtask."` |
| 400 | `"Cannot activate this task. The following dependency tasks must be completed or pending approval first: \"A\", \"B\""` |
| 400 | `"Other tasks depend on this task. Remove those dependencies before putting this task On Hold."` |
| 400 | `"\"<title>\" is already in progress. Complete or pause it before starting another task."` |
| 400 | `"\"<title>\" is in progress. Complete or pause it before completing another task."` |
| 500 | `"Server error"` |

When the doer (not the creator) sends `Complete` on a task with `approval_required = 1`, the server stores `Pending-Approval` instead.

**After the reply:**
- Socket `task_update/status_update {id, status, completed_at?}`.
- On complete: dependents are rescheduled, and the doer's next waiting task may be **auto-started**. You will get a `status_update {status:"In Progress"}` for that other task.
- On hold: `schedule_update` with `start_date: null` and `due_date: null`.
- Notifications `"has changed the status of a task!"` (to the doer), and `"Status changed for task you created!"` or `"marked the task complete - Approval Required"` (to the creator).

### 3.13 `POST /tasks/updateasignedto/:taskId` — UNCHANGED (gate changed)

- **Perm:** `tasks-edit`.
- **Task-level:** full edit (**creator only**), else `403 "Only the task creator can reassign this task."`
- **Body:** `{assignee: <new doer id>, asigned_to: <same id>, company_id, company_identifier}`. The server reads **`assignee`**; if it is missing, the doer is cleared.
- **Reply:** `{Good:true, data:"Record has Been Updated"}`.
- **Effects:**
  - A doer who was In Progress goes back to `Pending`.
  - ATS: the task is rescheduled in the new doer's queue. Normal: `due_date` becomes "now".
- Socket `task_update/update {id, asigned_to, task_assigned_to}`.
- Notifications to the old and the new doer.

### 3.14 `POST /tasks/updatetaskduedate/:taskId` — UNCHANGED

- **Task-level:** creator only, else `403 "Only the task creator can change the due date."`
- **Body:** `{duedate: "YYYY-MM-DD", company_id, company_identifier}`. A missing `duedate` clears the date.
- **Errors (400):**
  - `"Task due date cannot exceed Sprint due date (…)"`
  - `"Due date cannot be set before subtask \"<title>\" due date (…)"`
- **Reply:** `{Good:true, data:"Record has Been Updated"}`.
- Socket `task_update/update {id, due_date}`.
- **Use it for:** inline due-date edits in **normal** companies. In ATS the due date is read-only.

### 3.15 `POST /tasks/updateleadsource/:id` — NOT FOR TASKS

Legacy CRM field. Remove it from the task module.

### 3.16 `DELETE /tasks/:taskId` — UNCHANGED (no UI on the website)

- **Perm:** `tasks-delete`.
- **Task-level:** creator, doer or head. Anyone else got a server crash before §12; now they get 403.
- **Hard delete.** It removes the task's attachment rows, notifications and dependency links. Subtasks and comments are left orphaned.
- **Reply:** `{Good:true, data:"Task, related attachments deleted, notification and email sent"}`.
- Socket `task_update/delete {id, parent_id}`.
- **The website has no delete button** (only the meetings module uses this endpoint). See §19 Q40.

### 3.17 `POST /tasks/approve/:taskId` — UNCHANGED (website doesn't call it; mobile may)

- **Who:** creator or Company Admin, else `403 "Only the task creator or company admin can approve a task."`
- **Body:** `{company_id, company_identifier}`.
- Status must be exactly `Pending-Approval`, else `400 "Only tasks in Pending Approval status can be approved."`
- **Reply:** `{Good:true, data:"Task has been approved."}`.
- **Effects:**
  - Sets `Complete` and `completed_at`.
  - Socket `task_update/update {id, status:"Complete", completed_at}`.
  - Notification `"approved your task"` to the doer + email.
  - Dependents are rescheduled and the next task may auto-start.

### 3.18 `POST /tasks/reject/:taskId` — CHANGED (status gate, ATS fields)

- **Who:** creator or Company Admin, else `403 "Only the task creator or company admin can reject a task."`
- Status must be exactly `Pending-Approval`, else `400 "Only tasks in Pending Approval status can be rejected."`
- **Body:** `{company_id, company_identifier, reason, additional_hours, reject_type?}`.
  - `reason`: required on the website. No max length on the server.
  - `additional_hours`: **minutes**. Your conversion is correct.
  - `reject_type`: **ATS only**.
    - `"requirement_changed"`: needs `additional_hours > 0`, else `400 "Please enter the effort to add."`
    - `"not_completed"`: send `additional_hours: 0`.

| Sent | New status |
|---|---|
| No `reject_type` (normal companies) | `Rejected` |
| `reject_type` set | `In Progress` if the doer has no other task in progress, else `Pending` |

- **Reply:** `{Good:true, data:"Task has been rejected.", status:"<new status>"}`.
- Socket `task_update/status_update {id, status, rejection_reason, effort_hours?}`.
- Notification `"rejected your task"` to the doer.
- **No new task is created.**

### 3.19 `POST /tasks/reopen/:taskId` — UNCHANGED (ATS reopen)

- **Who:** creator only, else `403 "Only the task creator can reopen a completed task."`
- The task must be `Complete`, `Completed` or On Hold, else `400 "Task must be completed or on hold to reschedule"`.
- **Body:** `{company_id, company_identifier, status: "In-Progress"|"Pending", priority: "normal"|"critical", effort_hours: <minutes > 0>, effort_unit, bump_to_front: true|false}`.
  - If effort is missing or 0: `400 "effort_hours must be greater than 0"`.
  - Send `bump_to_front` as a real JSON boolean — the string `"false"` counts as true.
- **Reply:** `{Good:true, data:"Task reopened and rescheduled"}`.
- Socket `task_update/status_update {id, status, task_priority}`, then `schedule_update`s.
- Your example sends `priority: "2"` — wrong. This field takes `"normal"` or `"critical"`.

### 3.20 `POST /tasks/reschedule-reopened/:taskId` — DON'T USE

- The website opens this modal only when a socket event carries `from_completed`, and the backend **never sends that flag** (dead path).
- The endpoint has no permission check.
- Use `/tasks/reopen` (ATS) or `/tasks/updatetaskstatus` (normal) instead.

### 3.21 `POST /tasks/recalculate/:taskId` — UNCHANGED

- **Body:** `{company_id, company_identifier, completed_at?: ISO}`. The body is not used by the server.
- There is no permission check.
- **Replies:**
  - `{Good:true, data:{queued:true}}`, or
  - `{Good:true, data:{start_date, suggested_due_date, duration_days}}`.
- Re-runs the doer's queue. The website calls it **in ATS companies** after the actions listed in §8.9. The backend already reschedules in most of those cases, so this call is a safety net.
- Mobile: copy the website's calls (ATS only). It is safe to call more than once.

### 3.22 `POST /tasks/extend-delayed/:taskId` — UNCHANGED (your payload is right)

- **Body:** `{additional_effort: <number in the chosen unit>, unit: "minutes"|"hours"|"days", company_id}`. The server converts (hours ×60, days ×480).
  - This is the **only** endpoint that converts units — do *not* pre-convert here.
  - If the value is 0 or missing: `400 "Additional effort must be greater than 0"`.
- There is no permission check and no status check.
- **Effects:**
  - The added minutes go onto the effort. `remaining_effort_hours` = the added minutes.
  - A new `due_date` is computed from now.
  - An `effort_history` `delay_extension` row is written.
  - The doer's queue is rebuilt.
- **Reply:** `{Good:true, data:{id, start_date, due_date, effort_hours}}`.
- Socket `task_update/schedule_update {id, start_date, due_date, effort_hours}`. It has **no `remaining_effort_hours`**, so patch `effort_hours`.

### 3.23 `POST /tasks/updatetaskproject/:taskId` — UNCHANGED (send `sprint_id`)

- **Perm:** `tasks-edit`. There is no task-level check on the server; the website shows the control only when `can_edit` (creator) **and** the user has `project-list`.
- **Body:** `{project_id, sprint_id, company_id, company_identifier}`.
  - `project_id` falsy or missing → **the task leaves its project** (stored 0).
  - `sprint_id`: leave it out to keep the current sprint. Send `null`/`0` for "no sprint", or the sprint id.
  - The server does not check that the sprint belongs to the project — only offer that project's sprints.
- **Errors:**
  - `400 "This task's scheduled due date (…) is after the sprint's deadline (…). The task cannot be added to this sprint."`
  - `200 {Good:false, data:"Task not found"}`
- **Planning rule:**
  - Moving into a project in **Planning** puts the task **On-Hold** (with a `status_update` event).
  - Moving out of Planning restores the status.
- **Reply:** `{Good:true, data:"Project assigned successfully"}`.
- **Sockets:** `task_update/sprint_assigned {id, project_id, sprint_id}`, possibly `status_update`, and `project_update/due_date_update` for the new and old project.
- Your `assignTaskToProject` sends only `project_id`. That is fine, but the website flow also offers a sprint (§16 T-024).

### 3.24 Migrations — DON'T USE

`POST /tasks/migrate-priorities` and `POST /tasks/migrate-effort-to-minutes` are Company-Admin-only, one-time data fixes.
- The website runs `migrate-priorities` once per browser (`localStorage priority_migrated_<companyId>`). That is enough.
- `migrate-effort-to-minutes` is no longer called.
- Mobile should call neither.

### 3.25 Dependencies

**`GET /tasks/dependencies/:taskId?company_id=`** — UNCHANGED.
- `company_id` is required in practice (without it the reply is `[]`).
- Returns the tasks that **block** `:taskId`:
```json
{ "Good": true, "data": [{ "dependency_id": 9, "task_id": 222, "title": "Blocker", "status": "In-Progress",
  "due_date": "2026-11-02", "priority_name": null, "priority_color": null,
  "assigned_to": { "id": 7, "full_name": "…", "image": "…" }, "created_by": { "id": 3, "full_name": "…", "image": "…" },
  "type": "finish_to_start" }] }
```
In each row, `task_id` is the **blocker's** id, not the task you asked about.

**`POST /tasks/dependencies/add`** — `{task_id, depends_on, company_id, company_identifier}` means **`task_id` waits for `depends_on`**.
- **Errors (400):**
  - `"task_id and depends_on are required."`
  - `"A task cannot depend on itself."`
  - `"This dependency already exists."`
  - `"Circular dependency detected."` (full cycle check)
  - `"This task is On Hold and cannot have dependencies. Remove the On Hold status first."`
  - `"\"<title>\" is On Hold and cannot be used as a dependency."`
- Completed blockers are allowed by the server, but the website hides them from the picker.
- **Reply:** `{Good:true, data:<dependency row>}`.
- No dependency socket event — only `schedule_update`s.

**`POST /tasks/dependencies/remove`** — same body, and all three ids are required.
- **Errors:**
  - `400 "task_id, depends_on, and company_id are required"`
  - `404 "Dependency not found"`
  - `403 "Only the dependency creator or admin can remove this dependency"`
- **Reply:** `{Good:true, data:"Dependency removed."}`.

### 3.26 `POST /tasks/reorder-critical` — UNCHANGED

- **Body:** `{orderedIds: [taskId, …], company_id}`. Position *i* gets `critical_order = i+1`. Only `critical` tasks are changed; other ids are skipped.
  - An empty array gives `400 "orderedIds must be a non-empty array"`.
- If a task that is In Progress ends up below position 1, it is set to `Pending`, with a `status_change` event.
- **Reply:**
  ```json
  { "Good": true, "data": "Critical task order updated", "blockedTasks": [{ "_id": "…", "id": 222, "title": "Blocked task" }] }
  ```
  `blockedTasks` = reordered tasks that still wait on an unfinished blocker. They will run at the chosen position once the blocker finishes. The website shows: *Order saved. "A", "B" have unfinished dependencies — they will be scheduled at the selected position once the dependencies are completed.*
- **Sockets:** `task_update/critical_reorder` with `data: [{id, critical_order}]`, then `schedule_update`s.

### 3.27 Notes and attachments — see §11

| Endpoint | Status |
|---|---|
| `POST /tasks/addnote/:taskId` | UNCHANGED |
| `POST /tasks/showtasknote/:taskId` | UNCHANGED |
| `POST /tasks/updatenote/:noteId` | UNCHANGED |
| `POST /tasks/updatenotepin/:noteId` | CHANGED meaning — it is a **toggle** |
| `POST /tasks/deletenote/:noteId` | UNCHANGED |
| `POST /tasks/updatenotereaction/:noteId` | UNCHANGED |
| `POST /tasks/attachments/:taskId` | UNCHANGED |
| `POST /tasks/attachmentdelete/:attachmentId` | UNCHANGED |
| `GET /user/note-mentions` | UNCHANGED |

---

## 4. Project and sprint API catalog

All paths sit under `/api/v1`. Every call needs auth and the `Tasks` module.

### 4.1 Project model

| Field | Value |
|---|---|
| `id` | number |
| `name` | required |
| `owner` | user id, optional |
| `status` | **`Planning` (default), `In Progress`, `On Hold`, `Completed`, `Abandoned`** |
| `description` | HTML |
| `due_date` | Date (ISO), required |
| `created_by`, `company_id`, `createdAt`, `updatedAt` | — |

- **There are no project members.** Who can see a project is decided by owner, creator and task involvement (§4.2).
- Your type `"Planning" | "In Progress" | "Pending" | "Completed"` is wrong. `Pending` does not exist and sending it returns a 500. Add `On Hold` and `Abandoned`.

**Project status changes the tasks inside it** (server-side, `projectController.js:452-497`):

| Project moves to | Effect on its open tasks |
|---|---|
| `Planning` or `On Hold` | Each open task is set to `On-Hold`. Its old status is kept in `suspended_status`. While the project is in Planning, nobody can take a task off hold (400). |
| Out of `Planning`/`On Hold` | Tasks get their `suspended_status` back. |
| `Abandoned` | Open tasks become `Abandoned`. This value is not in the task status list — show it as a grey badge. |
| `Completed` | Blocked while any top-level task is still open: `400 "Cannot mark project as Completed. N task(s) is/are still open."` The website also requires the project to be `In Progress` first. |

These cascades send **no `task_update` events**. Refetch tasks when `project_update` arrives.

**Project due date follows its tasks.** Whenever a task in the project changes, the project `due_date` is moved to the latest top-level task due date, and `project_update {action:"due_date_update", data:{id, due_date}}` is sent.

### 4.2 Endpoints

| Mobile function | Method + path | Perm | Request | Reply / notes |
|---|---|---|---|---|
| `getAllProjects` | `GET /projects?company_id=` | `project-list` | — | Cached (`stale`). `{Good, data:{projects:[…], users:[…]}}`.<br>Each project = raw fields + `project_owner` + `created_by_user` (user objects or null) + `tasks[]` (with `can_edit*` flags) + `attachments[]`.<br>**Visibility:** Company Admin sees all. A head sees projects they own or created, or where they or a reportee is a task's creator or doer. Anyone else: own/created, or a creator/doer on one of its tasks. |
| `getAllProjectsForAssignment` | `GET /projects?company_id=&scope=all&lite=true` | `project-list` | — | `{Good, data:{projects:[raw project rows]}}` — **every** company project, no extras. **This is the call for the "Assign to project" picker** (the website uses it). Without `lite=true` it returns every project with all its tasks — don't do that. |
| `getProjectsList` | `GET /projects/list?company_id=` | `project-list` | — | `{Good, projects:[{_id,id,name,status}]}` — note `projects` is **top-level**. Same visibility as GET /. Used only by the website sidebar. |
| `createProject` | `POST /projects/create` | `project-create` | `{name, owner?, status?, description?, company_id, due_date}` | `name`, `company_id`, `due_date` required → else `400 "Name, Company ID, and Due Date are required"`. `due_date`: the website sends a full ISO string.<br>Reply `{Good, data:<project>}` (`data.id`).<br>Socket `project_update {action:"create", project_id}`. A project chat room is also created (§4.5). |
| `updateProject` | `POST /projects/update/:id` | `project-edit` | any of `{name, owner, status, description, due_date}`; missing = unchanged | `404 "Project not found"`; the Completed rule above.<br>Reply `{Good, data:<project>}`.<br>Socket `project_update {action:"update", project_id}`.<br>On the website the inline row edits send a single field (`{status}` / `{owner}` / `{due_date:"YYYY-MM-DD"}`). The detail "Save" sends all five fields. |
| `deleteProject` | `DELETE /projects/delete/:id` | `project-delete` | — | **Only the project creator** — `403 "Restriction: Only the original Project Creator is authorized to delete projects."` (a Company Admin is refused too).<br>Tasks are **not** deleted; they lose their `project_id`.<br>Reply `{Good, data:"Project deleted and tasks decoupled"}`.<br>**The website has no delete button** (the code exists but is never shown). |
| `getProjectDetail` | `GET /projects/detail/:id` | `project-list` | — | `{Good, data:{…project, attachments:[{id, attachment, …}], tasks:[…]}, priority:[…], status:["Pending","In-Progress","On-Hold","Pending-Approval","Rejected","Complete"]}`.<br>`priority` and `status` are **top-level siblings** of `data`.<br>**No `sprints`, no `project_owner`, no `created_by_user`** — use `GET /sprints` and the user list.<br>Task rows: the full task + `task_assignee`, `task_assigned_to`, `priority_*`, `sub_tasks:[{id,title,due_date}]`, `subtask_count`, `can_edit*`. Subtasks that belong to the project also appear as their own rows. |
| `uploadProjectAttachment` | `POST /projects/attachments/:projectId` | none | FormData `file` (one file, 30 MB, same extension list as tasks) | `{Good, data:{id, attachment, …}}`. Errors: `404 "Project not found"`, `400 "No file uploaded"`. |
| `deleteProjectAttachment` | `POST /projects/attachmentdelete/:attachmentId` | none | — | `{Good, data:"Attachment deleted"}`. The website asks first: "Remove File — This will permanently delete this attachment." |
| `getProjectUsers` | `GET /username/project-users?company_id=` | auth | — | `{Good, data:{user:[{id, first_name, last_name, full_name, image}]}}` — **all** active company users, used as owner candidates. Errors use the key `error`. |
| AI (website only) | `POST /projects/ai/questions/:id`, `/ai/analyze/:id` (NDJSON stream), `/ai/create-tasks/:id` | `project-create`/`project-edit`; `tasks-create` for create-tasks | see §17 P-004 | Not recommended for mobile now. |

### 4.3 Sprints (`/api/v1/sprints`) — NEW for mobile

**Model:** `{id, name, project_id, company_id, due_date (Date), description, image, status: "Planning"|"In Progress"|"Completed", created_by, createdAt}`.

There is no sprint permission name and no company check. The website enforces the rules below in the client.

| Method + path | Request | Reply / errors |
|---|---|---|
| `GET /sprints?company_id=&project_id=` | — | `{Good, data:[{…sprint, attachments:[…]}]}`. `400 "Company ID is required"`. |
| `POST /sprints/create` | `{name, due_date (ISO), project_id, company_id, created_by: <my user id>}` | **`created_by` is required** (without it the server returns 500).<br>**201** `{Good, data:<sprint>}`.<br>Errors:<br>• `400 "Missing required fields"`<br>• `404 "Project not found"`<br>• `403 "Permission Denied: Only the Project Owner or Creator can create sprints for this project."`<br>• `400 "Sprint due date (…) cannot exceed project due date (…)"` |
| `POST /sprints/update/:id` | `{due_date}` (the website only changes the date) | Send only the fields you change — the whole body is copied onto the sprint.<br>Reply `{Good, data:<sprint>}`. `404 "Sprint not found"`. |
| `DELETE /sprints/delete/:id` | — | Its tasks get `sprint_id = null` (no task event).<br>Reply `{Good, data:"Sprint deleted successfully"}`. |
| `POST /sprints/attachments/:id`, `/sprints/attachmentdelete/:id` | — | Exist but the website never uses them. |

Sprint changes emit `project_update {action:"sprint_create"|"sprint_update"|"sprint_delete", project_id}`.

**Website rules (client-side):**
- Sprint name and date are required: "Please enter sprint name and due date".
- A sprint date cannot be after the project due date.
- When a sprint's date changes, it cannot be earlier than any task in it.
- Sprints cannot be renamed.

**Putting a task in a sprint** (only the active ones — sprints whose status is not `Completed`):
- From a task row: `POST /tasks/updatetaskproject/:id {project_id, sprint_id}` (§3.23). Server event: `task_update/sprint_assigned`.
- From the project tasks table: the same call. The option "Remove sprint" sends `sprint_id: null`.
- At create: `sprint_id` in the create body. The website create form does not offer a sprint picker; only the inline add-row in a project does (it creates first, then calls `updatetaskproject`).

**One task belongs to at most one project and one sprint.**

### 4.4 Project permissions

| Permission | Backend gates | Website shows |
|---|---|---|
| `project-list` | `GET /projects`, `/projects/list`, `/projects/detail/:id` | Sidebar Projects section; the project chip on task rows (with `can_edit`) |
| `project-create` | `POST /projects/create` | "Create Project" button; "Create a new project" option in the task-row project picker |
| `project-edit` | `POST /projects/update/:id` | Opening/editing a project. A user also gets this on the website when they are the project's **creator or owner**, even without the permission — but the backend still checks `project-edit`. |
| `project-delete` | `DELETE /projects/delete/:id` (+ creator only) | Nothing (no delete UI) |
| `tasks-list` | — | The website route `/:cid/projects` itself is guarded by `tasks-list`, not `project-list` |
| `tasks-edit` | `POST /tasks/updatetaskproject/:id` | — |

These names are singular `project-*`. The plural `projects-*` names exist in old seed data but nothing checks them.

### 4.5 Project chat rooms

- Creating a project also creates a chat room of type `project` with two channels, `General` and `Documentation`. At first the creator is the only member; the owner is not added.
- Assigning a task to a project does **not** change chat membership straight away. Later, when a user loads `GET /chat/rooms`, they are added to the parent project room if they own the project or are the doer of any task in it. Nobody is ever removed.
- Mobile currently hides project rooms. No change is needed for the task module.

---

## 5. Socket event catalog

### 5.1 Connection facts

- **No JWT handshake, no rooms for tasks.** Every task and project event goes out with `io.emit` to **every connected client of every company**. You must filter on `company_id`, which may be a number or a string — compare with `Number()`.
- The only rooms that exist are `chat_<roomId>` and `role_<roleId>`. `registerUser(userId)` is needed for chat (you already call it).
- **No replay.** After a reconnect, do one silent full refetch (your current approach is right).
- **Ordering and duplicates:** order is not guaranteed across different code paths. One user action can produce several events for the same task, for example `update` followed by several `schedule_update`s, or `create` → `status_change` → `critical_reorder` → `schedule_update`. Make every handler an idempotent patch.

### 5.2 `task_update` — every action (`{company_id, action, data, assignee?, asigned_to?}`)

Top-level `assignee` = creator id and `asigned_to` = doer id, when present.

| `action` | Sent by | `data` | Recommended mobile reaction |
|---|---|---|---|
| `create` | create; recurring cron (new instance) | the whole task + `task_assignee`, `task_assigned_to`, `asignedd_to` (objects; in cron events these are raw user docs) | **Patch:** insert into the right bucket — doer = me → assigned; creator = me → created; otherwise only if you are admin, or a head and the user is in `team_member_ids`. Its dates may be blank until a `schedule_update` arrives. Or debounced refetch (fine). |
| `create_subtask` | createsubtask | subtask + people objects | Refetch, or bump the parent's `subtask_count` |
| `update` | update (full row + people objects); reassign `{id, asigned_to, task_assigned_to}`; due date `{id, due_date}`; approve `{id, status:"Complete", completed_at}` | partial or full | Patch the fields present. If the task is open in detail, reload `/view`. |
| `status_update` | updatetaskstatus `{id, status, completed_at?}`; reject `{id, status, rejection_reason, effort_hours?}`; reopen `{id, status, task_priority}`; auto-start next task `{id, status:"In Progress"}`; Planning hold `{id, status}` | partial | Patch `status` (+ the other fields present) |
| `status_change` | bump-to-front / critical reorder | `{id, status, effort_hours?}` | **New for mobile.** Patch `status`. |
| `schedule_update` | the engine (many places) | `{id, start_date, due_date, project_id?, parent_id?, remaining_effort_hours?, effort_hours?}` | **Patch `start_date` and `due_date`** (both may be `null` = on hold / unscheduled), plus `remaining_effort_hours`/`effort_hours` when present. The website batches these for 350 ms. |
| `critical_reorder` | create, update to critical, reorder-critical | **an array** `[{id, critical_order}]` | **New for mobile.** Patch `critical_order` on each row and re-sort. |
| `sprint_assigned` | updatetaskproject | `{id, project_id, sprint_id}` | **New for mobile.** Patch both fields. |
| `delete` | delete | `{id, parent_id}` | Remove the row. Close the detail if it is open. |
| `add_note` | addnote | `{task_id (string), note}` | `notes_count + 1`; if the comments for that task are open, append `note` |
| `update_note` | updatenote | `{id, task_id, notes}` | Patch the note text |
| `delete_note` | deletenote | `{id, task_id}` | Remove the note; `notes_count − 1` |
| `update_note_pin` | updatenotepin | `{id, task_id, pin_top}` | Patch `pin_top` |
| `update_note_reaction` | updatenotereaction | `{id, task_id, reactions}` | Replace the reactions |
| `add_attachment` | attachments | `{task_id, attachment}` | If the detail is open, reload it |
| `delete_attachment` | attachmentdelete | `{id, task_id}` | If the detail is open, reload it |

Every action in your type list is sent by the backend. Your list is missing two: **`status_change`** and **`critical_reorder`**. No event carries a `from_completed` flag, so the website's "Task Reopened — Estimate Hours" popup never fires.

### 5.3 Other events

| Event | Payload | Meaning and mobile reaction |
|---|---|---|
| `project_update` | `{company_id, action, project_id}` with action `create`, `update`, `delete`, `sprint_create`, `sprint_update`, `sprint_delete`; **or** `{company_id, action:"due_date_update", data:{id, due_date}}` (no top-level `project_id`) | Project or sprint changed, or a project's due date moved. Project status cascades change task statuses **without** task events. **Keep refetching tasks on it.** Refetch the project list/detail if it is shown. |
| `priority_update` | `create {data:doc}`, `update {data:{id (string), name, color, order}}`, `delete {data:{id (string)}}` (`company_id` may be a string or missing on delete), `status_update {data:{id, status}}` | Company priority list. Your handling is fine; compare ids with `Number()`. New tasks use `task_priority` (normal/critical), so this list only matters for old tasks. |
| `jobstatus_update` | `create`/`update`/`delete`/`status_update` | **Employee job statuses — not task statuses.** Ignore it in the task module. |
| `user_update` | `create`/`update`/`delete`/`status_update`/`wfh_update` with `data` | The people list changed. Refetch task owners, debounced. Fine as you do it. |
| `task_scheduling_settings_update` | `create {data:doc}`, `update {data:{id, notification_percentage?, reschedule_for_meetings?}}` | ATS settings changed. Schedules may shift through later `schedule_update`s. A debounced refetch is fine. |
| `notification` | `{company_id, assigned_to, data:{…row, category, mobile_visible}}` | Sent to **everyone**. Keep it only when `assigned_to === me`, and drop it when `data.mobile_visible === false`. |
| `role_update` | `{company_id, action:"update_permissions", roleId, permissions:[names]}` (+ `create`/`delete`/`status_update`) | When `roleId` equals your role, replace `user_permissions` with `permissions` and re-check the task gates (create button, `tasks-edit`). The website also refetches modules on `modules_update`, `packages_update` and `companies_update` with `GET /companies/:id/modules`. |
| `evaluation_update` | `{company_id, action:"update", data}` | HR evaluation. Ignore in the task module. |

There are **no** separate events for approval, reminders, overdue or recurring generation. Approval comes as `update`; a recurring instance comes as `create`; reminders come as `notification`.

---

## 6. Permission matrix

Where the values come from:
- Login reply: `user.userdata.user_permissions` (array of names), `user.userdata.role_title`, `user.userdata.is_head` (`"yes"`/`"no"`), `user.company.modules`.
- A **Company Admin** passes every route permission check, but gets no task-level rights on tasks they neither created nor do.

| Action | Backend (route permission + task-level) | Website shows the control when | Mobile should |
|---|---|---|---|
| See the Tasks screen | Lists check only auth + module (`addnote` needs `tasks-list`) | Route guard: `tasks-list` + module `Tasks` | Hide the Tasks tab without `tasks-list` or the `Tasks` module |
| Create task | `tasks-create` | `(role_title === "Company Admin" \|\| is_head === "yes") && tasks-create`. The button is **hidden** otherwise. The sidebar "+" checks only admin/head (a website inconsistency). | Use the website rule |
| Open task detail | none (`/view` is open) | The detail drawer exists only with `tasks-edit`; without it, tapping a row does nothing | Allow read-only detail for everyone. Allow editing only with `tasks-edit` (see the next rows). |
| Edit details (title, description, approval, priority, effort, dependencies, attachments) | `tasks-edit` + creator | `can_edit && status ≠ Complete`. Controls are **hidden** (read-only text) otherwise. | Same |
| Edit recurring settings | `tasks-edit` + creator | `can_edit` (even after completion) | Same |
| Change status / complete checkbox | creator, doer, or head of either | `can_edit_status`. The checkbox is **hidden**; the status shows as a plain badge. | Same |
| Reassign | `tasks-edit` + creator | `can_edit`. Otherwise a plain avatar + name. | Gate by `can_edit` (not `is_head`) |
| Due date inline (normal companies) | creator | `can_edit && !ATS`, and status not On Hold | Same. ATS: read-only. |
| Approve / Reject | creator or Company Admin; status must be `Pending-Approval` | Approve = the creator ticks the checkbox (`can_edit_status`). Reject = "Rejected" in the status menu; the detail view refuses it unless the task is Pending-Approval when `approval_required = 1`. | Show Approve/Reject on Pending-Approval tasks when `can_edit` is true or the user is Company Admin |
| Reopen a completed task | creator | `can_edit`; else the warning "Only the task creator can reopen a completed task." | Same |
| Delete task | `tasks-delete` + creator/doer/head | **No UI** | Don't add it (or creator-only behind a confirmation, if product wants it) |
| Subtasks | `tasks-create` + `can_edit_subtask` on the parent | **Turned off** | Don't add |
| Dependencies add/remove | add: no check; remove: the dependency's creator or admin | inside detail when `can_edit` (ATS create too) | Gate by `can_edit` |
| Reorder critical | no working check (bug) | only from the critical prompt in create/edit (ATS) | Same as the website |
| Comment (add) | `tasks-list` | everyone who can open the task | Need `tasks-list` |
| Comment edit / delete | `tasks-edit` + author only | own notes only (icon hidden otherwise) | Own notes **and** `tasks-edit` |
| Comment pin / react | `tasks-edit` | anyone | Need `tasks-edit` |
| Task attachment upload / delete | `tasks-edit` + creator/doer/head | `can_edit && status ≠ Complete` | Same |
| Assign task to project / sprint | `tasks-edit` | `can_edit && project-list` | Same |
| Create project from the task row | `project-create` | the option is shown with `project-create` | Same |
| Project list / detail | `project-list` | sidebar with `project-list` | Same |
| Create / edit / delete project | `project-create` / `project-edit` / `project-delete` (+ creator for delete) | Create button with `project-create`; edit with `project-edit` or creator/owner; no delete UI | Same |
| Create sprint | project owner or creator (no permission name) | inside project detail | Same |
| Add a task inside a project | `tasks-create` | Company Admin or head | Same |
| Task scheduling settings | module ATS (no permission check on the server) | `taskschedulingsettings-list` + ATS | Not for mobile |

Permission names that do **not** exist: `tasks-approve`, `tasks-reassign`, `sprint-*`. Approve/reject/reassign are decided by creator/admin rules, as above.

Your helpers map like this:

| Mobile helper | Use |
|---|---|
| `canViewTasks` | `tasks-list` — start using it |
| `canEditTask` | `can_edit` + `tasks-edit` |
| `canEditStatus` | `can_edit_status` |
| `canDeleteTask` | — (no UI) |
| `canReassignTask` | `can_edit` |
| `canApproveReject` | `can_edit` or admin, on a Pending-Approval task |
| `canCreateSubtask` | — (turned off) |

---

## 7. Status, priority and transition matrix

### 7.1 Canonical task statuses

Server list (`data.status`): **`Pending`, `In-Progress`, `On-Hold`, `Pending-Approval`, `Rejected`, `Complete`**.

The server also accepts these when comparing:
- `In Progress`, `In Review`, `In Testing` — all count as "in progress".
- `On Hold` (with a space).
- `Completed`.
- `Partial Complete` — only for tasks that have subtasks.
- `Pending Approval` (with a space).
- `Abandoned` — set by an abandoned project.

What mobile should **send**:
- `Pending`, `In-Progress`, `On-Hold`, `Complete`.
- `Partial Complete` only when `subtask_count > 0`.

Your UI label `Completed` → API `Complete` mapping is right. Change your `On Hold` → **`On-Hold`** so it matches what the website stores.

| From → To | Endpoint | Who | Rules / messages |
|---|---|---|---|
| any → `In-Progress` | updatetaskstatus | `can_edit_status` | One-in-progress (§8.7); dependency gate when leaving `Pending`; Planning hold |
| `In-Progress` → `Complete` | updatetaskstatus | `can_edit_status` | **Website rule:** the task must already be In Progress — "Please set the task to 'In Progress' before marking it as complete." (the checkbox also accepts In Review, In Testing, Pending-Approval). The server checks subtasks; approval may turn it into `Pending-Approval`. |
| doer: → `Complete` with `approval_required=1` | updatetaskstatus | doer | Becomes `Pending-Approval`; the reply message says so (§3.12) |
| `Pending-Approval` → `Complete` (approve) | updatetaskstatus or `/approve` | creator (or admin for `/approve`) | Website: the creator ticks the checkbox |
| `Pending-Approval` → `Rejected` / back to work | `/reject` | creator or admin | Reason required. ATS: two-step `reject_type`. |
| `Pending-Approval` → `In-Progress`/`Pending` (ATS "resume") | updatetaskstatus + optional `effort_hours` | `can_edit_status` | Website modal "Resume Task" |
| any → `On-Hold` | updatetaskstatus | `can_edit_status` | Refused if other tasks depend on this one. Dates are cleared. |
| `On-Hold` → other | updatetaskstatus | `can_edit_status` | Refused while the project is in Planning |
| `Complete` → other (reopen) | normal: updatetaskstatus; ATS: `/reopen` | **creator** (website rule; the server only enforces it on `/reopen`) | `/update` refuses any status change on a Complete task |
| any → `Rejected` directly | — | — | Not possible (only via `/reject` from Pending-Approval) |

Statuses offered in website pickers:

| Picker | Values |
|---|---|
| Create form | `Pending`, `In-Progress`, `On-Hold`, `Complete`. The default is `In-Progress` if the doer has no active task, otherwise `Pending`. |
| Status menus | the server `status` list **minus** Pending-Approval, plus `Partial Complete` when there are subtasks |
| List status filter | Pending, In-Progress, On Hold, Completed |

### 7.2 Priority model

- **`task_priority`: `normal` | `critical`** is the real priority. It is required on create.
- In **ATS** companies the user can choose Critical (create, detail, inline add-row, reopen).
- In normal companies the website always shows a fixed **"Normal"** badge.
- Subtasks inherit their parent's priority and cannot be changed.
- `priority` (company priority id with `priority_name`/`priority_color`) is the **old** model:
  - The website create form never sends it.
  - The detail view shows the company-priority dropdown **only for old tasks whose `task_priority` is empty**.
  - Mobile: show the Normal/Critical control (ATS) or the badge (normal companies). Show the company-priority picker only when `task_priority` is empty.
- `critical_order`: 1 = run first. It is set by create, by update to critical, and by `/reorder-critical`.
- **Sort as the website does:** due date ascending, then critical before normal, then id. The critical-first-by-`critical_order` sort exists only in a dead "critical" tab on the website. Your sort (critical first by `critical_order`, then due date) is acceptable but differs from the website.

### 7.3 Approval / rejection / reopen

- `approval_required: 1` means the doer cannot finish the task alone. Their "Complete" becomes `Pending-Approval`, and `pending_approval_at` is stamped (an on-time submission counts as on time in HR evaluations).
- The **creator** (or a Company Admin, through `/approve` and `/reject`) then approves (→ Complete) or rejects.
- Every day at 09:00 PKT the backend reminds the **doer** of tasks still pending approval (a notification).
- Reopen: only the creator, only from Complete (or On Hold for `/reopen`).
- There is no "undo" for approve, reject or delete.

---

## 8. Business logic

### 8.1 Visibility
See the buckets in §3.1. Mentions grant visibility: being @mentioned in any comment on a task puts it in `all_other_tasks`.

### 8.2 Detecting ATS on mobile

1. At login, read `user.company.modules`. It is an array of **names**, already limited to modules in the company's package that are Published.
2. `isAdvanced = modules.includes("Advanced Task Scheduling")`. The website uses this exact test.
3. To refresh: call `GET /api/v1/companies/:company_id/modules`. It returns `{Good:true, data:{modules:[names]}}` and works for company users on their own company.
4. **Do not** call `/api/v1/modules/all` — it returns `403 {Good:false, data:"Access denied: SaaS admin only"}` to company users.

### 8.3 Scheduling engine (ATS)

The engine runs for every top-level task with `effort_hours > 0`. It plans each **doer's queue** separately (`rescheduleUserQueue`, `tasksController.js:1098`).

**Inputs:**
- The doer's shift: start, end, lunches, working days.
- Holidays, approved leaves and off days, looking 12 months ahead. With no shift, Saturday and Sunday are off.
- Daily capacity = `daily_task_capacity_hours`% of the shift minutes (default 80%).
- Meeting time, when the setting `reschedule_for_meetings` is on and the company has Meetings + ATS.

**Queue members:** the doer's top-level tasks with effort, not templates, and not Complete / On Hold / Partial Complete / Pending-Approval.

**Queue order:**
1. Critical tasks, by `critical_order`.
2. Recurring instances.
3. Normal tasks, by their existing start date.
4. Then due date, then id.

Tasks already In Progress keep their place and set where the cursor starts.

**Output format:**
- With a shift: `start_date`/`due_date` as `"YYYY-MM-DDTHH:mm"`.
- Without a shift: day-level `"YYYY-MM-DD"`.

Every changed task gets a `schedule_update` event. The project's due date is then adjusted.

**Dependencies:** a task waiting on another person's task cannot start before that task's `completed_at`/`due_date`. Free tasks fill the gap in the meantime. A blocker that is On Hold pushes the dependent task to the end.

**Auto-start:** when a task is completed or approved and the doer has nothing in progress, the next pending task without unfinished blockers is set to `In Progress` automatically (event: `status_update`).

The engine does **not** need mobile to call anything. `/recalculate` is a safety net (§8.9).

### 8.4 Advanced vs normal company — what changes in the UI

| Area | Normal company | ATS company |
|---|---|---|
| Create | Due date (required, past days disabled, default today) | Effort + unit (required, > 0), `due_date: null`, dependencies picker, Normal/Critical + critical prompt |
| Detail | Editable due date ("Est. Completion" picker) | Read-only: Start Date, Est. Completion (= `due_date`), Actual Completion (`completed_at`), Effort, Effort Logs |
| Due Today tab | the whole PKT day | due today **and** `due ≥ now` (refresh "now" every 30 s) |
| Delayed tab | `due < start of today` | `due < now` |
| Reject | one step | two steps: "Requirement Changed" (add effort) / "Task Not Completed" |
| Leaving Pending-Approval | plain status change | "Resume Task" modal with optional new effort |
| Reopen from Complete | plain status change (creator) | `/reopen` with priority + effort |
| `/recalculate` calls | none (except after a dependency add/remove) | after the actions in §8.9 |

### 8.5 Critical tasks and `bump_to_front` (ATS)

`bump_to_front: true` = "stop the doer's current task and start this critical task now". The server then:
1. Pauses the doer's In-Progress task to `Pending`, keeping its remaining effort (minimum 15 min). Event: `status_change`.
2. Gives this task `critical_order 1` and sets it to `In Progress`.
3. Shifts the other critical tasks down by one.
4. Rebuilds the queue from now.

`bump_to_front: false` (or omitted) = the task goes after the doer's existing critical tasks (`critical_order = max + 1`).

**Website flow when the user picks Critical** (create, edit, add-row):
- If the doer has **no** unfinished critical task, Critical is set and `bump_to_front = true` without asking.
- If they **do**, the "Set Critical Priority" prompt appears (§16 T-011):
  - **Stop & start now** → bump `true`. If there are other critical tasks, the "Order Critical Tasks" drag list follows. Confirm sends `/reorder-critical`; `bump_to_front` = "this task ended up first".
  - **Wait** → bump `false`.

There is **no maximum** number of critical tasks, and the backend never refuses because of a conflict. The prompt is UI only.

### 8.6 Effort units

| Field | Unit |
|---|---|
| `effort_hours` (create, update, reopen, resume), `remaining_effort_hours`, `total_effort_hours`, `effort_history[].value` | **minutes** |
| `effort_unit` | `minutes` / `hours` / `days`, display only (1 day = 8 h = 480 min). Unknown values → `hours`. |
| Reject `additional_hours` | **minutes** |
| `extend-delayed` | `additional_effort` + `unit` (the server converts) |
| AI create-tasks | `effort_value` + `effort_unit` |

**Display:** divide by 60 for hours or by 480 for days, using `effort_unit`. Show values under 60 minutes in minutes.

`remaining_effort_hours` = minutes still left on a paused or in-progress task. It arrives in `schedule_update` (some paths) and in `/delayed-popup`.

### 8.7 One task in progress

The server enforces it **only when the current or the other in-progress task has effort > 0** (in practice, ATS).

| Endpoint | What happens on a conflict |
|---|---|
| `/create` | status is lowered to `Pending` (or bump is forced for critical tasks) — no error |
| `/update`, `/updatetaskstatus` | `400 "\"<title>\" is already in progress. Complete or pause it before starting another task."` |

The scope is **per doer**: all of that doer's tasks, not only the ones you have loaded. In normal companies, several tasks may be In Progress at once.

The website does not block this on the client. The only client logic is on create: it **pre-selects** In-Progress when the doer has no active task.

Remove your device-side block and show the server message.

### 8.8 Overdue / delayed

**List tabs:**
- Delayed tab rule: §8.4, excluding Complete, Partial Complete and On Hold.
- The server `delayed` filter includes completed tasks.

**Popup:** server-driven, `GET /tasks/delayed-popup` (§3.5).
- It goes to the **creator** of an in-progress task whose due time has passed.
- "Extend Task" → `/extend-delayed` (§3.22).
- The website is **not** limited to ATS. Extending a task without effort turns it into an engine-scheduled task.

**Notifications (crons):**
- 09:00 PKT digest: "You have N task(s) due today" / "You have N overdue task(s)".
- With a Task Scheduling Settings row: every minute, "Deadline approaching: …" when `notification_percentage`% of the time is left, and "Task delayed: … past deadline". These are grouped into one notification per task per 24 h.

Your once-per-session "overdue summary toast" has no website counterpart. Keep it or drop it — it is a product choice.

### 8.9 When the website calls `/recalculate` (ATS only, except dependencies)

- After completing a task, or setting it to `Cancelled` (send `completed_at`).
- After leaving On Hold, or leaving Partial Complete.
- After a reassign.
- After a reject (send `completed_at`).
- After a dependency add or remove (**even without ATS**).
- After saving the detail when effort, priority, assignee or bump changed — unless a critical reorder was just sent.
- **Not** after create.

### 8.10 Recurring tasks

A "recurring task" is a **template** (`is_recurring: true`, status `Recurring` in old data). It never appears in `/all` or `/duetoday`.

**Cron `recurringTasksCron.js`** (every 15 min, PKT) creates **instances**:
- Instance fields: `is_recurring: false`, `recurrence_origin_id = template id`, status `Pending` (`On-Hold` in a Planning project), `due_date` = today as a placeholder, then the queue schedules it. `sprint_id` is always null.
- It only runs inside the doer's shift, after `recurring_time`, at most once per day.
- Holidays, off days and leaves move the date (weekly, monthly, annual) or skip it (daily excluded days).

| Period | Rule |
|---|---|
| `daily` | every working day except `recurring_exclude_days` |
| `weekly` | the next `recurring_week_day` |
| `monthly` | `recurring_month_date` (clamped to the month's length) |
| `quarterly` | every 3 months |
| `semiannually` | every 6 months |
| `annually` | `recurring_annual_month` + `recurring_annual_date` |

- `recurring_total_count`: 0 = no limit. Otherwise generation stops after N instances (the template becomes non-recurring).
- **Editing:** change the template in its detail ("Enable Recurring" switch and fields) and save with `/update`. Changing the period restarts the count.
- **Stopping:** switch recurring off on the template.
- There is no pause, and no "edit this and future instances". Instances are independent tasks.
- **Delete series:** not supported (there is no delete UI).
- The website offers daily, weekly, monthly and annually only. Quarterly and semiannually have no extra fields — don't add them now.
- Website "Due Today" dedup: when a template and its instance are both due today, only the instance is shown (latest per `recurrence_origin_id`).

### 8.11 Subtasks

The backend supports them:
- Parent effort cap; parent complete only when all subtasks are complete; a subtask cannot change status once the parent is complete.
- They inherit `task_priority`.

**The website turned the subtask UI off** (`SUBTASK_DISABLED`), except for one leftover path inside a project. Rows can still have `parent_id > 0` (old data, AI tasks). The website shows them as normal rows placed under their parent, and offers `Partial Complete` when `subtask_count > 0`.

Mobile: show them as rows; don't build create.

### 8.12 Leads

Tasks and leads are separate. `lead_id` on a task notification is always 0. `updateleadsource` is a legacy CRM endpoint. Task pushes never carry `type:"lead"` (§10).

### 8.13 Evaluation side effects

Completing, approving and rejecting can change HR evaluations (`helper/evaluationTasks.js`). This is server-only; mobile does nothing.

---

## 9. Website frontend checks (exact messages)

### 9.1 Create task (`CreateTask.jsx`)

**Required fields:** Title (trimmed), Assigned To, Status.
- One combined message lists every missing field, e.g. `Please fill in required fields: Title, Assigned To, Status`.

**Recurring:** turned on with no period → `Please select a recurrence period for recurring tasks!`

**ATS effort:**
- Empty → `Effort is required`.
- Not greater than 0 → `Effort hours must be greater than 0`.
- Unit menu: Minutes / Hours / Days, default **Hours**.
- Step: 0.5 for hours, 1 otherwise.
- Changing the unit converts the number already typed.

**Due date (normal companies):**
- Format shown: "DD MMM". Past days are disabled.
- Default: today.
- It cannot be cleared.

**Assignee:**
- The list is `task_owner`. Search covers names; at most 10 results; "No members found".
- Default: the current user.

**Status:**
- The four values in §7.1, with the auto default described there.

**Dependencies (ATS only):**
- Search by title, 20 results, several can be picked.
- Hidden from the picker: tasks that are Complete/Completed/Done/Closed/Cancelled, and tasks already picked.

**Attachments:**
- One file per pick, any number of picks.
- Uploaded **after** create, one request per file, to `POST /tasks/attachments/:newId`.
- A failed upload shows `Failed to upload "<name>"`.

**Description:** Quill (bold, italic, underline, emoji, link, bullet list, image).
- Pasted images are inlined as base64 JPEG (max 1200 px wide).

**Prerequisite:** if the company has no task priorities, the button opens "Pre-requisites Missing" with a link to Task Priority. This is a legacy check.

**On success:**
- The modal closes **immediately**, and a shimmer placeholder row is shown.
- The screen switches to **Created by me**.
- Toast `Task created successfully!`.
- If `planning_hold`, an info toast shows `message`.
- If a critical order is pending, `/reorder-critical` is called with the new id.
- The list is **not** refetched; the `create` socket event replaces the placeholder.

**On failure:**
- The placeholder is removed.
- The message shown is `data` or `Failed to create task.`

### 9.2 Detail / edit (`EditTask.jsx`)

Save Changes:
- Checks `Please select a recurrence period…`.
- Shows a warning if the due date is before a subtask's: `Due date cannot be before subtask "<title>" due date (DD-MM-YYYY)`.
- Success: toast `Task updated`, then the detail **and** the list are refetched. The drawer stays open.
- Failure: `data` or `Update failed`.

Other checks and behaviour:
- Clicking the status of a completed task shows `Completed tasks cannot have their status changed.`
- "Rejected" when `approval_required = 1` and the status is not pending approval → `Tasks can only be rejected when in 'Pending Approval' status`.
- Attachments:
  - Upload: one file → `Attachment uploaded` / `Upload failed`.
  - Remove: no confirmation → `Attachment removed` / `Delete failed`.
- Dependency add errors:
  - When the server message contains "circular": `Circular dependency: this would create a dependency loop`.
  - Otherwise: `data` or `Could not add dependency`.
- There is no "unsaved changes" prompt. Closing discards edits.

### 9.3 List inline checks (`Tasks.jsx`, `LeadPendingField.jsx`, `AssigneField.jsx`, `DateField.jsx`)

**Checkbox complete:**
- Allowed only from In Progress, In-Progress, In Review, In Testing or Pending-Approval. Otherwise: `Please set the task to 'In Progress' before marking it as complete.`
- If the reply contains "approval is required": a warning, and the row shows Pending-Approval.

**Status dropdown:** the same "In Progress first" rule applies, but Pending-Approval is **not** accepted as the starting status here.

**Leaving Complete:**
- Without `can_edit`: `Only the task creator can reopen a completed task.`

**Reject modal:**
- Empty reason: `Please provide a reason for rejection`.
- ATS with no effort: `Please enter the effort to add`.
- Toast: `Task has been rejected` or `Task rejected and moved to <status>`.
- Closing the modal reverts the row.

**Due date:**
- Shown as "D, MMMM" with "Today"/"Tomorrow" labels.
- Allowed range: no past days, no later than the parent's or project's date.
- Before a subtask's date: `Due date cannot be before subtask "<title>" due date (DD-MM-YYYY)`.
- Failure: `Failed to update due date`.

**Project/sprint:**
- A sprint deadline before the task's due date: `Task due date (DD-MM-YYYY) exceeds sprint due date (DD-MM-YYYY). Please update the task due date first.`
- Success: `Project & Sprint assigned` / `Project assigned`.

**Reassign:** no toast and no revert on failure (a website gap — mobile should revert).

### 9.4 Comments (`TaskNotesPopover.jsx`)

- Enter sends; Shift+Enter adds a new line.
- Send is disabled when there is no text and no file.
- Allowed file types: `.png .jpg .jpeg .pdf .docx .csv .txt .zip .rar .sql .ppt .xls .xlsx .svg .webp .avif .doc`.
- Delete confirmation: "Delete Comment / Are you sure you want to delete this comment? / This action cannot be undone." with Cancel / Delete.
- Failure toasts: `Failed to add comment`, `Failed to pin comment`, `Failed to update reaction`, `Failed to delete comment`. Delete success: `Comment deleted`.

### 9.5 Project checks — see §17

---

## 10. Notifications and push

### 10.1 What mobile receives (task notifications are back on)

On 2026-10-07 mobile notifications were made chat-only for the chat-only build. Now that the Task module is back, **the `task` category is visible on mobile again**: `MOBILE_VISIBLE_CATEGORIES = {chat, task}` in `helper/notificationTypes.js`. This goes out with the next backend deploy (§12). Until that deploy, mobile still gets chat only.

From that deploy on:

| What | Mobile gets (with `x-client-platform: mobile`) |
|---|---|
| `GET /notification/all` | chat rows **and task rows** (typ `task`, `tasks_due_today`, `tasks_overdue`). Project, leave, lead, HR, meeting and note rows stay web-only. |
| `GET /notification/readall` | marks the same categories as read |
| Push | Sent through Expo with the `data` shapes in §10.4, for **every event a person causes** (assigned, status change, approve/reject, comment, mention) — also the 2nd, 3rd… event on the same task the same day. System alerts (deadline approaching / delayed, the 09:00 digests, recurring copies) push **once** per row per 24 h. |
| `notification` socket | Task rows now carry `data.mobile_visible: true` |

Pushes are gated per event by the settings `task_assigned`, `task_status_changed`, `task_comment` and `task_mention`, plus `push_enabled`. Rows without an event (e.g. "Updated the task", digests, deadline alerts) only follow `push_enabled`.

The website is not affected: it never sends the header, and push goes only to Expo tokens.

### 10.2 What mobile must do now

- **Remove** your locally made "mentioned you" notification and toast. The server sends `"Mentioned you in a comment"` and `"Mentioned you in a comment update"` itself, so keeping yours would duplicate them.
- **Map the push `data`** (§10.4):
  - `type:"task"` → open the detail for `task_id`.
  - `type:"tasks"` with `filter:"due_today"` → open the Due Today tab.
  - `type:"tasks"` with `filter:"overdue"` → open the Delayed tab.
- **Open digest rows** (`task_id = 0`) on the matching tab, not on a task.
- **Show task rows** in the bell popup and the full Inbox (your task branch already opens `viewTask`).

### 10.3 Task notification rows

**Row fields:**
- Identity and type: `id`, `title`, `typ`, `category`, `identifier` (company slug, may be empty).
- Who: `created_by` (the actor), `assigned_to` (the recipient), `company_id`.
- Links: `task_id` (number), `lead_id` (0), `meeting_id`, `note_id`.
- Text and state: `description` (create and reassign only), `email_subject`, `createdAt`, `readed`.
- `assigned` = **the actor's** user object, despite the name.

Rows are grouped for 24 h: a second event of the same kind for the same task updates the existing row (new title, unread again, moved to the top) instead of adding a new one. The push is still sent for each person-caused event (§10.1). So the inbox can show one row while the phone received several pushes — that is intended.

**There is no per-event `typ`.** Every task notification has `typ: "task"`; use `title` to tell them apart:

| `title` | To | Push setting that gates it |
|---|---|---|
| ` Created a task ` | doer | `task_assigned` |
| ` Created a subtask` | doer | `task_assigned` |
| `assigned a task to you` | new doer | `task_assigned` |
| `updated assignee of the task <title>` | old doer | `task_assigned` |
| `Updated the task` / `Task you created was updated` | doer / creator | none |
| `Task due date updated` | doer | none |
| `has changed the status of a task!` / `has approved and marked your task complete!` | doer | `task_status_changed` |
| `Status changed for task you created!` / `marked the task complete - Approval Required` | creator | `task_status_changed` |
| `approved your task` / `rejected your task` | doer | `task_status_changed` |
| `Added a comment` | doer (or creator) | `task_comment` |
| `Mentioned you in a comment` / `Mentioned you in a comment update` | each person mentioned | `task_mention` |
| ` added an attachment ` | doer (or creator) | none |
| `Task Deleted` / `You deleted a task` | doer / creator | none |
| ` Recurring task auto-generated ` | doer | none |
| `Reminder: Your task is pending approval` (09:00) | doer | none |
| `You have N task(s) due today` (typ `tasks_due_today`, `task_id` 0) | each user | none |
| `You have N overdue task(s)` (typ `tasks_overdue`) | each user | none |
| `Deadline approaching: "<t>" — <dur> remaining` / `Task delayed: "<t>" — <dur> past deadline` | doer | none |

**Opening a notification:** if `task_id > 0` → `POST /tasks/view/:task_id` → open the detail (your current flow is right). The website does the same: it navigates to `/:cid/tasks` with `{TaskId}`, then opens the drawer. If `task_id = 0` (digest rows) → open the Tasks screen on the Due Today / Delayed tab.

### 10.4 Push payload (Expo, `helper/notifications.js:165-176`)

```json
{ "to": "ExponentPushToken[…]", "title": "<title>", "body": "<description | email_subject | title>",
  "sound": "default", "channelId": "planit-notifications", "priority": "high", "badge": 3,
  "data": { "type": "task", "task_id": "1234", "screen": "task_detail" } }
```

| Case | `data` |
|---|---|
| Task event | `{type:"task", task_id:"<id>", screen:"task_detail"}` |
| Due-today digest | `{type:"tasks", filter:"due_today", screen:"tasks"}` |
| Overdue digest | `{type:"tasks", filter:"overdue", screen:"tasks"}` |
| Lead (CRM, not tasks) | `{type:"lead", lead_id:"<id>", screen:"lead_detail"}` |
| Fallback | `{type:"notification", screen:"notifications"}` |
| Chat (live today) | `{type:"chat", room_id:"<id>", screen:"conversation"}` |

All values are strings.

- `type:"tasks"` + `filter` → open the Tasks tab on **Due Today** (`due_today`) or **Delayed** (`overdue`). Your screen currently ignores `filter`; please map it.
- `type:"lead"` → not a task. You have no leads module, so open Notifications or ignore it.

### 10.5 Notification endpoints (no change)

| Endpoint | Notes |
|---|---|
| `GET /notification/all?company_id=&include_read=true` | Unread only, up to 100. With `include_read=true`: read + unread, up to 30. Reply `{Good, data:{notifications:[…]}}`. |
| `GET /notification/readall?company_id=` | Note: it is a **GET**. With the mobile header it marks only the visible categories. |
| `POST /notification/readone/:id` | — |
| `POST /notification/register-device` | `{fcm_token: <Expo token>, platform:"android"\|"ios", device_name?, company_id?}`. Any other `platform` value → 500. |
| `POST /notification/unregister-device` | `{fcm_token}` |
| `POST /notification/update-device-token` | `{old_fcm_token?, new_fcm_token, company_id?, platform?}`. Keeps the old device's platform (or uses `platform` if sent). Fixed 2026-10-30; it used to reset every device to android. |
| `POST /notification/reset-badge` | — |
| `GET /notification/settings` | Reply `{Good, settings:{task_assigned, task_status_changed, task_comment, task_mention, chat_message, chat_mention, channel_invite, push_enabled}}` |
| `POST /notification/settings` | Send the same keys, preferably as JSON booleans. `true`/`1`/`"true"`/`"1"` = on; anything else = off. (Fixed 2026-10-30; the string `"false"` used to be read as on.) |

---

## 11. Attachments, comments, mentions, files

### 11.1 Comments (notes)

**Add — `POST /tasks/addnote/:taskId`** (perm `tasks-list`, multipart):

| FormData key | Value |
|---|---|
| `notes` | Text with mentions written as **`@[Full Name](userId)`** (react-mentions markup). Send `""` when sending only a file. (Since 2026-10-30 a missing `notes` is treated as `""`; before that it skipped the comment socket event and the notifications.) |
| `company_id`, `company_identifier` | as usual |
| `reply_to` | optional JSON string **`{"id": <noteId>, "user_name": "<author>", "content": "<first 100 chars, mentions shown as @Name>"}`**. Your shape is correct. Other keys are dropped. |
| `file` | optional, **one file only** (two `file` parts → 500). Max 30 MB. Allowed: png jpg jpeg pdf doc docx csv txt zip rar sql ppt xls xlsx svg webp avif (not pptx, gif or video). |

- `mentions`: you may keep sending it, but the server **ignores** it — mention ids are read from the `@[Name](id)` markup. Plain `@Full Name` is **not** recognised as a mention.
- **Reply:** `{Good:true, data:"Record has Been Updated"}`. The new note is **not** in the reply. Take it from the `add_note` socket event (`data.note`), or refetch the notes.
- **Notifications:**
  - `"Added a comment"` goes to the doer (unless the doer is the commenter or was mentioned).
  - `"Mentioned you in a comment"` goes to each person mentioned.
  - Emails are sent too.

**List — `POST /tasks/showtasknote/:taskId {company_id}`:**
```json
{ "Good": true, "data": [{ "id": 77, "notes": "Hi @[Sara Khan](12)", "mentions": [12], "user_id": 3,
  "user_name": "Ali Raza", "user_image": "a.png", "pin_top": 0, "is_edited": false,
  "reactions": [{ "user_id": 12, "user_name": "Sara Khan", "emoji": "👍" }],
  "reply_to": { "id": 70, "user_name": "Sara Khan", "content": "…" },
  "attachment_file": "1730269500000-report.pdf", "extension": ".pdf",
  "createdAt": "2026-10-30T07:05:00.000Z", "updatedAt": "…" }] }
```
- The date field here is **`createdAt`**. `/view`'s `task_notes` uses `created_at`. Read both.
- The order is pinned first, then insertion order. The website displays oldest first, with the pinned note repeated (sticky) at the top.
- `is_edited` is never set to true.

**Edit — `POST /tasks/updatenote/:noteId {notes, company_id, company_identifier}`:**
- Needs `tasks-edit` and **author only**: `403 "You can only edit your own notes."`
- No time limit.
- It re-notifies everyone mentioned in the new text.

**Delete — `POST /tasks/deletenote/:noteId {company_id, company_identifier}`:**
- Needs `tasks-edit` and author only: `403 "You can only delete your own notes."`
- Hard delete. The website asks for confirmation first.

**Pin — `POST /tasks/updatenotepin/:noteId {company_id}`:**
- Needs `tasks-edit`.
- **It is a toggle:** the server flips `pin_top`, and any `pin_top` you send is ignored.
- The server allows several pinned notes. The website shows only one: pinning one unpins the others on screen only.
- Mobile: when pinning note B while A is pinned, call pin on **B only** (like the website). Calling it on A as well would flip A on the server.

**React — `POST /tasks/updatenotereaction/:noteId {emoji, company_id, user_id, user_name}`:**
- Needs `tasks-edit`.
- A toggle per (user, emoji); one user can hold several different emojis.
- The reply's top-level `reactions` is the full new list.
- Website emojis: 👍 ❤️ 😂 😮 😢 🔥.

### 11.2 Mention users

`GET /user/note-mentions?company_id=` → `{Good, data:{user:[{id, first_name, last_name, full_name, image}]}}`. These are all active users, including you. Your rules (exclude yourself, at most 6 suggestions) are fine.

### 11.3 Task attachments vs comment attachments

| | Task attachments | Comment attachments |
|---|---|---|
| Upload | `POST /tasks/attachments/:taskId`. FormData `file`, `company_id`, `company_identifier`. Perm `tasks-edit` + creator/doer/head. | `file` on `addnote` |
| Stored in | `attachments` collection, `attachment` = file name | `note.attachment_file` |
| Listed in | `/view` → `task_attachments[]` | the note row, plus `/view` → `task_notes_attachments[]` |
| Delete | `POST /tasks/attachmentdelete/:attachmentId {company_id, company_identifier}` → `{Good, data:"Attachment deleted successfully"}`. The website asks no confirmation. | deleting the note |
| Upload reply | `{Good:true, data:"Record has Been Updated"}` — the new row is not returned. Reload `/view` (or wait for `add_attachment`). | — |

Both kinds of file live in `public/uploads/notes/`.

### 11.4 Downloading files

```
GET {host}/api/v1/secure-file?p=public/uploads/notes/<file name>
Header: x-access-token / authToken   (or &token=<jwt>)
```

- Errors: `400 {message:"Missing file path"}`, `403 {message:"Access denied"}` (the path must start with `public/` and must not contain `..`), `404 {message:"File not found"}`.
- `p` must be URL-encoded.
- Project files: `p=public/uploads/projects/<attachment>`.
- Display name: `original_name` (task attachments), or the stored name with everything up to and including the first `-` removed.
- The website fetches with the auth header, opens images, PDFs and media in a viewer, and downloads everything else.
- Your detail download button has no `onPress` — wire it to this URL.
---

## 12. Backend change log (relevant to mobile)

| Date | Change | What mobile must do |
|---|---|---|
| **2026-10-30** (in the working tree, ships with the next deploy) | `DELETE /tasks/:id`, `POST /tasks/update/:id`, `POST /tasks/statusupdate/:id`, `POST /tasks/attachments/:id` and `POST /tasks/attachmentdelete/:id` now answer **`403 {Good:false, data:"You do not have permission to edit this task."}`** when the caller has no rights on the task. Before, these calls **crashed the backend process** (`res.status(undefined)`). A Company Admin who neither created nor does the task triggered it. | Handle 403 the normal way. Until this ships, **never call these for a task where `can_edit`/`can_edit_status` is false**. |
| 2026-10-22 | Comment mentions are taken from the `@[Name](id)` markup by the server (the `mentions` array is filled automatically). Redis-backed list cache. | The `mentions` field is no longer needed. Handle `stale` (§2.5). |
| 2026-10-20 | Response cache on `/tasks/all`, `/duetoday`, `/filter` and `/projects` (`stale`, `wait_fresh`). | §2.5 |
| 2026-10-19 | `/tasks/all?exclude_complete=true` and `complete_count`. Paging on `/tasks/filter?filter=complete&limit&page` (adds `has_more`, `page`). Subtask/comment counts are now worked out only for the returned tasks. | Use it (§0 #12). |
| 2026-10-19 | AI task generation for projects (`/projects/ai/*`). | Website only. |
| 2026-10-15 | Meetings and Notes modules. Task edits can be stamped on running meetings (`x-meeting-id`). | None |
| 2026-10-13 → 10-14 | Scheduling-engine fixes (recurring queue order, shift-aware times `YYYY-MM-DDTHH:mm`). | Parse both date formats (§2.7). |
| **2026-10-30** (in the working tree, ships with the next deploy) | **Task notifications are visible on mobile again:** `MOBILE_VISIBLE_CATEGORIES = {chat, task}`. Mobile now gets task rows in `GET /notification/all` (with the mobile header) and task push. Person-caused task events push every time, even when the inbox row is grouped (before, only the first event per task per 24 h could push). | §10.2: drop the local mention notifications; map the push `filter`. |
| **2026-10-30** (same deploy) | Mobile-only endpoint fixes: `update-device-token` keeps the device platform (accepts `platform`); `POST /notification/settings` reads `"false"` as off; `addnote` without `notes` works like `notes: ""`. | None (your current calls keep working). |
| 2026-10-07 | **Mobile notifications became chat-only** (list and push), via the `x-client-platform: mobile` header and `MOBILE_VISIBLE_CATEGORIES`. | Undone for tasks on 2026-10-30 (row above). |
| 2026-10-06 | Stale Expo tokens are deleted on `DeviceNotRegistered`. Non-chat push is gated. | None |
| Earlier (already answered in `backend_api_answers.md`, July) | **`effort_hours` is in minutes.** | Still not done in mobile (§0 #1). |

Nothing listed in your §7 / §10 has been removed or renamed. The new endpoints are `GET /tasks/delayed-popup`, `GET /tasks/critical-for-user`, `/sprints/*`, `GET /companies/:id/modules`, `/projects/ai/*`, `/task-scheduling-settings/*`, and the query options `exclude_complete`, `wait_fresh`, `limit`/`page`. There are no planned renames of `asigned_to`, `tasksByme`, `task_assignee`, etc.

---

## 13. Endpoint review table (your 19.2)

"Unchanged" = the path and payload work as your document describes. Each row gives the change mobile needs.

| Mobile function | Current method + path | Backend status | New path | Request changed? | Response changed? | Required mobile change | Notes |
|---|---|---|---|---|---|---|---|
| `getAllTasks` | `GET /tasks/all` | UNCHANGED + option | — | Add `exclude_complete=true`; `skipTasks` is ignored | Adds `complete_count`, `team_member_ids`, `stale` | Use `exclude_complete`; handle `stale` | Due-today tasks and templates are not included |
| `getDueTodayTasks` | `GET /tasks/duetoday` | UNCHANGED | — | no | `stale` | Handle `stale` | PKT day |
| `getFilteredTasks` | `GET /tasks/filter` | UNCHANGED + paging | — | `limit`, `page` for `complete` | `has_more`, `page` | Use for the Recurring, Completed and Pending-Approval tabs | §3.4 |
| `viewTask` | `POST /tasks/view/:taskId` | UNCHANGED | — | no | Your type differs: no `effort_logs`, `actual_completion`, `project_name`, `sprint_name`; `created_by` is an object | Fix the type (§3.6) | |
| `createTask` | `POST /tasks/create` | UNCHANGED path | — | **Yes:** effort in minutes; `due_date` as `YYYY-MM-DD`; critical only in ATS; no `Rejected` status; leave effort out in normal companies | Adds `planning_hold`, `message` | §3.8 | |
| `createSubtask` | `POST /tasks/createsubtask/:parentId` | UNCHANGED | — | no | no | Don't build (subtasks are off on the website) | |
| `updateTask` | `POST /tasks/update/:taskId` | UNCHANGED path | — | **Yes:** send the HTML description; drop `project_id`/`sprint_id`; effort in minutes and ATS only; don't use it for status | key `msg` | §3.10 | Fields you leave out are written as null |
| `updateTaskStatus` | `POST /tasks/updatetaskstatus/:taskId` | UNCHANGED | — | Send `Complete`, `On-Hold`; optional `effort_hours` for resume | Approval message | Use it everywhere for status; revert on `Good:false` | §3.12 |
| `reassignTask` | `POST /tasks/updateasignedto/:taskId` | UNCHANGED | — | no | no | Gate by `can_edit` | creator only |
| `deleteTask` | `DELETE /tasks/:taskId` | UNCHANGED | — | no | no | Don't expose it (website has no UI) | 403 fix §12 |
| `approveTask` | `POST /tasks/approve/:taskId` | UNCHANGED | — | no | no | Add the Approve UI (§7.3) | website uses updatetaskstatus "Complete" |
| `rejectTask` | `POST /tasks/reject/:taskId` | UNCHANGED + `reject_type` | — | ATS: `reject_type` | top-level `status` | Only from Pending-Approval; ATS two-step | |
| `updateTaskDueDate` | `POST /tasks/updatetaskduedate/:taskId` | UNCHANGED | — | key `duedate` | no | Use for the inline due date (normal companies) | creator only |
| `extendDelayedTask` | `POST /tasks/extend-delayed/:taskId` | UNCHANGED | — | no | `{id, start_date, due_date, effort_hours}` | none | the server converts units |
| `updateTaskProject` | `POST /tasks/updatetaskproject/:taskId` | UNCHANGED | — | Add `sprint_id` (optional) | no | Pass `sprint_id` from the sprint picker | Missing `project_id` = removed from the project |
| `updateLeadSource` | `POST /tasks/updateleadsource/:taskId` | NOT FOR TASKS | — | — | — | Remove | legacy CRM |
| `recalculateSchedule` | `POST /tasks/recalculate/:taskId` | UNCHANGED | — | no | `{queued}` or dates | Call in ATS after the actions in §8.9 | |
| `getDependencies` | `GET /tasks/dependencies/:taskId` | UNCHANGED | — | no | row shape in §3.25 | `task_id` in a row = the blocker | |
| `addDependency` | `POST /tasks/dependencies/add` | UNCHANGED | — | no | no | Add the UI in detail (`can_edit`) | cycle check on the server |
| `removeDependency` | `POST /tasks/dependencies/remove` | UNCHANGED | — | no | no | Add the UI | dependency creator or admin only |
| `reorderCritical` | `POST /tasks/reorder-critical` | UNCHANGED | — | no | `blockedTasks` | Make the order modal reachable (ATS) | §8.5 |
| `rescheduleReopened` | `POST /tasks/reschedule-reopened/:taskId` | DEAD on the website | — | — | — | Don't use | use `/reopen` |
| `reopenTask` | `POST /tasks/reopen/:taskId` | UNCHANGED | — | `priority` = `"normal"`/`"critical"`; effort in minutes; booleans | no | Add the ATS reopen UI | creator only |
| `migratePriorities` | `POST /tasks/migrate-priorities` | ADMIN, one-time | — | — | — | Remove | |
| `migrateEffortToMinutes` | `POST /tasks/migrate-effort-to-minutes` | ADMIN, one-time | — | — | — | Remove | |
| `addNote` | `POST /tasks/addnote/:taskId` | UNCHANGED | — | Always send `notes`; one `file`; `mentions` ignored | no note in the reply | Take the new note from the socket event | §11 |
| `getMentionUsers` | `GET /user/note-mentions` | UNCHANGED | — | no | no | none | |
| `getTaskNotes` | `POST /tasks/showtasknote/:taskId` | UNCHANGED | — | no | date key `createdAt` | Read `createdAt` and `created_at` | |
| `updateNote` | `POST /tasks/updatenote/:noteId` | UNCHANGED | — | no | no | Add the edit UI (own notes) | |
| `pinNote` | `POST /tasks/updatenotepin/:noteId` | **TOGGLE** | — | `pin_top` is ignored | no | Call only for the note being pinned/unpinned | |
| `deleteNote` | `POST /tasks/deletenote/:noteId` | UNCHANGED | — | no | no | Own notes only; confirm first | |
| `updateNoteReaction` | `POST /tasks/updatenotereaction/:noteId` | UNCHANGED | — | no | `reactions` at the top level | Add the reaction UI | |
| `uploadAttachment` | `POST /tasks/attachments/:taskId` | UNCHANGED | — | no | no row returned | Upload after create and from detail | |
| `deleteAttachment` | `POST /tasks/attachmentdelete/:attachmentId` | UNCHANGED | — | no | no | Add the UI | |
| `getAllProjects` | `GET /projects` | UNCHANGED | — | no | `stale`; `users` | Fix the status enum | |
| `getAllProjectsForAssignment` | `GET /projects?scope=all` | UNCHANGED + `lite` | — | **Add `lite=true`** | no | Use it for the picker | |
| `getProjectsList` | `GET /projects/list` | UNCHANGED | — | no | top-level `projects` | optional | |
| `createProject` | `POST /projects/create` | UNCHANGED | — | `due_date` required | `data` = the project | Status default `Planning` | |
| `updateProject` | `POST /projects/update/:id` | UNCHANGED | — | no | no | Valid statuses only | Completed blocked while tasks are open |
| `deleteProject` | `DELETE /projects/delete/:id` | UNCHANGED | — | no | no | Don't expose it (no website UI) | creator only |
| `getProjectDetail` | `GET /projects/detail/:id` | UNCHANGED | — | no | **No `sprints`** | Load sprints separately | |
| `uploadProjectAttachment` | `POST /projects/attachments/:projectId` | UNCHANGED | — | no | `data` = the row | optional | |
| `deleteProjectAttachment` | `POST /projects/attachmentdelete/:attachmentId` | UNCHANGED | — | no | no | optional | |
| `getProjectUsers` | `GET /username/project-users` | UNCHANGED | — | no | errors use `error` | none | |
| *(new)* | `GET /tasks/delayed-popup` | NEW | — | — | §3.5 | Use for the delay popup | |
| *(new)* | `GET /tasks/critical-for-user` | NEW | — | — | §3.3 | Optional, for the critical prompt | |
| *(new)* | `GET /sprints`, `POST /sprints/create`, `POST /sprints/update/:id`, `DELETE /sprints/delete/:id` | NEW | — | — | §4.3 | Sprint UI in project detail | |
| *(new)* | `GET /companies/:id/modules` | NEW for mobile | — | — | `{data:{modules}}` | Detecting ATS | replaces `/modules/all` |
| `getModules` | `GET /modules/all` | **FORBIDDEN** for company users | — | — | 403 | Stop calling it | |

---

## 14. Socket review table (your 19.3)

| Event | Current mobile expectation | Backend status | Payload | Scope | Recommended mobile behaviour | Notes |
|---|---|---|---|---|---|---|
| `task_update` | `schedule_update` patch, otherwise refetch | UNCHANGED, with more actions | §5.2 | **Every client of every company**; filter on `Number(company_id)` | Patch `schedule_update` (start + due + effort), `status_update`, `status_change`, `critical_reorder`, `sprint_assigned`, `delete`, the note actions. A debounced refetch for the rest is fine. | ids may be strings |
| `priority_update` | create/update/delete | UNCHANGED | §5.3 | global | as now; compare ids with `Number()` | old priority model |
| `jobstatus_update` | appends a task status | **Not task statuses** | §5.3 | global | **Ignore** | |
| `user_update` | refetch owners | UNCHANGED | `{company_id, action, data}` | global | as now | |
| `project_update` | refetch tasks | UNCHANGED + sprint actions + `due_date_update` | §5.3 | global | Refetch tasks; refetch project screens | Project status changes the tasks inside without task events |
| `task_scheduling_settings_update` | refetch | UNCHANGED | §5.3 | global | Debounced refetch | ATS |
| `notification` | refresh the inbox | UNCHANGED | `{company_id, assigned_to, data:{…, mobile_visible}}` | global | Keep only `assigned_to === me` and `mobile_visible !== false` | Task rows have `mobile_visible:true` from the next deploy |
| `role_update` | refresh permissions | UNCHANGED | `{action:"update_permissions", roleId, permissions}` | global | When the `roleId` matches yours, replace `user_permissions` | |

---

## 15. Permission review table (your 19.4)

| Permission / check | Current mobile behaviour | Backend enforcement | Website behaviour | Required mobile behaviour | Notes |
|---|---|---|---|---|---|
| `is_head` / create task | FAB + create + reassign | Create: `tasks-create`. Reassign: creator. | Create button: (admin or head) **and** `tasks-create` | Create: the website rule. Reassign: `can_edit`. | `is_head` is the string `"yes"`/`"no"` |
| `tasks-list` | not used | only `addnote` | Route guard for Tasks and Projects | Gate the Tasks tab | |
| `can_edit` | detail edit gate (unset = editable) | creator only for full edit | Detail fields, reassign, due date, project chip, edit icon, reopen | **Treat a missing flag as false**; also hide editing once the task is Complete | It is always present in `/view` and lists |
| `can_edit_status` | row status/checkbox | creator/doer/head | Checkbox hidden, status shown as a badge | as now | Admin = false unless a stakeholder |
| `can_edit_subtask` | unused | subtask create | subtasks off | unused | |
| `tasks-edit` | not checked | update, reassign, attachments, project assign, note edit/pin/delete/react | The detail drawer exists only with it | Check it before showing edit controls | |
| `tasks-delete` | — | delete | no UI | no UI | |
| `project-list` | auto-load gate | project read endpoints | Sidebar + task project chip | as now + the task project chip | |
| `project-create` | disabled task assign | project create | Create button; "Create a new project" option | Use it for those two | Not for assigning a task to a project (that is `tasks-edit` + `can_edit` + `project-list`) |
| `project-edit` | unused | project update | edit, or creator/owner | Use it | |
| `project-delete` | unused | delete + creator | no UI | none | |
| one In-Progress rule | client block (assigned-to-me only) | server, only when effort > 0, per doer | no block | Remove the client block; show the 400 message | |
| reject reason/effort | reason required | reason not required by the server; ATS effort required for `requirement_changed` | reason required; ATS effort > 0 | Keep the reason required; add the ATS two-step | units: minutes |
| critical conflict | client popup | none (no limit) | ATS only; prompt + optional order | ATS only | |
| attachment limits | picker extension check | 30 MB, extension list, 1 file per request | same extension list, no size check | Add a 30 MB check | Server rejections come back as 500 HTML |
| note mention rules | client trigger | server parses `@[Name](id)` | react-mentions `@` | as now | |

---

## 16. Complete website **Task** flow inventory

The 17 columns of your §19.5 table are given as one card per flow; a 17-column table does not read on any screen.

**Abbreviations used in the cards:**

| Field | Meaning |
|---|---|
| **Where** | Route / entry point |
| **Who** | Permissions / modules / roles |
| **Steps** | UI and steps |
| **Checks** | Validations |
| **API** | Ordered calls. "opt" = optimistic, "rf" = refetch. |
| **Sock** | Sockets |
| **States** | loading / empty / error |
| **Nav** | Navigation, back, confirmation, toasts |
| **Notif** | Notifications / email produced |
| **Edge** | Edge cases and known issues |
| **Mobile** | Current mobile status → must-have? → guidance |

- The task route is `/:cid/tasks` (`Main.jsx:225`), guarded by `tasks-list` + module `Tasks`.
- Source files: `Planit-Frontend/src/Components/Screens/Tasks/` (`Tasks.jsx`, `CreateTask.jsx`, `EditTask.jsx`, `TaskNotesPopover.jsx`, `InlineSubtaskRow.jsx`) and `Components/Reuseable/` (`LeadPendingField.jsx`, `AssigneField.jsx`, `DateField.jsx`).

#### T-001 Dashboard load
- **Where:** sidebar "Tasks & Projects" → Tasks; or any task link.
- **Who:** `tasks-list` + `Tasks` module.
- **Steps:**
  1. If a session cache exists (`sessionStorage planit_tasks_<company>_<user>`), it is shown at once.
  2. Otherwise: first paint from `/duetoday`, then the full list.
  3. Projects (`/projects?scope=all&lite=true`) and recurring templates (`/tasks/filter?filter=recurring`) load alongside.
- **API:**
  1. `GET /tasks/duetoday` → in parallel `GET /tasks/duetoday` + `GET /tasks/all?exclude_complete=true`, merged by id.
  2. If either reply is `stale`, both are called again with `wait_fresh=1`.
  3. On failure: one retry after 3 s.
- **Sock:** `task_update`, `priority_update`, `jobstatus_update` listeners (T-040).
- **States:**
  - 5 skeleton rows while loading; counts show a skeleton until the full list arrives.
  - Empty: clipboard icon and "No tasks found."
  - Failure: warning "Couldn't load the full task list (the server is slow to respond). Refresh the page to try again."
- **Edge:** the list grows with company size; there is no server paging (except Completed).
- **Mobile:** partial (no `exclude_complete`, no `stale` handling) → **must** → §0 #12, #19.

#### T-002 Stat tabs (chips)
- **Where:** top of the page.
- **Steps:** 9 chips — All Tasks, Due Today *(default)*, Due in 7 days, Delayed, Created by me, Assigned to me, **Pending Approval**, Recurring, Completed. One is active at a time.
- **Checks:**
  - Every tab except Completed and Recurring hides `Complete`.
  - Every tab except Pending Approval, Completed and Recurring hides `Pending-Approval`.
  - Due Today: today (ATS: and `due ≥ now`). When a template and its instance are both due today, only the instance shows.
  - Due in 7 days: after today up to +7.
  - Delayed: before start of today (ATS: before now), status not Complete / Partial Complete / On Hold.
  - Created by me: creator = me.
  - Assigned to me: doer = me.
  - Pending Approval: status Pending-Approval.
  - Recurring: templates.
  - Completed: status Complete, sorted by `completed_at` descending.
  - Counts are zero-padded to 2 digits.
- **Mobile:** partial (8 tabs; no Pending Approval; Recurring always empty; Due Today rule differs in normal companies) → **must**.

#### T-003 Search
- Floating "Search Task" box; 300 ms debounce.
- Case-insensitive **title** match, including subtasks; an X clears it.
- **Mobile:** implemented (searches more fields — fine).

#### T-004 Filters
- **Status:** multi-select of Pending, In Progress, On Hold, Completed ("N Selected" when two or more are chosen).
- **Created By:** multi-select with search, everyone.
- **Assigned To:** multi-select, shown **only to Company Admin or head**.
- **Priority:** Normal / Critical.
- **Date range:** Start → End, on `due_date`, inclusive.
- All filters are client-side. Any filter change resets paging.
- **Mobile:** implemented → hide Assigned To for non-admin/non-head.

#### T-005 Sort and paging
- No sort control. Order: due date ascending → critical first → id. Rows still being created float to the top. Subtasks sit right under their parent.
- Paging: 50 rows, then +30 on scroll (300 ms skeleton).
- **Mobile:** implemented (different sort) → optional to align.

#### T-006 Completed tab
- **Steps:** opening the tab (or choosing the Complete status filter) loads `/tasks/filter?filter=complete&limit=50&page=N`. The next page loads on scroll while `has_more`.
- **Checks:** count shown = max(loaded rows, `complete_count` + changes made this session).
- **Mobile:** partial (loads everything) → **must**.

#### T-007 Recurring tab
- **Steps:** templates from `/tasks/filter?filter=recurring`. Rows show no recurring icon.
- Tapping a template opens its detail, where recurrence is edited (T-034).
- **Mobile:** broken (always empty) → **must**.

#### T-008 Pending Approval tab
- **Steps:** tasks with status Pending-Approval (merged list plus templates). The creator approves with the checkbox (T-017) or rejects (T-019).
- **Mobile:** missing → **must**.

#### T-009 Create task (normal company)
- **Where:** "Create a Task" button; sidebar "+" (window event `openCreateTaskModal`); `location.state.openCreate`.
- **Who:** (Company Admin or head) and `tasks-create`. Prerequisite: at least one company priority exists (T-013).
- **Steps:** modal (850 px) with these fields:
  - Title
  - Description (Quill)
  - Assigned to (default me)
  - Due date (default today)
  - Priority — static "Normal"
  - Status — auto In-Progress or Pending
  - Approval Yes/No
  - Recurring switch + fields
  - Attachments
- **Checks:** §9.1.
- **API:**
  1. Optimistic shimmer row; modal closes; tab switches to **Created by me**.
  2. `POST /tasks/create`.
  3. For each file: `POST /tasks/attachments/:newId`.
  4. No refetch — the `create` socket event replaces the shimmer.
- **States:** a failure removes the shimmer.
- **Nav:** toasts "Task created successfully!" / `res.data || "Failed to create task."`; info toast with `message` when `planning_hold`.
- **Notif:** doer gets " Created a task " + email "New Task Assigned: <title>".
- **Edge:** default "today" is computed in **UTC** on the website (`DataParser.getDateinFormat`), so 00:00–05:00 PKT it shows yesterday — mobile should use the PKT date.
- **Mobile:** partial (formats and units wrong; attachments never uploaded; Rejected status offered; critical offered) → **must**.

#### T-010 Create task (ATS)
- Same as T-009, but: **Effort** (required, Mins/Hrs/Days, sent in minutes) instead of a due date; `due_date: null`; **Dependencies** picker; Normal/Critical (T-011).
- `bump_to_front` is sent only when set.
- `/recalculate` is **not** called after create.
- **Mobile:** partial (units) → **must**.

#### T-011 Critical prompt + "Order Critical Tasks" (ATS)
- **Where:** choosing Critical in create, detail, or the inline add-row.
- **Steps:**
  - If the doer has unfinished critical tasks, the prompt "Set Critical Priority" appears: *"Critical tasks are scheduled before all normal tasks. How should the engine handle the assignee's current task?"*
    - **A:** "Stop current task now & start this critical task immediately" → bump, status In-Progress; the order modal opens if other critical tasks exist.
    - **B:** "Wait for current task to finish, then schedule this critical task" → no bump.
  - Order modal: "Drag to set the execution order. Top = highest priority." Columns #, Task Title, Assigned To/Created By, Due Date; the current task is marked "Being created now" / "Being edited now". Back arrow returns to the prompt; X resets the priority to Normal.
  - "Confirm Order" → `POST /tasks/reorder-critical` with the existing ids (again after save/create with the new id); `bump_to_front` = "the current task is first".
- **Checks:** the conflict check uses tasks already loaded (same doer, critical, not complete, not itself).
- **Nav:** if `blockedTasks` come back, info toast for 6 s (§3.26).
- **Sock:** `critical_reorder`, `status_change`, `schedule_update`.
- **Mobile:** partial (prompt exists; order modal unreachable; not limited to ATS) → **must (ATS)**.

#### T-012 Attachments at create
- **Steps:** after create, each picked file is sent to `POST /tasks/attachments/:id` (FormData `file`, `company_id`, `company_identifier`).
- **Nav:** a failure toasts `Failed to upload "<name>"`.
- **Mobile:** missing (files are picked but never uploaded) → **must**.

#### T-013 Prerequisite check
- With no company priorities, the "Pre-requisites Missing" modal links to `/<company>/priority`.
- **Mobile:** missing → optional (show an error).

#### T-014 Open task detail
- **Where:**
  - Title click or edit icon (shown when `can_edit`).
  - Notification (`state {TaskId, isNotification}`; the drawer retries 8 × 200 ms while it mounts).
  - Email link `?id=<taskId>`, removed from the URL after opening.
- **Who:** the drawer exists only with `tasks-edit`.
- **API:**
  1. `POST /tasks/view/:id` (late replies are ignored).
  2. `GET /tasks/dependencies/:id`.
  3. `GET /user/note-mentions`.
  4. With Meetings + `meetings-list`: `GET /meetings/task-history/:id`.
- **States:** "Not scheduled" when there is no start date. Comments come from `task_notes`.
- **Nav:** X or backdrop closes. A back arrow appears when the detail was opened from a parent task.
- **Mobile:** implemented → keep.

#### T-015 Save details
- **Where:** the detail's "Save Changes" button.
- **Who:** `can_edit` and status not Complete.
- **Steps:** edit title, assignee, approval, due date (normal), priority (Normal/Critical in ATS, or company priority on old tasks), effort (ATS), description, recurrence → Save.
- **API:**
  1. `POST /tasks/update/:id` (full body, §3.10).
  2. ATS: `reorder-critical` if pending, otherwise `/recalculate` when effort, priority, assignee or bump changed.
  3. Refetch the detail **and** the whole list.
- **Nav:** "Task updated" / `Update failed`. No unsaved-changes prompt.
- **Notif:** "Updated the task" (doer), "Task you created was updated" (creator) + emails.
- **Edge:** a recurring template stays editable after completion.
- **Mobile:** partial (saves each field on blur with `/update`; plain-text description; sends project/sprint; uses it for status) → **must** fix the payload. Save-on-blur is fine **if** the full payload is correct.

#### T-016 Inline status change (list)
- **Who:** `can_edit_status`; otherwise a plain colored badge.
- **Steps:** dropdown of server statuses (minus Pending-Approval; + Partial Complete with subtasks).
- **Checks, in order:**
  1. To Complete/Partial Complete without being In Progress → "Please set the task to 'In Progress' before marking it as complete." (reverts).
  2. Leaving Complete without `can_edit` → "Only the task creator can reopen a completed task."
  3. "Rejected" → T-019.
  4. ATS, from Pending-Approval to In Progress/Pending → T-020.
- **API:** opt → `POST /tasks/updatetaskstatus/:id` → "approval is required" → warning + Pending-Approval; else toast `data`. ATS: `/recalculate` after complete/cancel/leaving hold/leaving Partial.
- **Nav:** errors revert the row.
- **Sock:** `status_update`, plus a possible auto-start of another task.
- **Notif:** status-change notifications.
- **Mobile:** partial (no revert; no approval handling; "In Progress first" rule missing) → **must**.

#### T-017 Complete checkbox (also approves)
- **Who:** `can_edit_status`; the checkbox is hidden otherwise.
- **Steps:** tick → `POST /tasks/updatetaskstatus {status:"Complete"}`.
- **Checks:** allowed from In Progress, In Review, In Testing or **Pending-Approval**. When the creator ticks a Pending-Approval task, that approves it.
- **API:**
  - Approval reply → warning + row becomes Pending-Approval.
  - Success → toast `data`; ATS → `/recalculate` with `completed_at`.
- **Edge:** the website checkbox never un-completes a task. Mobile's checkbox currently toggles Completed ↔ Pending; match the website instead (one-way, reopen is a separate creator-only action).
- **Mobile:** partial → **must**.

#### T-018 Approve (pending approval)
- **Who:** creator (website). The server also allows a Company Admin through `/approve`.
- **Steps:** website = T-017 on a Pending-Approval row. No dedicated button.
- **Notif:** the doer gets the status-change notification ("has approved and marked your task complete!" when the creator completes it).
- **Mobile:** missing → **must** (a clear "Approve" action is fine).

#### T-019 Reject
- **Who:** `can_edit_status` can open it (list). The server allows only the creator/admin, and only on Pending-Approval.
- **Steps:**
  - Modal "Reject Task", textarea "Reason for rejection" (required).
  - Normal company: one "Confirm Reject" button.
  - ATS: "Requirement Changed" → effort step (Mins/Hrs/Days; "Back", "Confirm Reject") → `reject_type:"requirement_changed"`. Or "Task Not Completed" → `reject_type:"not_completed"`, `additional_hours: 0`.
- **API:** `POST /tasks/reject/:id`. ATS → `/recalculate` with `completed_at`.
- **Nav:** toast "Task has been rejected" or "Task rejected and moved to <status>". Closing reverts.
- **Notif:** "rejected your task" + email "Task Rejected" (reason, estimates).
- **Mobile:** partial (any status; no ATS step) → **must**.

#### T-020 Resume from Pending Approval (ATS)
- **Steps:** modal "Resume Task" — *"This task was pending approval. Optionally update the estimated effort to reschedule it."* — optional effort → "Confirm".
- **API:** `POST /tasks/updatetaskstatus {status, effort_hours?(minutes)}`.
- **Nav:** toast `data` or "Status updated successfully".
- **Mobile:** missing → optional.

#### T-021 Reopen a completed task
- **Who:** creator (`can_edit`).
- **Steps:**
  - List: choose another status on a Complete row → plain `updatetaskstatus`.
  - ATS (website, inside project detail): modal "Reopen Task" — *"Set a new priority and scheduling hours to reactivate this task. The original logged hours are preserved."* — Priority Normal/Critical, effort → `POST /tasks/reopen/:id`. Toast "Task reopened successfully".
- **Checks:** "Please enter an effort value greater than 0".
- **Edge:** the detail view blocks status changes on Complete tasks ("Completed tasks cannot have their status changed."), so reopening is list-only.
- **Mobile:** missing → **must** (creator only; normal → status change; ATS → `/reopen`).

#### T-022 Inline reassign
- **Who:** `can_edit`; otherwise avatar + name, or "Unassigned".
- **Steps:** searchable select over `task_owner`, current doer first.
- **API:** opt `asigned_to` → `POST /tasks/updateasignedto/:id {asigned_to, assignee, company_id, company_identifier}` → ATS `/recalculate`.
- **Edge:** the website shows no toast and does not revert on failure; mobile should revert.
- **Notif:** old and new doer.
- **Mobile:** implemented, wrong gate → **must** fix the gate.

#### T-023 Inline due date (normal companies)
- **Who:** `can_edit && !ATS`, status not On Hold (On Hold shows "—").
- **Steps:** date picker; label "Today"/"Tomorrow".
- **Checks:** no past days; not after the parent or project date; not before the latest subtask (message in §9.3).
- **API:** `POST /tasks/updatetaskduedate/:id {duedate:"YYYY-MM-DD"}`. The row updates only after success.
- **ATS:** read-only, showing "h:mm A" times. A ⚠ appears when a subtask is due after the parent: *Subtask "<t>" is scheduled D MMM — after this task's due date*.
- **Mobile:** partial (edited only in detail, via `/update`) → optional (detail editing is enough if the format is right).

#### T-024 Assign to project / sprint (task row)
- **Who:** `can_edit` + `project-list`.
- **Steps:**
  1. Tap the project chip or "+ Add to project" → "Project Name" select (all projects, + "Create a new project" with `project-create`).
  2. Pick a project → `GET /sprints?company_id=&project_id=` (sprints not Completed) → "Loading…".
  3. No active sprints → assign straight away. Otherwise a "Select Sprint" picker (No Sprint + sprints with a "DD MMM" badge).
- **Checks:** sprint due date before the task due date → error (§9.3).
- **API:** `POST /tasks/updatetaskproject/:id {project_id, sprint_id|null}` → patch `project_id`, `project_name`, `sprint_id`, `sprint_name` locally.
- **Edge:**
  - Blurring the picker cancels.
  - A task cannot be **removed** from a project in this UI.
  - The cell shows only the project name.
  - A Planning project puts the task On-Hold (server).
- **Sock:** `sprint_assigned`, `status_update`, `project_update`.
- **Mobile:** disabled → **must** when the project features turn on.

#### T-025 Create a project from the task row
- **Steps:** "Create a new project" → the Create Project modal (P-003) → when it closes, the task is assigned (no sprint).
- **Mobile:** missing → optional.

#### T-026 Comments — view
- **Where:** comment icon + count (hidden when 0) → popover (400 px); or the detail "Comments" panel.
- **API:** `POST /tasks/showtasknote/:id` (popover) or `task_notes` from `/view` (detail).
- **States:**
  - "No comments yet"; scrolls to the bottom; pinned note sticky at the top.
  - Date format "DD, MMMM, YYYY | hh:mm A".
  - Avatar = `user_image`, otherwise initials.
  - Mentions shown as "@Name" pills; links auto-detected; lines starting with "- * • +" become bullets.
- **Mobile:** implemented → keep.

#### T-027 Add comment
- **Steps:**
  - Text with `@` mentions; Enter sends.
  - "+" picks files (several allowed).
  - Drag & drop ("Drop files to attach").
  - Pasting an image creates `pasted-image-<ts>.<ext>`.
  - Emoji picker.
  - Reply banner "Replying to <name>" with X.
- **API:** optimistic note (files show "(uploading...)") → `POST /tasks/addnote/:id` (the website repeats `file` per file — the server takes only one, see §11.1) → the `add_note` socket event replaces the optimistic note.
- **Nav:** failure → revert + "Failed to add comment".
- **Notif:** "Added a comment"; "Mentioned you in a comment" + emails.
- **Mobile:** implemented (no files, no reply) → **must** add reply; files optional.

#### T-028 Edit comment
- Own notes only; inline editor; Enter or "Save"; "Cancel".
- **API:** `POST /tasks/updatenote/:id {notes, company_id}`.
- No "edited" label is shown.
- **Mobile:** missing → optional.

#### T-029 Delete comment
- Own notes only → confirm dialog (§9.4) → `POST /tasks/deletenote/:id`.
- **Nav:** "Comment deleted".
- **Mobile:** implemented without confirmation → **must** add the confirmation and the own-notes gate.

#### T-030 Pin comment
- Anyone → `POST /tasks/updatenotepin/:id`. Pinning one unpins the others on screen.
- **Nav:** failure "Failed to pin comment".
- **Mobile:** implemented → call only for the tapped note (§11.1).

#### T-031 React to comment
- 👍 quick button + picker (👍 ❤️ 😂 😮 😢 🔥); toggle; optimistic.
- **API:** `POST /tasks/updatenotereaction/:id` → replace the list with `reactions`.
- Shown as emoji + count chips.
- **Mobile:** display only → optional.

#### T-032 Task attachments (detail)
- **Who:** `can_edit` and not Complete.
- **Steps:**
  - Paperclip "Attachments" → one file → temporary chip.
  - X removes it (no confirmation).
  - 3 chips are shown, then "+ N more" / "Show Less".
  - Tapping opens the file through secure-file.
- **API:** `POST /tasks/attachments/:id`; `POST /tasks/attachmentdelete/:fileId`.
- **Nav:** "Attachment uploaded" / "Upload failed" / "Attachment removed" / "Delete failed".
- **Mobile:** display only, download broken → **must** (open/download); upload/delete optional.

#### T-033 Dependencies (detail)
- **Who:** `can_edit`.
- **Steps:**
  - Picker "Search tasks..." shows up to 20, excluding: itself, its own subtasks, tasks already added, complete/cancelled, On Hold.
  - The table shows Title, Created By, Assigned To, Due Date, Status, X ("Remove dependency", no confirmation).
  - "Add New Task" (admin/head) opens create; the new task is added as a dependency automatically when its socket event arrives.
- **API:** `POST /tasks/dependencies/add` (opt) → `/recalculate`; `POST /tasks/dependencies/remove` → `/recalculate`.
- **Checks:** "Circular dependency: this would create a dependency loop".
- **Mobile:** read-only table → optional (must for ATS parity).

#### T-034 Recurring settings
- **Where:** detail → "Enable Recurring" switch.
- **Fields:**
  - Recurrence Period: Daily / Weekly / Monthly / Annually.
  - Daily: Exclude Days (Mon–Sun). Weekly: Day of Week. Monthly: Date of Month. Annually: "Date & Month".
  - Run Time (HH:mm). No. of Recurrences.
- **API:** saved with T-015. Refreshes the Recurring tab.
- **Shown as:** "No", or e.g. "Weekly, Monday, 09:00 AM".
- **Mobile:** create only → optional (edit).

#### T-035 Effort logs (ATS)
- **Steps:** detail → "N changes" → modal "Effort Logs".
- Each row comes from `effort_history`: "before ± delta = after".
- Labels: Created, Approval Resume, Pending Approval → Rejected, Complete → In Progress (reopen), Delay Extension, Updated.
- **Mobile:** modal exists → fix the data source (`effort_history`).

#### T-036 Delayed-task popup + extend
- **Who:** server-decided (creator of an in-progress, overdue task). Not limited to ATS.
- **Steps:**
  1. `GET /tasks/delayed-popup` 800 ms after the list changes; re-check at `next_check_at`.
  2. Show the first task that hasn't been dismissed this session.
  3. Modal "Task Delayed": *"You assigned **<title>** to **<name>** and it is now delayed. Do you want to increase the effort? If yes, please input the effort below, otherwise close."* The title is a link that opens the detail.
  4. Unit Mins/Hrs/Days (default Hrs); "Effort *"; "Cancel" / "Extend Task".
- **API:** `POST /tasks/extend-delayed/:id {additional_effort, unit}` → full reload.
- **Nav:** "Task schedule extended successfully" / "Failed to extend task schedule". Cancel, X or backdrop dismisses that task for the session.
- **Mobile:** partial (computed on the device, once per session) → **must** switch to the endpoint.

#### T-037 "Discussed in meetings" (detail)
- **Who:** Meetings module + `meetings-list`.
- Shows meeting history for the task.
- **Mobile:** n/a (no Meetings module) → no.

#### T-038 Notification → task
- **Where:** bell dropdown, Notifications page, meeting detail.
- **Steps:** `typ === "task"` → `/tasks` with `{TaskId}` → opens the detail.
- **Mobile:** implemented, but gets no task notifications today (§10) → **must** keep.

#### T-039 Email link `?id=`
- Opens the detail, then removes `id` from the URL.
- **Mobile:** n/a (you have push deep links instead).

#### T-040 Realtime
- **Sock:** §5.2 — inserts on create (by visibility), removes on delete, batches `schedule_update` (350 ms; holds patches for rows not yet loaded for 5 s), patches `critical_reorder`, `status_change` and `sprint_assigned`, applies note events to the open popover, and for other actions re-reads the row via `/view` and moves it between buckets.
- **Mobile:** partial → **must** (§0 #17).

#### T-041 Sidebar shortcuts
- **Where:** sidebar Tasks section: Due Today, Due in 7 days, Delayed, Created by me, Assigned to me, Pending Approval (navigate with that tab); "+" Add task (admin/head); "View all tasks".
- **Mobile:** n/a (tab UI) → no.

#### T-042 Priority migration (silent)
- `POST /tasks/migrate-priorities` once per browser.
- **Mobile:** **don't**.

#### T-043 Delete task
- No website UI (only MeetingNotes calls `DELETE /tasks/:id`).
- The socket `delete` event removes the row.
- **Mobile:** coded, not wired → keep it unwired.

#### T-044 Subtasks
- **Turned off** on the website (`SUBTASK_DISABLED`; the detail section is wrapped in `false &&`). Existing subtasks show as normal rows placed under their parent.
- **Mobile:** none → no.

#### T-045 Task Scheduling Settings (admin, ATS)
- **Where:** route `/:cid/task-scheduling-settings` (`taskschedulingsettings-list` + ATS).
- **Settings:**
  - "Notification Lead Time (%)": 1–99 → "Please enter a percentage between 1 and 99".
  - "Reschedule for Meetings": On/Off, shown only with the Meetings module.
- **API:** `GET /task-scheduling-settings/all?company_id=`; `POST /task-scheduling-settings/create`; `POST /task-scheduling-settings/update/:id`.
- **Mobile:** no.

#### T-046 Make a task from notes / meetings
- The Notes and Meetings modules open Create Task pre-filled (`initialTitle`, `initialAssignee`).
- **Mobile:** no.

---

## 17. Complete website **Project-in-Task** flow inventory

- Route: `/:cid/projects` (`Main.jsx:226`), guarded by `tasks-list` + module `Tasks`. The sidebar section needs `project-list`.
- Files: `src/Components/Screens/Projects/` (`Projects.jsx`, `CreateProject.jsx`, `EditProject.jsx`, `AiTaskReviewModal.jsx`), `Services/ProjectServices.js`, `Services/SprintServices.js`, `Tasks/InlineSubtaskRow.jsx`.

#### P-001 Projects list
- **API:**
  - `GET /projects?company_id=` → `data.projects`.
  - `GET /username/project-users` (owners).
  - `GET /tasks/all?skipTasks=true` (statuses and priorities only).
- **Steps:**
  - Status chips with counts: All Projects, Planning, In Progress, On Hold, Completed, Abandoned.
  - Search by name.
  - Owner multi-select. (The date range filter is **not wired**.)
  - Columns: Project Title (+"N" badge, tooltip "N Tasks linked"), Created By, Status, Owner, Due Date.
  - No paging or sort.
- **Sock:** `project_update` → refetch.
- **Mobile:** disabled → **must** (when activating).

#### P-002 Inline project edits (list row)
- **Who:** `project-edit`, or creator, or owner.
- **Edits:**
  - Status (Completed requires In Progress first — same wording as tasks).
  - Owner.
  - Due date.
- **API:** each change sends `POST /projects/update/:id` with that single field.
- **Mobile:** missing → optional.

#### P-003 Create project
- **Who:** `project-create` (the sidebar "+" doesn't check it — a website gap).
- **Fields:** Project Name*, Description (Quill), Assign Owner (5 results), Status (Planning default / In Progress / On Hold / Completed / Abandoned), Due Date* (default now), Attachments (several).
- **Checks:** "Project name is required"; "Due date is required for a project".
- **API:** `POST /projects/create {name, owner|null, status, description, company_id, due_date ISO}` → for each file `POST /projects/attachments/:newId {file}`.
- **Nav:** toast "Project created successfully!"; errors `data` / "An error occurred".
- **Notif:** the owner (if not the creator) gets "Created a Project" + email.
- **Mobile:** coded (disabled) → **must**.

#### P-004 AI tasks from a project document (website only)
- **Steps:**
  1. In Create Project, after attaching a PDF/DOCX/TXT, turn on "Generate tasks with AI" and choose the detail level ("High-level tasks" / "Low-level tasks").
  2. After create: questions (`POST /projects/ai/questions/:id {attachment_id}`), one at a time.
  3. Stream (`POST /projects/ai/analyze/:id`, NDJSON).
  4. Review screen (keep, title, assignee, description, status, approval, effort or due date).
  5. "Create N Tasks" → `POST /projects/ai/create-tasks/:id {tasks:[…effort_value, effort_unit…]}` → `{created, failed[], planning_hold, project_due_moved_to}`.
- **Mobile:** no (not recommended now).

#### P-005 Project detail (Edit Project)
- **Where:** row tap, or the sidebar link (opens without a permission check).
- **API:** `GET /projects/detail/:id` + `GET /sprints?company_id=&project_id=`.
- **Steps:** Name, Owner (5 results), Created By (read-only), Status, Due Date (editable only without ATS; can't be earlier than any sprint or task), Description, Attachments, Sprints, Project Tasks.
- **Save Changes:** `POST /projects/update/:id {name, owner, status, description, due_date ISO}` → upload new files.
- **Checks:**
  - "Project name is required"
  - "Due date is required for a project"
  - `Project due date cannot be before sprint "X" due date (…). Update or remove that sprint first.`
  - The same check against tasks.
- **Nav:** "Project updated successfully!" then closes.
- **Sock:** `task_update` with a matching `project_id` → refetch tasks; `project_update/due_date_update` → patch the due date.
- **Mobile:** coded (disabled; expects `sprints` in detail) → **must**.

#### P-006 Sprints
- **Create** (inline "Create Sprint"/"Add Sprint"; Enter or click outside saves):
  - `POST /sprints/create {name, due_date ISO, project_id, company_id, created_by}`.
  - Checks: "Please enter sprint name and due date"; `Sprint date cannot be later than project due date (…)`.
  - Toast "Sprint created!".
- **Change date:** `POST /sprints/update/:id {due_date}` (not before its tasks).
- **Delete:** confirm "Delete Sprint — Are you sure? Tasks in this sprint will be moved to the general project pool." → `DELETE /sprints/delete/:id` → "Sprint deleted".
- **No rename.**
- **Who:** the server allows the project owner or creator to create.
- **Mobile:** placeholder → **must** (at least list + create).

#### P-007 Project tasks table
- **Columns:** Title, Created By, Assigned to, Due Date, Sprint, Status.
- **Sort:** incomplete first → critical → due date; completed ones by `completed_at` descending.
- **Controls** (no per-task permission check inside this screen — the server still enforces):
  - **Checkbox:** Complete ↔ Pending, without the "In Progress first" rule; `updatetaskstatus`; ATS `/recalculate`.
  - **Title / edit icon:** opens the task detail on top.
  - **Assignee:** `updateasignedto` → `/recalculate`.
  - **Due date:** normal companies `updatetaskduedate` (max = sprint or project date); ATS read-only.
  - **Sprint:** dropdown → `updatetaskproject {project_id, sprint_id|null}`, with an option "Remove sprint".
  - **Status:** like T-016, including the reject and reopen (`/reopen`, ATS) modals.
- **Mobile:** coded (status + reassign only; reassign not gated) → **must**: use the same row flags as T-016/T-022 (do not copy the website's missing gates) + sprint column.

#### P-008 Add a task inside a project
- **Who:** Company Admin or head.
- **Steps:** "Click to add the task" → title, priority (Critical only with ATS), assignee (default me), effort (ATS) or due date, optional sprint → Enter or click outside saves; Escape cancels.
- **Checks:**
  - "Please select a priority"
  - "Effort hours is required"
  - `Task due date cannot exceed sprint due date (…)`
  - for subtasks, the parent effort cap
- **API:**
  1. `GET /tasks/critical-for-user` on mount.
  2. `POST /tasks/create {…, project_id}`.
  3. If a sprint was chosen, `updatetaskproject`.
  4. `reorder-critical` or `/recalculate` (ATS).
- **Nav:** "Task created!".
- **Mobile:** missing → optional (normal create with `project_id` + sprint covers it).

#### P-009 Project attachments
- **Open:** `secure-file?p=public/uploads/projects/<file>`.
- **Delete:** confirm "Remove File — This will permanently delete this attachment." → `POST /projects/attachmentdelete/:id` → "File removed".
- Display name = the stored name with the prefix up to the first "-" removed.
- **Mobile:** placeholder → optional.

#### P-010 Delete project
- Code exists ("Delete Project — Are you sure you want to delete this project? Associated tasks will be decoupled."), but it is **never shown**.
- The server allows the creator only.
- **Mobile:** coded → don't expose.

#### P-011 Assign a task to a project / sprint
- = T-024.

#### P-012 Project realtime
- `project_update` (all actions) → refetch the list or detail. `task_update` for that project's tasks → refetch the detail's tasks.
- **Mobile:** partial → **must**.

#### P-013 Project chat rooms
- §4.5. **Mobile:** n/a for tasks.

---

## 18. Parity matrix and flow-by-flow mobile guideline (Q142, 19.1 item 17)

**Mobile status** = what your document says the app does today. **Must** = needed for parity with the website.

| Flow | Website status | Mobile status | Gap | Must? | Mobile guideline |
|---|---|---|---|---|---|
| T-001 Load | live | partial | `exclude_complete`, `stale` | yes | Phase 1: `/duetoday`. Phase 2: `/duetoday` + `/all?exclude_complete=true`, merged by `id`. If `stale`, re-call with `wait_fresh=1`. Keep your in-flight dedupe. |
| T-002 Tabs | live | partial | Pending Approval tab missing; Recurring empty; normal-company Due Today rule differs | yes | Add the `pending_approval` tab. Recurring comes from `filter=recurring`. Use the rules in §16 T-002. Hide Complete and Pending-Approval from other tabs. |
| T-003 Search | live | done | — | — | keep |
| T-004 Filters | live | done | Assigned To shown to everyone | yes | Assigned To only for admin/head |
| T-005 Sort / paging | live | done (different sort) | — | no | optional |
| T-006 Completed | live | partial | loads everything | yes | `filter=complete&limit=50&page=N`; re-sort each page by `completed_at` desc; badge = `complete_count` |
| T-007 Recurring | live | broken | — | yes | `filter=recurring` |
| T-008 Pending Approval | live | missing | — | yes | Tab + Approve/Reject for the creator |
| T-009/T-010 Create | live | partial | units, date format, critical in normal companies, attachments, Rejected status | yes | §3.8. Upload files after create. Switch to Created-by-me. Rely on the `create` socket event. |
| T-011 Critical prompt / order | live (ATS) | partial | order modal unreachable; not ATS-only | yes (ATS) | §8.5. Make `OrderCriticalTasksModal` reachable after "Stop & start now" when other critical tasks exist. |
| T-012 Create attachments | live | missing | never uploaded | yes | `POST /tasks/attachments/:newId`, one file per call |
| T-013 Prerequisite | live | missing | — | no | — |
| T-014 Open detail | live | done | — | — | keep. Gate editing by `tasks-edit` + `can_edit`. |
| T-015 Save details | live | partial | payload | yes | §3.10. Full payload, HTML description, no project/sprint, ATS-only effort. |
| T-016 Status change | live | partial | rollback, approval reply, "In Progress first", `On-Hold` spelling | yes | Always `/updatetaskstatus`. Optimistic, then revert on `Good:false`. |
| T-017 Checkbox complete | live | partial | toggles back to Pending | yes | One-way Complete. Allowed from In-Progress / In Review / In Testing / Pending-Approval. |
| T-018 Approve | live (via checkbox) | missing | — | yes | Creator: "Approve" → `updatetaskstatus Complete` (or `/approve`) |
| T-019 Reject | live | partial | any status; no ATS step | yes | Only on Pending-Approval for the creator/admin. ATS two-step. |
| T-020 Resume (ATS) | live | missing | — | optional | `updatetaskstatus` + optional `effort_hours` |
| T-021 Reopen | live | missing | — | yes | Creator. Normal: status change. ATS: `/reopen`. |
| T-022 Reassign | live | partial (wrong gate) | — | yes | `can_edit`; revert on failure |
| T-023 Inline due date | live | partial | — | optional | normal companies only; `/updatetaskduedate` |
| T-024 Project / sprint assign | live | disabled | — | yes (with projects) | picker `scope=all&lite=true` → sprints → `updatetaskproject` |
| T-025 Create project from row | live | missing | — | optional | — |
| T-026 Comments view | live | done | — | — | keep |
| T-027 Add comment | live | partial | reply, files | yes (reply) / optional (files) | §11.1 |
| T-028 Edit comment | live | missing | — | optional | own + `tasks-edit` |
| T-029 Delete comment | live | partial | confirmation, own-only | yes | confirm dialog |
| T-030 Pin | live | done | toggle semantics | yes | call only for the tapped note |
| T-031 React | live | display only | — | optional | — |
| T-032 Task attachments | live | partial (download broken) | — | yes (open) / optional (upload/delete) | secure-file URL |
| T-033 Dependencies | live | read-only | — | optional (ATS: yes) | §3.25 |
| T-034 Recurring edit | live | missing (create only) | — | optional | §8.10 |
| T-035 Effort logs | live (ATS) | partial | data source | yes (ATS) | `effort_history` |
| T-036 Delay popup | live | partial | done on the device | yes | `/delayed-popup` |
| T-038 Notification → task | live | done (no task data until the next deploy) | — | yes | §10.2 |
| T-040 Realtime | live | partial | — | yes | §5.2 |
| T-043 Delete | no UI | not wired | — | no | keep it off |
| T-044 Subtasks | turned off | none | — | no | rows only |
| T-037, T-039, T-041, T-042, T-045, T-046 | live | n/a | — | no | not for mobile |
| P-001 Project list | live | disabled | enum | yes | §4 |
| P-002 Inline project edits | live | missing | — | optional | — |
| P-003 Create project | live | disabled | enum | yes | `due_date` required; default status `Planning` |
| P-004 AI tasks | live | missing | — | no | — |
| P-005 Project detail | live | disabled | sprints not in detail | yes | add `GET /sprints` |
| P-006 Sprints | live | placeholder | — | yes (list + create) | §4.3 |
| P-007 Project tasks table | live | disabled | sprint column; gates | yes | reuse the task row flags |
| P-008 Add task in project | live | missing | — | optional | create with `project_id` |
| P-009 Project attachments | live | placeholder | — | optional | — |
| P-010 Delete project | hidden | coded | — | no | — |
| P-012 Project realtime | live | partial | — | yes | refetch on `project_update` |

**What every flow needs (the 19.6 fields):**
- Preconditions, steps, API order, checks and messages are in the §16/§17 cards.
- **State:** update optimistically, then reconcile with the socket event (`create` / `status_update` / `schedule_update` / `sprint_assigned`). Revert on `Good:false`.
- **Errors:** show the server message for 400/403. Show a generic message for 500 or non-JSON replies.
- **Navigation:** create closes immediately. Detail stays open after save. Every destructive comment or attachment action needs a confirmation — the website confirms deleting comments and project attachments, but not task attachments or dependencies; mobile should confirm all of them.

---

## 19. Answers by question number

### A. Endpoints

**Q1.** Yes — same shape. Also adds `team_member_ids`, `complete_count` (only with `exclude_complete=true`) and sometimes `stale`. Tasks due today and recurring templates are not in it. See §3.1.

**Q2.** `skipTasks` is not read by the backend; it only changes the cache key. The website sends it when it only needs the statuses, priorities and owners. You still receive every task.

**Q3.** Yes. "Due today" = due date is today in PKT, at any time of day, any status (overdue-earlier-today and completed included). Earlier days are never included. See §3.2.

**Q4.** Yes, `GET`. Values and shape are in §3.4. Use it for Recurring, Completed (paged) and optionally Pending Approval. Keep client-side filtering for the other tabs (the website does the same).

**Q5.** Yes, `{company_id}`. Reply `data.task` — exact fields in §3.6. Effort logs are `effort_history`.

**Q6.** The server never refuses a call for a missing `company_identifier`; it only uses it to build notification/email links. Send it on every write. `company_id` is required in practice by: list endpoints, `dependencies/*`, `delayed-popup`, `critical-for-user`, `update`, `updatetaskduedate`.

**Q7.** Nothing was renamed or moved. Don't use these legacy endpoints: `/tasks/statusupdate/:id`, `GET /tasks/:id`, `/tasks/updateleadsource/:id`, `/tasks/reschedule-reopened/:id` (no live trigger), and the two `migrate-*` calls.

**Q8.** Yes, these are needed: `GET /tasks/delayed-popup`, `GET /sprints?project_id=`, `POST /sprints/create`, and `GET /companies/:id/modules`. Optional: `GET /tasks/critical-for-user`.

**Q9.** Besides the above, the website also uses:
- `GET /tasks/critical-for-user`
- `/sprints/update/:id` and `DELETE /sprints/delete/:id`
- `/projects/ai/*`
- `/task-scheduling-settings/*`
- `GET /meetings/task-history/:taskId`
- `GET /username/departmentuser` (create-form fallback)

### B. Create

**Q10.** See §3.8. The server validates nothing. The website requires: title, `assign_to`, status, and either `due_date` (normal company) or `effort_hours > 0` (ATS).

**Q11.** Both `null` and omitted are accepted. The website sends `project_id: 0` and `sprint_id: null` when there is no project/sprint. Either is fine.

**Q12.** `parent_id` is ignored on create; the task is always top-level. Subtasks: `POST /tasks/createsubtask/:parentId`. The website has subtasks switched off, so don't build them.

**Q13.** The backend accepts any string. The website create offers `Pending`, `In-Progress`, `On-Hold`, `Complete` — use only those. Never send `Recurring` (recurring templates are marked by `is_recurring: true`; the status `Recurring` is old data), `Rejected` or `Pending-Approval`.

**Q14.** Required for normal companies (website rule). Format `"YYYY-MM-DD"`, a PKT calendar day. Do not send ISO-UTC.

**Q15.** Send `due_date: null` and `effort_hours` in minutes. The engine computes `start_date`/`due_date` after the reply. The final dates arrive in `schedule_update` events.

**Q16.** Yes, they are independent. Send `task_priority` (normal/critical). `priority` (company priority) is the old model, and the website create does not send it.

**Q17.** See §8.5. Send `true` only when the user picks "Stop current task now & start this critical task immediately" (ATS, critical). Without a conflict, the website sets it to `true` automatically for a critical task.

**Q18.**

| Period | Required fields |
|---|---|
| daily | `recurring_exclude_days` (optional) |
| weekly | `recurring_week_day` (website doesn't require it; you should) |
| monthly | `recurring_month_date` |
| annually | `recurring_annual_month` + `recurring_annual_date` |
| quarterly / semiannually | none |

Every period also uses `recurring_time` (HH:mm) and `recurring_total_count`. The website only checks that a period is chosen.

**Q19.** `"HH:mm"` 24-hour, PKT. An instance is created at or after this time, and only inside the doer's shift.

**Q20.** 0 = no limit.

**Q21.** The backend supports them, spelled `quarterly` and `semiannually`. The website doesn't offer them. Don't add them now.

**Q22.** At create, `depends_on` is not validated at all. The website ATS picker excludes complete/cancelled tasks. Cycles can't happen for a brand-new task. `/dependencies/add` does validate (§3.25).

**Q23.** Upload after creation: `POST /tasks/attachments/:newId`, one file per request, FormData `file` + `company_id` + `company_identifier`. `/tasks/create` takes no files.

**Q24.** No. There is no idempotency key — make the create button single-shot.

### C. Update and status

**Q25.** It is a full replace **for most fields**. Leaving out `title`, `status`, `priority`, `approval_required`, `description`, `is_recurring`, `assign_to` or the recurring fields writes `null`. `due_date`, `project_id`, `sprint_id` and `effort_hours` are left alone when omitted. See §3.10.

**Q26.** Send the set in §3.10. `priority` is the numeric company priority id (send back what `/view` gave you).

**Q27.** Yes, the backend reschedules after effort, assignee, priority, due date or status changes, and sends `schedule_update` events. The website additionally calls `/recalculate` (§8.9).

**Q28.** `POST /tasks/updatetaskstatus/:taskId` for every status change (list and detail). The website detail uses it too. `/update` is for "Save Changes" only.

**Q29.** See §7.1. Who:
- Status change: `can_edit_status` (creator, doer, head of either).
- Approve / reject: creator or admin.
- Reopen: creator.

**Q30.** Enforced by the backend **only when one of the two tasks has effort > 0** (in practice, ATS). The check is per doer, across all of that doer's tasks in the company. See §8.7.

**Q31.**
- Sets `completed_at` (PKT). `/update` also sets `completed_late`.
- Reschedules dependents, rebuilds the doer's queue, and auto-starts their next task.
- Updates HR evaluations.
- Notifies the doer/creator.
- If approval is required and the doer completes, the status becomes Pending-Approval instead.

**Q32.** Send `"Complete"` only. `"Completed"` is stored, but it skips the approval and subtask checks (bug).

**Q33.**
- `can_edit` = creator → full edit, reassign, due date, reopen, project assign.
- `can_edit_status` = creator, doer, or head of either → status changes.
- `can_edit_subtask` = same as `can_edit_status` → subtask create (switched off).
- The Company Admin role is not counted.

**Q34.**
- `asigned_to` = the doer (authoritative).
- `assignee` = the **creator** — not a mirror.
- Create/update take the doer as `assign_to`. `/updateasignedto` reads it from `assignee`.
- So for reassign, keep sending both `asigned_to` and `assignee` with the new doer id.

**Q35.** No server check on the target. The website offers only `task_owner` (admin → everyone; head → self + reportees; others → self). There is no project-membership rule.

### D. Approval, rejection, delete, reopen

**Q36.** See §7.3. Mobile: on a Pending-Approval task, show the creator "Approve" (`updatetaskstatus Complete` or `/approve`) and "Reject" (`/reject`).

**Q37.** Yes, `/approve` works:
- Body: `{company_id, company_identifier}`.
- Reply: "Task has been approved."
- Notifies the doer ("approved your task" + email).
- The website does not call it.

**Q38.** Yes.
- `additional_hours` is in **minutes**.
- `reason`: required by the website, no server maximum.
- Only from Pending-Approval, and only by the creator or an admin.
- ATS adds `reject_type`.

**Q39.**
- Normal companies: status `Rejected`.
- ATS (with `reject_type`): back to `In Progress`, or `Pending` if the doer is busy.
- No new task is created.
- A `Rejected` task is still in the doer's queue and can be set back to In Progress.

**Q40.**
- Hard delete. It removes attachment rows, notifications and dependency links. Subtasks and comments are orphaned.
- Route permission: `tasks-delete`, plus creator/doer/head.
- The website has no delete UI. If you add one: creator only, behind a confirmation.

**Q41.** See §16 T-021.
- "Reopen" appears only on Complete tasks, only for the creator.
- Normal company → `updatetaskstatus`.
- ATS → `/reopen` with `{status, priority:"normal"|"critical", effort_hours (minutes), effort_unit, bump_to_front}`.
- `rescheduleReopened` has no live website trigger — don't use it.

### E. Dates and IDs

**Q42.** Always numeric integers. Socket payloads sometimes carry them as strings — normalise with `Number()`.

**Q43.** Yes, a string. Parse it with `Number()`.

**Q44.** See §2.7:
- `due_date`: `"YYYY-MM-DD"` (create, update, `duedate`).
- Sprint/project `due_date`: ISO.
- `recurring_time`: `"HH:mm"`.
- `completed_at` sent to `/recalculate`: ISO (ignored).

**Q45.** Server PKT (`Asia/Karachi`) for due-today, overdue, crons, recurring time and engine times. Compute "today" in PKT. Device time equals PKT for your users, but don't rely on that.

**Q46.**
- `created_at` (view) / `createdAt`: ISO-UTC.
- `start_date`: same formats as `due_date`.
- `completed_at`: `"YYYY-MM-DDTHH:mm"` PKT, or `"YYYY-MM-DD"`.
- There is no `actual_completion` field — use `completed_at`.

### F. List / filter / sort / paging

**Q47.** Not paginated, except `/filter?filter=complete` (`limit`, `page`, `has_more`).

**Q48.** The backend sorts each bucket (§3.1/§3.2), but the website re-sorts on the device (due date → critical → id). Sort locally.

**Q49.** See §3.1. A task is in at most one bucket.

**Q50.**
- Includes: project tasks, sprint tasks, subtasks (as rows), completed tasks (unless `exclude_complete`), and recurring instances.
- Excludes: templates and today's tasks.
- Deleted tasks don't exist (hard delete).

**Q51.** No count endpoint. Count on the device; use `complete_count` for Completed.

**Q52.** See §3.4. Only `complete` is paginated.

**Q53.** There is no project/sprint filter on the task endpoints. Use `GET /projects/detail/:id` → `data.tasks`, and filter by `sprint_id` on the device (the website does this).

**Q54.** Client-side search is fine. There is no search endpoint.

### G. Dependencies and critical tasks

**Q55.** Yes: `task_id` depends on (waits for) `depends_on`. Finish-to-start.

**Q56.**
- Server refuses: On Hold tasks/blockers, the task itself, duplicates, and cycles (full check).
- Server allows: completed blockers.
- The website picker hides complete/cancelled/On Hold tasks, the task itself, and its own subtasks.

**Q57.** Yes:
- A dependent task cannot start before its blocker's `completed_at`/`due_date`. The engine moves its `start_date`/`due_date` and sends `schedule_update`.
- A `Pending` task cannot be activated until its blockers are Complete or Pending-Approval (400 with their titles).

**Q58.** The doer's critical task ids in the new order (1..n). It may include the new task's id after create; the website calls it once before create (existing ids) and once after (with the new id). Non-critical ids are ignored.

**Q59.** Reordered tasks that still wait on an unfinished blocker. They will run at the chosen position once the blocker finishes. Show them as an info message (§3.26).

**Q60.** No maximum. The backend never refuses; the prompt is UI only, and the website shows it in ATS only.

**Q61.** `bump_to_front` is enough when there is no other critical task. Call `/reorder-critical` only when the user ordered tasks in the order modal.

### H. Notes, mentions, attachments

**Q62.** Yes, multipart. Fields: `notes` (always send it), `company_id`, `company_identifier`, `reply_to`, and one `file`. `mentions` is ignored (the server reads the markup).

**Q63.** `{id, user_name, content}`. Your shape is correct.

**Q64.** `@[Full Name](userId)` is correct. Plain `@Full Name` is not parsed.

**Q65.** Yes, the backend creates them ("Mentioned you in a comment"). Mobile now receives them (list + push, from the next deploy; §10.1), so **remove your locally made ones** to avoid duplicates.

**Q66.** The server **toggles** `pin_top` (1 = pinned) and allows several pinned notes. The website shows one pinned note and unpins the others on screen only. See §11.1.

**Q67.** Edit and delete: author only, plus `tasks-edit`. No time limit.

**Q68.** A toggle per (user, emoji). Body `{emoji, company_id, user_id, user_name}`. The reply has the full list in top-level `reactions`.

**Q69.**
- Task attachments and note attachments are stored separately (§11.3).
- Max 30 MB; extensions png jpg jpeg pdf doc docx csv txt zip rar sql ppt xls xlsx svg webp avif; one file per request.
- Download: secure-file with the auth header.

**Q70.** `POST /tasks/attachments/:taskId` = files on the task itself (detail "Attachments", and after create). `addnote` + file = a file attached to a comment.

**Q71.** Yes: `GET /api/v1/secure-file?p=public/uploads/notes/<file>` (URL-encoded), with the auth header or `&token=`.

### I. Sockets

**Q72.** See §5.2: every action with its `data` fields. Full task objects come only with `create`, `create_subtask` and `update` (the detail-save path). Everyone receives every event.

**Q73.** Sent to every client of every company (`io.emit`). There are no task rooms to join.

**Q74.**
- Fields: `data.id`, `start_date`, `due_date`. Sometimes also `remaining_effort_hours` (minutes), `effort_hours`, `project_id`, `parent_id`.
- `null` dates mean the task is on hold.
- Patch these fields locally (no refetch).

**Q75.** See §5.3.

**Q76.** Handle these: `status_change`, `critical_reorder`, `sprint_assigned`, `project_update` (`sprint_*`, `due_date_update`). There are no approval, reminder, overdue or recurring events: approval arrives as `update`, recurring as `create`, reminders as `notification`.

**Q77.** Full refetch after reconnect. There is no replay.

**Q78.** Neither ordered nor deduplicated. Several events per action are normal. Make the handlers idempotent.

**Q79.**
- `project_update` covers project create/update/delete, sprint create/update/delete, and project due-date moves.
- A project status change also changes its tasks **without** task events.
- Keep refetching tasks on it.

### J. Permissions

**Q80.** See §6 and §15.

**Q81.** `is_head` alone is not the rule. The backend checks `tasks-create`. The website shows Create to `(Company Admin || is_head === "yes") && tasks-create`. Read both from the login data `user_permissions`.

**Q82.** See §6 (the "Website shows the control when" column) and §9. Most controls are **hidden** rather than disabled. The only disabled-with-message cases are:
- status of a Complete task: "Completed tasks cannot have their status changed."
- reopen by a non-creator: "Only the task creator can reopen a completed task."

**Q83.**
- **Company Admin:** passes every permission check, sees every task and gets the Assigned-To filter — but has **no edit rights on others' tasks** (except approve/reject and removing a dependency).
- **Head:** gets status/subtask rights over reportees' tasks, can assign to reportees, sees their tasks, and gets the Assigned-To filter.
- **Project creator/owner:** can edit the project (website) and create sprints.
- **SaaS admin:** not relevant to mobile.

**Q84.** Only to users with `tasks-list` **and** the `Tasks` module. This is the website route guard.

**Q85.** They are independent. To assign a task to a project, a user needs `tasks-edit` (server) + `can_edit` + `project-list` (website). To view project tasks: `project-list`. Changing a project task's status uses the normal task rules (`can_edit_status`).

### K. Notifications and push

**Q86.**
- `typ` is `task`, `tasks_due_today` or `tasks_overdue`. There is no per-event `typ`; use `title` (§10.3).
- The push event names (`task_assigned`, `task_status_changed`, `task_comment`, `task_mention`) are used only to match the user's push settings.

**Q87.**
- `task_id` = the numeric task id (0 for digest rows).
- `lead_id` = 0.
- `identifier` = company slug (may be empty).
- `description` = "<name> assigned <title> to you" (create/reassign only), otherwise empty.

**Q88.** Task push is back on from the next deploy (§10.1). §10.3 lists the triggers.
- Every person-caused event pushes, each time.
- System alerts (deadline, digests, recurring) push once per 24 h row.

Payloads are in §10.4.

**Q89.** `filter: "due_today"` → open the Due Today tab. `"overdue"` → open the Delayed tab.

**Q90.** `lead` is a CRM lead, not a task. Tasks never send it. Ignore it, or open Notifications.

**Q91.** Same fields. `task_assigned`, `task_status_changed`, `task_comment` and `task_mention` gate the matching task pushes (§10.3); `push_enabled` gates all of them. Send JSON booleans.

**Q92.** Yes, it still filters. With the header, `GET /notification/all` and `/readall` return or mark **chat and task** rows only (other categories stay web-only). Push follows the same categories whatever headers are sent. Task rows are no longer hidden from the next deploy on.

**Q93.** The backend sends it. Remove the local notification (§10.2).

### L. Advanced module, effort, scheduling

**Q94.** `user.company.modules` from the login reply (names), exact `"Advanced Task Scheduling"`. Refresh with `GET /companies/:company_id/modules`.

**Q95.**
- Create: `null`.
- Update: `null` when effort is set (the website sends `due_date: null` for ATS tasks with effort).
- Don't allow manual due-date edits in ATS — the website shows due dates read-only.

**Q96.**
- `effort_hours` = total in **minutes**; `effort_unit` = display unit.
- Both are needed in ATS. In normal companies, send neither.
- `remaining_effort_hours` = minutes still left on a paused or in-progress task (≤ `effort_hours`).
- `total_effort_hours` = total including additions (reject / extend).

**Q97.** See §8.3–§8.5 and §8.10.

**Q98.** `effort_history[]` in `/view` (no separate endpoint). Entries are created by the server on create, effort edits, reject, reopen, resume and delay extension. Show it as in T-035.

**Q99.**
- Adds the extra effort (converted from the chosen unit).
- Remaining = the added minutes.
- Computes a new `due_date` from now and rebuilds the queue.
- Emits `schedule_update {id, start_date, due_date, effort_hours}` (no `remaining_effort_hours`).
- Flow: `/delayed-popup` → popup → `/extend-delayed` → refetch, or patch from the event.

**Q100.** The backend already reschedules on its own in nearly every case. The website still calls `/recalculate` in ATS after the actions in §8.9. Copy that — it is cheap and safe.

### M. Projects

**Q101.** See §4.2 and §4.3.

**Q102.**
- `GET /projects` = projects you can see, with their tasks, attachments and users.
- `GET /projects?scope=all&lite=true` = every company project, raw. **Use this for the picker.**
- `GET /projects/list` = id/name/status of the projects you can see, at top-level `projects`.

**Q103.** `Planning` (default), `In Progress`, `On Hold`, `Completed`, `Abandoned` — not your values. Rules:
- Completed needs In Progress first (website) and no open tasks (server).
- Planning and On Hold put the project's tasks on hold.

**Q104.** See §4.2: `data.tasks` yes; `data.sprints` **no**; `status` and `priority` are top-level siblings of `data`.

**Q105.** Yes, `/tasks/updatetaskproject/:taskId`:
- `sprint_id` is optional (leave it out to keep the current sprint, `null` to remove it).
- To remove the task from its project, send `project_id: 0` (the website has no UI for that).

**Q106.** Server: `tasks-edit`. Website: `can_edit` + `project-list`. The sprint deadline must not be before the task's due date. Moving into a Planning project puts the task on hold.

**Q107.** See §4.3. Your `ProjectSprint` type should be `{id, name, due_date, status, project_id, created_by, description?}`: the name is in `name`, not `title`, and there are no `start_date`/`end_date` fields. Create Sprint wasn't on mobile simply because the contract wasn't known.

**Q108.** `GET /projects/detail/:id` → `data.tasks`. The website uses this.

**Q109.** Visibility rules are in §4.2 (GET /). `/detail/:id` only checks `project-list`. Project tasks keep **task** permissions (`can_edit*` per task).

**Q110.** See §17 P-007. The website applies no per-row checks inside project detail, but the server does. Mobile should use the task row flags.

**Q111.** One project and one sprint per task. Change it from the task row (T-024) or the project table's sprint column — not from task detail.

**Q112.** Yes, the same endpoints. Extra rules: Planning hold, sprint deadline, and the Completed-project rule.

**Q113.** Create: `name`, `company_id`, `due_date` required; `owner` optional; status defaults to `Planning`. Update: any subset. Delete: creator only (no website UI). Attachments are optional, uploaded after create.

**Q114.**
- `updatetaskproject` → `task_update/sprint_assigned` (+ `status_update` + `project_update/due_date_update`).
- Project changes → `project_update`.
- Patch the task on `sprint_assigned`. Refetch projects and tasks on `project_update`.

**Q115.** See §4.5. Assigning a task does not change chat membership straight away. It is synced, add-only, when the user next loads chat rooms.

### N. Parity and guidance

**Q116.** See §6, §7, §8 and §9, plus §16.

**Q117.** See §4 and §17.

**Q118.** These checks are **client-only on the website**, and mobile should copy them:
- "In Progress before Complete" (tasks and projects).
- Reopen = creator (only `/reopen` enforces it).
- Reject only from Pending-Approval when `approval_required = 1` (the server enforces it for every reject).
- Required create fields and effort > 0.
- Due-date bounds (no past days; not after parent/project/sprint).
- Critical prompt, and critical only in ATS.
- Sprint name/date rules, and the project due date not before its sprints/tasks.
- One pinned comment on screen.
- Comment edit/delete own-only (the server enforces this too).
- Create button gate (admin/head + `tasks-create`).
- Assigned-To filter for admin/head.
- Upload extension list.

**Q119.** No renames are planned. Today's names stay.

**Q120.** Backend branch `tasks` @ `803e41d`; website branch `task` @ `036c443`. Hosts: ask DevOps (§1). Modules: `Tasks` (+ `Advanced Task Scheduling` for ATS, + a Task Scheduling Settings row for deadline alerts).

**Q121.** There is no OpenAPI spec.
- The backend repo has an old Postman collection (`Node Collections.postman_collection.json`) and `PLANIT_API_Documentation.pdf` — both older than these changes.
- The route files are the real source: `backend/adminRoutes/adminTasksRoutes.js`, `adminProjectRoutes.js`, `adminSprintRoutes.js`, `adminNotificationRoutes.js`, `adminCompaniesRoutes.js`; socket events in `server.js` and the controllers.

**Q122.** See §21.

### O. Website flow inventory

| Question | Answer |
|---|---|
| Q123 | §16 |
| Q124 | each card's **Where** + file list |
| Q125 | **Who** |
| Q126 | **Steps** |
| Q127 | **Checks** + §9 |
| Q128 | **API** |
| Q129 | **Sock** + §5 |
| Q130 | **States** |
| Q131 | **Nav** |
| Q132 | §16 T-004/T-005 — there are **no** bulk actions, import/export, duplicate/template, column customisation or global shortcuts on the website. Keyboard: Enter sends a comment / saves an inline row; Escape cancels. |
| Q133 | §10.3 |
| Q134 | §17 |
| Q135 | §17 |
| Q136 | §8.3–§8.5, §16 T-010/T-011/T-020/T-035/T-036 |
| Q137 | T-017–T-021 + §7.3 (no undo). Delete: T-043. |
| Q138 | §8.10, T-033/T-034/T-044, T-011 |
| Q139 | file names in §16/§17 headers; route `/:cid/tasks`, `/:cid/projects`, `/:cid/task-scheduling-settings` |
| Q140 | No recordings are included. Ask the web team for a test company with `Tasks` + `Advanced Task Scheduling`, one head, one normal user and one Company Admin. |
| Q141 | §21 and the **Edge** lines |
| Q142 | §18 |

---

## 20. Recommended implementation order

1. **Data correctness (do first — these corrupt shared data today):**
   - Effort in minutes (§0 #1).
   - `due_date` as `YYYY-MM-DD` (#2).
   - Update payload: HTML description, no project/sprint fields, effort only in ATS (#10).
   - `On-Hold` spelling.
2. **Gates and module detection:**
   - ATS from `user.company.modules` (#3).
   - Create gate (#4), reassign gate (#5), `tasks-list` and `tasks-edit` gates.
   - Treat a missing `can_edit` as false.
3. **Status flows:**
   - All status changes through `/updatetaskstatus`, with rollback and the approval reply (#8, #9).
   - One-way complete checkbox, with the "In Progress first" rule.
   - Remove the device-side one-in-progress block.
4. **Approval:** Pending Approval tab, Approve, Reject only from Pending-Approval (+ ATS two-step), Reopen (creator; ATS `/reopen`).
5. **Lists:**
   - `exclude_complete` + paged Completed.
   - Recurring from `filter=recurring`.
   - `stale` / `wait_fresh`.
   - Tab rules as in T-002.
6. **Sockets:** §5.2 actions, `Number(company_id)`, ignore `jobstatus_update`.
7. **Delay popup** from `/tasks/delayed-popup`.
8. **Attachments:** upload after create; open/download through secure-file.
9. **Comments:** reply, delete confirmation, own-only edit/delete, pin toggle fix.
10. **ATS extras:** make the critical order modal reachable, `/recalculate` calls (§8.9), effort logs from `effort_history`, read-only due dates.
11. **Projects** (after 1-10):
    1. Mount `ProjectProvider`.
    2. Fix the project status enum.
    3. Project list.
    4. Detail + `GET /sprints`.
    5. Sprint create.
    6. Task → project/sprint assign (T-024).
    7. Project tasks table using the task row flags.
    8. `project_update` refresh.
12. **Task notifications (live from the next backend deploy):** remove the local mention notifications; map `type:"tasks"` + `filter`; show task rows in the inbox.

No backend feature flag is needed for steps 1-11.

---

## 21. Known backend bugs and limitations that affect mobile (Q122)

| # | Issue | Impact / what to do |
|---|---|---|
| 1 | Calls by a user with no rights on the task to `update` / `delete` / `statusupdate` / `attachments` / `attachmentdelete` crashed the server. | **Fixed in the working tree (§12).** Until it is deployed, never call them when the flags say no. |
| 2 | `/update` writes `null` for omitted fields. | Always send the full payload (§3.10). |
| 3 | `"Completed"` skips the approval and subtask checks on `/updatetaskstatus`. | Send `"Complete"`. |
| 4 | `/updatetaskstatus` never sets `completed_late` (`/update` does). | Server-side evaluation detail; nothing for mobile. |
| 5 | `filter=delayed` and `filter=due_in_7_days` include completed tasks; `filter=complete` pages are re-sorted by `start_date`. | Filter and sort on the device. |
| 6 | Socket events go to every company and carry no auth. `user_update` and recurring `create` payloads include user documents. | Filter on `company_id`. Never store or show unexpected fields. (Raised with the backend team as a security item.) |
| 7 | Socket ids and `company_id` are sometimes strings. | Compare with `Number()`. |
| 8 | Upload rejections (type, size, 2+ files) return **500 HTML**. | Check type and size before uploading; send one file per request. |
| 9 | `reorder-critical`'s head check passes for everyone. | Only call it from the ATS critical flow. |
| 10 | `/tasks/view` returns any task by id, and list endpoints accept any `company_id`. | Always send your own `company_id`. |
| 11 | `update-device-token` reset `platform` to android; settings read the string `"false"` as `true`; a comment without `notes` skipped its socket event and notifications. | **Fixed 2026-10-30 (§12).** |
| 12 | Project detail gives a Company Admin `can_edit_status = true`, but `/updatetaskstatus` refuses admins who aren't stakeholders (403). | Show the 403 message. |
| 13 | Deadline-alert notifications are refreshed every minute (marked unread again). | Expect `notification` events for the same row. |
| 14 | Task delete leaves orphaned subtasks and comments; the "You deleted a task" title is sent to the creator even when someone else deleted it. | No delete UI. |
| 15 | The pending-approval reminder (09:00) goes to the doer, not the approver. | Product issue; nothing for mobile. |
| 16 | `/projects/update` with status `Complete` (not `Completed`) → 500. | Use the enum in §4.1. |
| 17 | Sprint create without `created_by` → 500. | Send it. |

---

## 22. Flow coverage statement and handoff checklist

**Coverage statement (19.7):**
- **Every Task flow on the website** is listed in §16: T-001 to T-046. This includes admin/settings flows and flows that cross into Notes and Meetings.
- **Every Project-in-Task flow** is listed in §17: P-001 to P-013.
- **Hidden, beta, off or dead flows on the website:**
  - Subtask creation (T-044); task delete UI (T-043); project delete UI (P-010).
  - The "Task Reopened — Estimate Hours" socket modal (never triggered).
  - The critical-tab drag reorder; the multi-section list mode; the project date-range filter.
  - The detail reopen modal; the detail discard-changes dialog.
- **Flows not present in mobile today:** T-008, T-012, T-013, T-018, T-020, T-021, T-025, T-028, T-031 (send), T-033 (edit), T-034 (edit), P-002, P-004, P-006, P-008, P-009.
- **Flows mobile has but which differ from the website:** T-001, T-002, T-006, T-007, T-009/T-010, T-011, T-015, T-016, T-017, T-019, T-022, T-027, T-029, T-030, T-032, T-035, T-036, T-040, P-001, P-003, P-005, P-007.
- **Flows mobile should NOT build:** T-037, T-039, T-041, T-042 (migrations), T-043 (delete), T-044 (subtasks), T-045 (settings), T-046, P-004 (AI), P-010 (project delete). Also never call `/tasks/statusupdate`, `GET /tasks/:id`, `/tasks/updateleadsource` or `/tasks/reschedule-reopened`.

**Checklist (your §20):**

- [x] Every endpoint in Section 7 is marked unchanged/changed/removed/new — §13
- [x] Every endpoint in Section 10 is marked — §13
- [x] Exact request/response schemas for changed/new endpoints — §3, §4
- [x] Exact error bodies/status codes — §2.2, §3, §4
- [x] All task socket events and `task_update` actions with payloads — §5
- [x] Socket scope/rooms/ordering/idempotency/reconnect — §5.1
- [x] Complete task and project permission matrix — §6, §4.4, §15
- [x] Website frontend checks for tasks and project tasks — §9, §16, §17
- [x] Status/priority/transition matrix — §7
- [x] Business logic (scheduling, ATS, dependencies, recurrence, approval/rejection, critical, overdue/delay, effort logs, subtasks) — §8
- [x] Task/project push payloads and triggers — §10 (task push back on for mobile; project push stays web-only)
- [x] Attachment/mention/file contract — §11
- [x] Change log — §12
- [x] Recommended mobile implementation sequence — §20
- [x] Every Task flow on the website listed — §16
- [x] Every Project-in-Task flow listed — §17
- [x] Every flow has steps, checks, permissions, API, sockets, states, navigation, notifications, edge cases — §16, §17
- [x] Every flow marked implemented/partial/missing and must-have/optional — §16, §18
- [x] Flow-by-flow mobile guideline — §18
- [x] Q1-Q142 answered by number — §19
- [x] Single `TASK_MODULE_BACKEND_CONTRACT.md` returned
