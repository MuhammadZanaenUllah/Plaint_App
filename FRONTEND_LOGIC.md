# PlanIt Frontend – Logic Reference

A map of how the PlanIt frontend works: boot, auth, routing, permissions, real-time updates, and each feature module.

---

## 1. Tech Stack

| Concern | Library |
|---|---|
| Framework | React 18 (Create React App / `react-scripts 5`) |
| Routing | `react-router-dom` v6 |
| UI | Ant Design 4 (`antd`) + Bootstrap (modals via `window.bootstrap`) + custom CSS |
| HTTP | `axios` (single instance in `Services/httpService.js`) |
| Real-time | `socket.io-client` (`Services/SocketService.js`) |
| Secure storage | `react-secure-storage` (auth/session data) |
| Dates | `moment` |
| Charts | ApexCharts, Highcharts |
| Rich text / mentions | `react-quill`, `react-mentions`, `emoji-picker-react` |
| CSV | `papaparse`, `react-papaparse`, `react-csv` |
| Misc | `lodash`, `react-select`, `react-toastify`, `react-confetti`, `react-loading-skeleton` |

Redux, `react-query` and `casl` are installed, but the app does not really use them. `store.js` and `types.js` are empty, and `utlits/Ability.js` is a leftover CASL sample. **State is kept in each component** (`useState`), plus `secureLocalStorage` for user and session data.

### Environment variables (`.env`)
- `REACT_APP_BASE_URL`: REST API base URL, for example `https://backend.planit.pk/api/v1/`
- `REACT_APP_SOCKET_URL`: Socket.IO server. Defaults to `https://backend.planit.pk`.

### Scripts
`npm start` / `npm run dev` start the dev server. `npm run build` builds for production.

---

## 2. Folder Structure

```
src/
├── index.js                 # Root render, BrowserRouter, global antd message config, CSS imports
├── App.js                   # Public routes + global effects (session timeout, sockets, evaluation popup)
├── Main/Main.jsx            # All private (authenticated) routes, wrapped in ChatProvider
├── Components/
│   ├── PrivateComponent.jsx # Auth guard + Sidebar layout + BirthdayAnimation (Outlet)
│   ├── PrivateRoutes/PermissionRoute.jsx  # Permission + module gate per route
│   ├── Layouts/             # Sidebar, Header, NotificationBanner, GlobalLeadNotifier, EvaluationPopup
│   ├── Reuseable/           # Shared inputs/badges/fields (see §9)
│   └── Screens/<Feature>/   # One folder per feature module
├── Services/                # One API service file per domain (axios wrappers)
├── hooks/useAdvancedTaskModule.js
└── utlits/                  # DataParser (session helpers), toast, pagination, image utils, constants
```

> Files named `*-OLD.jsx`, `* copy.jsx`, `*-backup*.jsx`, `*-working.jsx` and `Sidebar-old.jsx` are **old versions that nothing imports**. Ignore them.

---

## 3. Boot Sequence

1. **`index.js`** wraps `<App />` in `<BrowserRouter>`. It loads the antd CSS and the custom CSS files, and sets the global `message` z-index (100015) so messages show above off-canvas panels.
2. **`App.js`**:
   - Renders the **public routes**: `/` (Login), `/home` (Welcome), `/career`, `/forgot-password`, `/reset-password/:token`, `/initial-reset-password`, `/unauthorized`.
   - Always renders `<Main key={forceUpdate} />`. Changing the key **remounts the whole private tree**, which re-reads permissions.
   - Runs the global effects listed in §5.
3. **`Main.jsx`** wraps everything in `<ChatProvider>`. It mounts `<GlobalLeadNotifier />` and `<ChatModal />`, then declares all private routes under `<PrivateComponent />`.
4. **`PrivateComponent`**:
   - Reads `adminInfo` from secure storage. If it is missing, redirects to `/`. If present, renders Sidebar + `<Outlet/>`.
   - Captures a `?chat_invite=` token into `localStorage.planit_pending_chat_invite`, then removes it from the URL.
   - Re-checks auth whenever the `permissionsUpdated` window event fires.
5. **`UndefinedRedirect`**: any URL starting with `/undefined/...` (company identifier not loaded yet) has that prefix stripped.

---

## 4. Authentication

### Login (`Screens/Auth/Login.jsx` + `Services/LoginService.js`)
1. `POST /user/login`
2. If the user must change their password on first login, the app navigates to `/initial-reset-password` with `{ email }`, which calls `POST /user/initial-password-reset`.
3. On success, the login response is stored:
   - `secureLocalStorage.adminInfo`: the full login response (user, userdata, company, permissions, token)
   - `secureLocalStorage.admins`: authToken
   - `secureLocalStorage.loginTime`
   - `secureLocalStorage.sessionTimeoutMins` (default **360**)
   - "Remember me" saves the email and password in plain `localStorage`. Note: this is a security weakness.
4. Login is **blocked** for a non-Company-Admin, non-SaaS-Admin user who has:
   - no permissions ("No permission assigned…"), or
   - no company policy ("No policy is assigned…").
5. A user is treated as **SaaS Admin** when `is_saas_admin === true`, or when the role title is "saas admin" (or roleId 12) and there is no company_id.
6. After login the app dispatches the `permissionsUpdated` event, then navigates to the dashboard.

### Password flows
`AuthService`: `POST /user/forgot-password`, `POST /user/reset-password`, `POST /user/verify-email`.

### Logout
`LoginService.logout()` → `secureLocalStorage.clear()`.

### HTTP layer (`Services/httpService.js`)
- A single axios instance using `baseURL = REACT_APP_BASE_URL` and a 500 s timeout.
- **Request interceptor**: reads `adminInfo.authToken` on every call and sends it as the `authToken` header. For `FormData` it removes `Content-Type` so the browser can set the multipart boundary.
- **Response interceptor**: logs the user out when it gets HTTP **401** or the body `"Un-Athunticated request"`. It clears `adminInfo`, `admins`, `loginTime` and `sessionTimeoutMins`, then redirects to `/`.
- Exposes `requests.get/post/put/patch/delete`, which return `response.data`.

---

## 5. Global Behaviors (App.js)

| Behavior | Logic |
|---|---|
| **Idle session timeout** | `mousemove`, `keypress`, `click` and `scroll` update `localStorage.lastActiveTime` (at most once every 5 s). Every 30 s the app compares idle time with `sessionTimeoutMins` (default 360). If idle time is longer, it logs out and redirects to `/`. |
| **Live permission update** | Socket `role_update`: if the company and role match the current user, the new permissions are written into `adminInfo` and the `permissionsUpdated` event fires, which remounts `<Main>`. |
| **Live module update** | Socket `modules_update`, `packages_update` and `companies_update` (for the user's own company) trigger `refreshCompanyModules()`, then `companyModulesUpdated` fires, which remounts `<Main>`. |
| **Session settings live** | Socket `session_settings_update` writes the new `sessionTimeoutMins`. If status is inactive, it falls back to 360. |
| **Pending evaluation popup** | Only for department heads (`is_head === "yes"`). `EvaluationService.getPendingEvaluations`: if there are pending evaluations and either `screenBlocked` is true or the head has not skipped today, `<EvaluationPopup>` is shown. The popup is hidden on `/evaluation` and on public pages. Rechecked on route change and on socket `evaluation_update`. |
| **AntD dropdowns inside Bootstrap modals** | A capture-phase `focusin` handler stops the Bootstrap focus trap from stealing focus from antd pickers and selects. A `mousedown` handler stops the date picker from blurring. |
| **Modal backdrop click** | A click outside `.modal-content` (and outside antd dropdowns) hides the open Bootstrap modal. |

---

## 6. Authorization Model

Access has two layers. Both are checked in `PermissionRoute` and repeated in `Sidebar`.

### 6.1 Module gate (the company's plan)
- `DataParser.AllowedCompanyModules()` returns the module names in the company's package.
- The route prop `requiredModule="Leads" | "Tasks" | "Human Resource" | "Advanced Task Scheduling"`.
- **This gate applies to every role, including Company Admin.** It asks whether the company paid for the feature.
- SaaS Admin skips it.
- Hook: `useAdvancedTaskModule()` returns `true` when the company has "Advanced Task Scheduling".

### 6.2 Permission gate (the user's role)
- `adminInfo.user.userdata.user_permissions` is an array of slugs such as `leads-list`, `tasks-list` and `user-create`.
- Slug format: `<resource>-list | -create | -edit | -delete`.
- `requiredPermission` can be a string, or an array where **any one** permission is enough.
- **Order of checks:** SaaS Admin → allowed · module missing → `/unauthorized` · Company Admin → allowed · permission check → allowed or `/unauthorized`.

### 6.3 Multi-tenant URLs
- Private routes are prefixed with `/:cid/` (company identifier). The prefix comes from `DataParser.CompanyIdentifier()` / `CompanyUrlPrefix()`, which returns an empty string for SaaS Admin.
- SaaS Admin also has unprefixed routes: `/saas-admin-dashboard`, `/companies`, `/packages`, `/modules`, `/permissions`, `/saas-admin-users`, `/saas-admin-roles`.

### 6.4 `utlits/Dataparser.js` (session helper)
All of these read `secureLocalStorage.adminInfo`:
`GetLoggedInUser, CompanyId, AuthToken, UserId, RoleId, userRoleTitle, isHead, departmentId, CompanyIdentifier, CompanyIdentifierRole, CompanyUrlPrefix, AllowedCompanyUsers, AllowedCompanyModules, CompanyUserName/FirstName/Image, UserType, CompanyUserPermissions, IsSaaSAdmin, userLeavePolicyDetail, userAttendancePolicyDetail`

It also has date and time helpers: `getNumberOfDays`, `getDateinFormat`, `getCurrentTime`, `getDaysInMonth`, `convertTime` (12h→24h), `calculateTimeDifference`, `calculateTimePercentage`, and `calculateOvertimeAttendance` (9-hour baseline).

---

## 7. Real-time (Socket.IO)

`SocketService` is a singleton that provides `connect / disconnect / on / off / emit`. Listeners registered before `connect()` are queued and attached once the socket connects. It reconnects automatically and uses the websocket transport with polling as a fallback.

**Pattern used by every list screen:** subscribe to `<entity>_update` in `useEffect`. When an event arrives for the same `company_id`, refetch the list or patch it locally. Unsubscribe with `off` on unmount.

Events in use:
`lead_update, lead_note_update, lead_settings_update, leadsource_update, customer_update, task_update, project_update, task_scheduling_settings_update, leave_update, leavetype_update, leavesession_update, wfh_update, attendance_update, machine_update, user_update, role_update, permissions_update, department_update, designation_update, jobstatus_update, priority_update, shift_update, holiday_update, hrpolicy_update, ipaddress_update, pastdays_update, settings_update, session_settings_update, evaluation_update, hire_update, job_application_update, categories_update, category_package_update, companies_update, modules_update, packages_update, notification, typing` (chat).

---

## 8. Feature Modules

### 8.1 Dashboard / Home
- `Home/Dashboard.jsx` (`/:cid/dashboard`, `dashboard-list`) shows user summary, leave requests, today's attendance and attendance graph (`UserService.getUserSummary`, `getUserLeaveRequest`, `getUserHomeAttendence*`), plus due-today and critical tasks.
- `Home/BirthdayAnimation.jsx` plays confetti on birthdays. It is mounted inside `PrivateComponent`.
- `Welcome/Welcome.jsx` (`/home`) is the first-time welcome screen. It calls `UserService.updateWelcomeSeen`.
- `Dashboard/SaaSAdminDashboard.jsx` is the dashboard for platform-level stats.

### 8.2 CRM Leads (module **Leads**)
| Route | Screen | Permission |
|---|---|---|
| `/:cid/crm-leads`, `/:cid/leads` | `CrmLeads.jsx`: tabbed, paginated list (e.g. `due_today`) with owner, status and source filters | `leads-list` |
| `/:cid/crm-pipeline` | `PipelineBoard.jsx`: Kanban board with stages **New → Contacted → Qualified → Proposal → Won / Lost** | `pipeline-list` |
| `/:cid/crm-action-queue` | `ActionQueue.jsx`: leads that need action next; can hide snoozed leads | `que-list` |
| `/:cid/lead-dashboard` | `CrmDashboard.jsx`: charts and KPIs | `leads-list` |

- **Create/Edit** (`CreateCrmLead.jsx`) uses a custom overlay instead of antd Modal: z-index 100005, the page behind it cannot scroll, 850px wide for create and 1100px for edit. Customer lookup by phone: `lookupCustomer`. Dropdown data comes from `getInitialData`.
- **Notes/Comments** (`LeadComments.jsx`): create, edit and delete notes, emoji reactions, @mentions (`UserService.getCrmLeadMentionUsers`), and image/audio attachments (`AuthenticatedImage`, `AuthenticatedAudio`, `NoteImageUpload`).
- **Activity log** (`LeadActivityLog.jsx`): `LeadPipelineService.getActivities / logActivity`.
- **Pipeline logic** (`LeadPipelineService`): `transitionStage`, `reopenLead` (for Won/Lost leads), `snoozeLead`, `getActionQueue`, and the interest catalog (get/add/delete).
- **Global follow-up reminder** (`Layouts/GlobalLeadNotifier.jsx`): once a day per user (key `crm_global_notified_<user>_<date>`) it fetches the user's `due_today` leads. For 3 leads or fewer it shows one notification per lead; for more it shows a summary. Clicking a notification opens `/crm-leads` with `state.LeadId`.
- **Lookup setup screens:** `LeadSource` (secondary source), `Communication` (lead source), `RelatedTo` (lead type), `ProspectAmount`, `LeadStatus`, and `Settings/LeadSettings.jsx`.
- The old `Leads/` folder (Leads, CreateLeads, EditLeads) was the first CRM version. The routes now render `CrmLeads`.

### 8.3 Tasks & Projects (module **Tasks**)
- **`Tasks/Tasks.jsx`** (`/:cid/tasks`) is the main task board:
  - Groups: *assigned by me*, *assigned to me*, *all others*. Optimistic updates via `optimisticTasks`.
  - Filters: status, priority, owner/user, creator, date range, time presets (today, overdue…), and search. There is also a filter sidebar that can be collapsed, and a manual order override for critical tasks.
  - Create and edit open in drawers (`CreateTask.jsx`, `EditTask.jsx`). Subtasks can be added inline (`InlineSubtaskRow.jsx`), and a navigation stack (`taskNavStack`) handles moving from a parent task to a subtask and back.
  - **Recurring tasks:** period (daily, weekly, monthly, annual), time, total count, excluded days, weekday, month date, and annual month/date.
  - Notes (`TaskNotesPopover.jsx`): add, edit, delete, pin to top, and @mentions (`UserService.getMentionUsers`, react-mentions).
  - Inline edits: title, assignee, status (`updateTasksTitle`, `updateTaskAssigne`, `updateTaskStatus`).
  - Due-date checks follow the hierarchy project → sprint → task → subtask. A status of *Pending-Approval* is used when `approval_required` is set.
- **Projects** (`Projects/*`, `/:cid/projects`): CRUD, project detail, attachments, and project users (`UserService.getProjectUsers`). **Sprints** (`SprintServices`): CRUD and attachments.
- **Workflows** (`Workflows/*`): workflow templates and their tasks (`WorkFlowsService`).
- **Advanced Task Scheduling** (module-gated) has a settings page at `/:cid/task-scheduling-settings` (`task-scheduling-settings-list`). The rest of the engine is planned (approval, effort/capacity, dependencies, start-date calculation) but not built yet. See `ADVANCED_TASK_SCHEDULING_PLAN.md`.

### 8.4 Attendance (HR)
| Route | Screen | Who |
|---|---|---|
| `/:cid/employee-attendance` | `AttendanceEmploye.jsx`: own attendance, **punch in / punch out** | `myattendance-list` |
| `/:cid/attendance` | `AttendanceHr.jsx`: company-wide totals, search, edit | `hrattendance-list` |
| `/:cid/hr` | `Attendance.jsx`: CSV upload of attendance (papaparse) | `attendance-list` |
| — | `AttendanceReport.jsx`: reports and overtime | |

- Punch flow: `GET /punchin/eligibility` checks policy, IP and shift rules. Then `POST /attandence/checkpunchIn` and `POST /attandence/daypunchIn` / `daypunchOut`.
- Overtime is calculated against a 9-hour day (`DataParser.calculateOvertimeAttendance`).
- Related settings: **IP Address** whitelist, **Force Checkout Time**, **Machine Integration** (biometric device) + **Machine Sync Logs**, **Shifts** (`Shifts/UserShifts.jsx`, `Settings/CompanyShifts`), **Past Days Settings** (how many past days a user can edit).

### 8.5 Leaves
- Employee: `/:cid/employee_leaves` (`Leaves.jsx`, `AddLeaves.jsx`) to apply for leave and see balances (`LeaveBadge`, `UserLeaves/UserLeaveEmployee.jsx`).
- Department head: `/:cid/leaves_team` (`LeavesHead.jsx`) to approve or reject team leave (`leaveapplications/deptusers`).
- HR: `/:cid/leaves` (`LeavesHr.jsx`, `AddLeavesHr.jsx`) to manage all leave and apply on behalf of someone.
- Status change: `POST /leaveapplications/statusupdate/:id?status=`. Leave type change: `leavestatusupdate/:id`.
- Setup screens: **Leave Type**, **Leave Period** (leave session), **Leave Entitlement** (HR / User views), **Holidays**, **Physical Period** (fiscal year).

### 8.6 Work From Home
Same three roles as Leaves: `employee_wfh` (`WfhApplications`, `AddWfh`), `wfh_approvals` (head), `wfh_hr` (`WfhHr`, `AddWfhHr`). API: `/wfh-applications/*`.

### 8.7 Performance Management
- `performanceperiod`: evaluation periods.
- `performanceweightage` (`Weightages/list|create|edit`): KPI weights.
- `evaluation` (`Evaluation.jsx`): a head evaluates team members. `getCalculation` pre-fills auto-calculated scores; `calculate-and-save` stores them.
- `teamevaluations` / `all-users-evaluations` (`AdminEvaluationTable`, `viewType` = `team` or `all`) and `myevaluation` (`UserEvaluationTable`).
- `EvaluationPopup` reminds heads, and can block the screen, until pending evaluations are done (see §5).

### 8.8 Users, Roles, Org Structure
- **Users** (`Users/*`): list, add, edit and view. Repeaters for education (`Repeater.jsx`) and experience (`ExpRepeater.jsx`), document uploads (`ImageUtlitsUserDoc`), nationality list (`utlits/constants.js`). The number of users is limited by the plan (`AllowedCompanyUsers`).
- **Roles** (`Roles/*`): CRUD and a permission matrix. Saving triggers the `role_update` socket event, which updates logged-in users live.
- **SaaS Admin**: `SaaSAdminUsers`, `SaaSAdminRoles`, `EditSaaSAdminRole`.
- **Departments, Designations, Job Status (employee job type), Priority, Categories / Lead Type**: simple CRUD lookup screens.

### 8.9 Policy
`Policy/*` (`policy-list/create/edit`) defines each company's HR policy: attendance and leave rules, with repeatable rule rows. The editor used is `EditPolicySimple.jsx`. **Users can't log in without a policy** (see §4).

### 8.10 SaaS Platform (SaaS Admin)
- **Companies** (create/edit): tenant companies, their package, and their identifier.
- **Packages**: which modules a plan includes and how many users it allows.
- **Modules**: list of modules (Leads, Tasks, Human Resource, Advanced Task Scheduling…).
- **Permissions**: the master list of permission slugs.
- Any change is pushed to logged-in users through `modules_update`, `packages_update` and `companies_update`.

### 8.11 Chat
- `Chat/ChatContext.jsx` (`ChatProvider`) holds global chat state. `ChatModal.jsx` is a floating chat window available on every page. `Chat.jsx` is the full page at `/:cid/chat`. `RoomList.jsx` lists rooms and `MessageInput.jsx` handles composing.
- Rooms and messages come from `ChatService`. Typing indicators use socket `emit("typing")` and `on("typing")`. Invite links `?chat_invite=` are saved in localStorage and handled after login.

### 8.12 Hiring / Careers
- Internal: `/:cid/hire` (`Hire`, `CreateVacancy`, `EditVacancy`, `Applicants`, `ApplicantsListing`) for vacancies and applicants (`VacancyService`).
- Public: `/career` (`Career.jsx`, `CreateCareer.jsx`) is the public job board and application form.

### 8.13 Settings Hub
`/:cid/settings` (`Settings.jsx`). A user can open it with **any one** of several settings permissions. From it you reach HR Settings, Lead Settings, Session Management (idle timeout), Task Scheduling Settings, Past Days, App Landing, Machine Integration and Company Shifts.

### 8.14 Notifications & Activity Logs
- `/:cid/inbox` (`Notifications.jsx`): `NotificationService` get / mark all read / read one. Live updates via socket `notification`. `NotificationBanner` shows in the header.
- `/:cid/activity-logs`: audit trail (`ActivityLogService`).

---

## 9. Reusable Components (`Components/Reuseable`)

| Component | Purpose |
|---|---|
| `EditableField`, `Editeable` | Click-to-edit table cells (inline update) |
| `AssigneField`, `UserMultiSelect`, `CategoryOwnerField` | User and owner pickers |
| `SelectFiled`, `MySelect`, `DateField` | Wrapped select and date inputs |
| `LeadPendingField` | Lead follow-up and pending-state editor |
| `StatusBadge`, `StatusBadgeHr`, `StatusBadgeLeave`, `LeaveBadge`, `WorkFromHomeStatus` | Status badges |
| `AuthenticatedImage`, `AuthenticatedAudio` | Load protected media by sending the `authToken` header (see `docs/IMAGE_AND_AUDIO_HANDLING.md`) |
| `Pagination`, `TableSkeleton` | Paging UI and loading skeleton |
| `UserProfile..jsx`, `UserProfileHrUser` | Profile cards |
| `Notofication` | Notification item |

`utlits/`: `toast.js` (toast helpers), `Paginate.js` + `useLoadMore.js` (pagination and infinite load), `ImageUtlits*.js` (upload helpers), `NoteImageUpload.jsx`, `waitForSelector.js` (waits for a DOM element to exist).

---

## 10. Conventions to Follow

1. **API calls** go through a `Services/<Domain>Service.js` object that uses `requests` from `httpService`. Never call axios directly. Always pass `company_id` (from `DataParser.CompanyId()`).
2. **Responses** usually have the shape `{ Good: boolean, data, message }`. Check `res.Good`.
3. **New route:** add it to `Main.jsx` under `/:cid/`, wrap it in `<PermissionRoute requiredPermission="x-list" requiredModule="...">`, and add the Sidebar entry with the same checks.
4. **New module-gated feature:** check `DataParser.AllowedCompanyModules()?.includes("<Module>")`. For Advanced Task Scheduling use `useAdvancedTaskModule()`.
5. **Real-time:** the backend emits `<entity>_update` with `company_id`. The screen subscribes, checks the company, and refetches. It must call `off` on unmount.
6. **Modals:** use Bootstrap modals or custom overlays. Keep antd popups above them (the high z-index values in `index.js` and `App.js` are set for this).
7. **Navigation:** always build URLs as `/${DataParser.CompanyIdentifier()}/...`.
8. **Permissions changed at runtime:** dispatch `window.dispatchEvent(new Event("permissionsUpdated"))` to remount the private tree.

---

## 11. Storage Keys

| Key | Store | Meaning |
|---|---|---|
| `adminInfo` | secure | Full login payload (user, company, permissions, modules, token) |
| `admins` | secure | authToken |
| `loginTime` | secure | Login timestamp |
| `sessionTimeoutMins` | secure | Idle timeout in minutes (default 360) |
| `lastActiveTime` | local | Last user activity, used for idle logout |
| `rememberEmail/Password/Me` | local | "Remember me" on Login |
| `planit_pending_chat_invite` | local | Pending chat invite token |
| `crm_global_notified_<uid>_<date>` | local | Once-a-day lead reminder flag |

---

# Part 2 — Detailed Checks & Business Rules (for Mobile)

## 1. Auth, Session, Access Control & Global Shell

> Sources: `App.js`, `Main/Main.jsx`, `Components/PrivateComponent.jsx`, `Components/PrivateRoutes/PermissionRoute.jsx`, `Components/Layouts/*`, `Components/Reuseable/Notofication.jsx`, `Components/Reuseable/StatusBadge.jsx`, `Components/Screens/{Auth,Welcome,Home,Notifications,Unauthorized}`, `Components/Screens/Settings/SessionManagement.jsx`, `utlits/Dataparser.js`, `Services/{httpService,SocketService,LoginService,authService,NotificationService,SessionSettingsService,UserService,EvaluationService,CompanyService}.js`.
> The unused files are `Login-OLD.jsx`, `ForgotPassword-OLD.jsx`, `ForgotPassword-Awais.jsx`, `Home-OLD.jsx`, `Sidebar-old.jsx` and `App-old.js`. `Home/Dashboard.jsx` is an empty stub that nothing routes to, because `/:cid/dashboard` renders `Home.jsx`. `Unauthorized/Unauthorized.jsx` is not routed either, because `/unauthorized` renders an inline div in `App.js`.

---

### 1.1 HTTP layer (`Services/httpService.js`)

- **Client setup:** axios with `baseURL = REACT_APP_BASE_URL` (for example `https://backend.planit.pk/api/v1/`) and `timeout: 500000` ms. Default headers are `Accept: application/json` and `Content-Type: application/json`.
- **Auth header:** every request reads `adminInfo.authToken` from secure storage and sends it as the header **`authToken: <token>`**. It is not a `Bearer` token.
- **File uploads:** when the body is `FormData`, the code deletes `Content-Type` so the multipart boundary is set automatically.
- **Response unwrapping:** every helper returns `response.data`. Screens then check **`res.Good === true`**, and on failure they show `res.data` (a string) as the message.
- **Forced logout.** Either of these conditions clears `adminInfo`, `admins`, `loginTime` and `sessionTimeoutMins`, then redirects to `/`:
  - HTTP status **401**.
  - A 200 response whose body, or `body.data`, equals the literal string **`"Un-Athunticated request"`** (the misspelling is in the code). This case also rejects the promise with `"Session expired"`.
- **Helper methods:** `get(url, config)`, `post(url, body, config)`, `put`, `patch` and `delete(url)`.
  - **Edge case:** `delete` ignores any body or config argument, so for example `company_id` in `deleteSessionSetting` is never sent.

### 1.2 Local storage model (`utlits/Dataparser.js`, `Login.jsx`)

**Secure storage**

| Key | Contents |
|---|---|
| `adminInfo` | The full login response, as JSON |
| `admins` | The auth token |
| `loginTime` | Epoch ms at login |
| `sessionTimeoutMins` | Default 360 |

**Plain `localStorage`**

| Key | Purpose |
|---|---|
| `lastActiveTime` | Idle tracking |
| `rememberEmail`, `rememberPassword`, `rememberMe` | "Remember me". The password is stored in plain text. |
| `planit_pending_chat_invite` | Chat invite token parked before login |
| `birthday_celebrated_<userId>_<YYYY-MM-DD>` | Birthday popup already shown today |
| `crm_global_notified_<userId>_<YYYY-MM-DD>` | Lead reminder already shown today |
| `sideBarState`, `openMenu2`, `openMenuLeaves`, `openMenu4`, `openMenuChat`, `openMenuTasksProjects`, `openMenuLeadsCrm` | Sidebar UI state |

**Login response fields the app reads**

- **Top level:**
  - `Good`
  - `data` (the error text)
  - `isDefaultPassword`
  - `userEmail`
  - `authToken`
  - `company_id`
  - `sessionTimeoutMins`
- **`user`:**
  - `name`
- **`user.userdata`:**
  - `id`, `company_id`, `first_name`, `image`
  - `role` (role id), `role_title`, `user_type`
  - `is_head` (`"yes"` or other), `department`
  - `user_permissions` (an array of slugs)
  - `is_saas_admin`, `has_seen_welcome`
- **`user.company`:**
  - `company_identifier`, `company_name`
  - `company_allowed_users`
  - `modules` (an array of module names, for example `"Leads"`, `"Tasks"`, `"Human Resource"` or `"Advanced Task Scheduling"`)
  - `policy[0].leavePolicy` and `policy[0].attendencePolicy`

**Derived helpers** (copy these exactly):

- **`CompanyId()`** returns `adminInfo.company_id`, the top-level field. App.js uses `user.userdata.company_id` for socket checks instead.
- **`IsSaaSAdmin()`** is true when `userdata.is_saas_admin === true`. It is also true when there is **no** `company_id` **and** either `role_title.toLowerCase() === "saas admin"` or `role === 12`.
- **`CompanyIdentifierRole()`** returns the URL prefix segment:
  - `""` when there is no `adminInfo`.
  - `"admin"` when `company_id === 0`.
  - Otherwise the first available of `company_identifier`, `company_name` and `String(company_id)`.
- **`CompanyUrlPrefix()`** returns `""` for a SaaS admin, and `"/" + CompanyIdentifierRole()` for everyone else.
- **`isHead()`** returns `userdata.is_head`. Code compares it with the string `"yes"`.
- **Time utilities used by attendance screens:**
  - `calculateTimeDifference(s, e)` gives whole hours using `moment(...,"LT")`. It returns 0 for invalid or negative input.
  - `calculateTimeDifference1` returns `"H:MM"`.
  - `calculateTimePercentage(e, s)` returns `round(e/s*100)`, capped at 100. It returns 0 when `s` is 0 or the input is invalid.
  - `convertTime(12h)` returns `"HH:mm"`, or `""` for `-`, `NaN` or invalid input.
  - `calculateOvertimeAttendance(start, end)` measures against a **fixed 9-hour day**:
    - Under 9 hours it returns `"-H:M"`, the shortfall.
    - Over 9 hours it returns `"H:M"`, the overtime.
    - Minutes are not zero-padded.
  - `getNumberOfDays(a, b)` returns `round((b-a)/86400000)`.

### 1.3 Routes and guards

**Public routes** (`App.js`):

| Route | Screen |
|---|---|
| `/` | Login |
| `/home` | Welcome. There is no auth guard. |
| `/career` | Career |
| `/forgot-password` | Forgot password |
| `/reset-password/:token` | Reset password |
| `/initial-reset-password` | Initial reset password |
| `/unauthorized` | Inline message "Unauthorized Access" / "You do not have permission to view this page." with a "Back to Login" button that goes to `/` |

**Private routes** (`Main.jsx`) are all wrapped in `PrivateComponent`:

- **Auth check:** if `adminInfo` is missing, the user is sent to `/`. Otherwise the app renders `BirthdayAnimation`, `Sidebar` (which includes `Header`) and the page.
- **Invite token:** a `?chat_invite=<token>` query parameter is parked into `planit_pending_chat_invite` and removed from the URL. Login does the same.
- **`/undefined/...` paths** have the `/undefined` prefix stripped and are redirected.
- **Global components:** `ChatProvider`, `GlobalLeadNotifier` and `ChatModal` are mounted around all routes.

**`PermissionRoute({requiredPermission, requiredModule})`** runs these checks in order:
1. If `adminInfo` is missing or unparsable, redirect to `/`.
2. **SaaS admin:** always allowed. This skips both the module and permission checks.
3. **Module gate:** if `requiredModule` is set and not in `user.company.modules`, redirect to `/unauthorized`. This applies to Company Admin too.
4. **Company Admin** (`role_title.toLowerCase() === "company admin"`) is allowed without a permission check.
5. **Permission check:** a string must be present in `user_permissions`, and an array needs **any** one of its slugs (OR logic). If the check fails, redirect to `/unauthorized`.

**Route → required permission (and module).** The `:cid` segment is `CompanyIdentifierRole()`.

- **SaaS routes** (with no prefix or with `/:cid/`):
  - `saas-admin-dashboard`, `saas-admin-users`, `saas-admin-roles`, `saas-admin-role-edit/:id` and `permissions` have no guard beyond login.
  - `companies` needs `companies-list`.
  - `packages` needs `package-list`.
  - `modules` needs `modules-list`.
  - `/admin/admin-dashboard` renders Home and has no guard.
- **Dashboard:** `/:cid/dashboard` needs `dashboard-list`.
- **Users:**
  - `users` and `users/view/:id` need `user-list`.
  - `users/create` needs `user-create`.
  - `users/:id` and `users/shift/:id` need `user-edit`.
- **Roles:** `roles`, `roles/create` and `roles/edit` need `role-list`, `role-create` and `role-edit` respectively.
- **Departments:** `departments`, `departments/create` and `departments/edit` need `departments-list`, `departments-create` and `departments-edit` respectively.
- **Designations:** `designations` needs `designation-list`.
- **Job status:** `employeejob`, `employeejob/create` and `employeejob/edit` need `jobstatus-list`, `jobstatus-create` and `jobstatus-edit` respectively.
- **Leads** (module **Leads**):
  - `leads`, `crm-leads` and `lead-dashboard` need `leads-list`.
  - `crm-pipeline` needs `pipeline-list`.
  - `crm-action-queue` needs `que-list`.
  - `secondary-lead-source` needs `leadsource-list`.
  - `lead-source` needs `communicationsource-list`.
  - `lead-type` needs `relatedto-list`.
  - `prospect_amount` needs `prospectamount-list`.
  - `lead_status` needs `leadstatus-list`.
- **Tasks** (module **Tasks**): `tasks` needs `tasks-list`, and `projects` **also** needs `tasks-list`. The sidebar uses `project-list` for projects.
- **Leaves:**
  - `leaves` (HR) needs `hrleaverequest-list`.
  - `leaves_team` needs `myteamleavesrequest-list`.
  - `employee_leaves` needs `myleave-list`.
- **Work from home:**
  - `wfh_hr` needs `hrwfhrequest-list`.
  - `wfh_approvals` needs `myteamwfhrequest-list`.
  - `employee_wfh` needs `mywfh-list`.
- **Leave setup and holidays:**
  - `leave_type` needs `leavetype-list`.
  - `leaveperiod` needs `leaveperiod-list`.
  - `holidays` needs `holiday-list`.
- **Attendance:**
  - `attendance` (HR) needs `hrattendance-list`.
  - `hr` needs `attendance-list`.
  - `employee-attendance` needs `myattendance-list`.
- **Policy:** `policy`, `policy/create` and `policy/:id` need `policy-list`, `policy-create` and `policy-edit` respectively.
- **Settings:** `settings` needs **any** of these slugs:
  - `leadsource-list`, `communicationsource-list`
  - `role-list`, `departments-list`, `designation-list`, `jobstatus-list`, `user-list`
  - `leaveperiod-list`, `leavetype-list`, `holiday-list`
  - `priority-list`, `performanceperiod-list`, `weightages-list`
  - `pastdaysettings-list`, `ipaddress-list`, `sessionout-list`
- **Other settings pages:**
  - `priority` needs `priority-list`.
  - `ipaddress` needs `ipaddress-list`.
  - `machine-integration` and `machine-sync-logs` need `machine-integration-list`. `machine-sync-logs` is not in the sidebar.
  - `force-checkout-time` needs `force-checkout-time-list`.
  - `company_shifts`, `company_shifts/create` and `company_shifts/edit/:id` need `companyshifts-list`, `companyshifts-create` and `companyshifts-edit` respectively.
  - `past_days_settings` needs `pastdaysettings-list`.
  - `session-management` needs `sessionout-list`.
  - `task-scheduling-settings` needs `task-scheduling-settings-list` **and** the module **Advanced Task Scheduling**.
- **Performance:**
  - `performanceperiod` needs `performanceperiod-list`.
  - `performanceweightage`, `performanceweightage/create` and `performanceweightage/:id` need `weightages-list`, `weightages-create` and `weightages-edit` respectively.
  - `evaluation` and `teamevaluations` need `Userevaluation-list`, which has a capital **U**.
  - `all-users-evaluations` needs `allusers-evaluation-list`.
  - `myevaluation` needs `myevaluation-list`.
- **Other pages:**
  - `chat` needs `chat-list`.
  - `activity-logs` needs `acctivitylogs-list`, spelled with a double "c".
  - `inbox`, `lead-settings`, `app-landing` and `hire`, `hire/create`, `hire/:id`, `hire/applicaton` have **no permission guard**, only login.

### 1.4 Login (`Screens/Auth/Login.jsx`), route `/`

- **Fields:**
  - Email: `type=email`, required, so it gets native HTML5 email validation.
  - Password: required, with a show/hide toggle.
  - "Remember me" checkbox.
  - "Forgot Password?" link to `/forgot-password`.
- **On mount:**
  - Parks `?chat_invite`.
  - If `rememberMe==="true"` and a saved email and password exist, the form is prefilled and the checkbox is ticked.
- **API:** `POST /user/login` with body `{ email, password }`.
- **Response handling, in order:**
  1. `!res.Good`: show `res.data` in the red alert.
  2. `res.isDefaultPassword`: navigate to `/initial-reset-password` with `state.email = res.userEmail`. Nothing is stored.
  3. Store `adminInfo = res`, `admins = res.authToken`, `loginTime = now` and `sessionTimeoutMins = res.sessionTimeoutMins || 360`.
  4. **Remember me:** if ticked, save the email and password (plain text) with `rememberMe="true"`. Otherwise remove the three keys.
  5. `isSaaSAdmin` is `is_saas_admin===true`, or `("saas admin"` role title or `role===12)` when there is no `company_id`.
  6. **Permission check:** if the user is not Company Admin, not SaaS admin, and `user_permissions.length === 0`, show **"No permission assigned to you. Please contact company admin or hr to add permissions"**. The code then removes `adminInfo` and `admins`, and the user stays on Login.
  7. **Policy check:** if the user is not Company Admin, not SaaS admin, and has no `user.company.policy`, show **"No policy is assigned to your account. Please contact your HR or Administrator."** The storage is cleared in the same way.
  8. Dispatch the window event `permissionsUpdated`, which remounts Main. Navigate after **200 ms**.
- **Post-login destination:**

  | User | Destination |
  |---|---|
  | SaaS admin | `/saas-admin-dashboard`, with no prefix |
  | `company_id === 0` | `/admin/admin-dashboard` |
  | Role `hr` | `/<company>/dashboard` |
  | Role `company admin` | `/<company>/employee-attendance` |
  | Others with `has_seen_welcome !== true` | `/home` (Welcome) |
  | Others with `has_seen_welcome === true` | The first permission they hold, in this order: `myattendance-list` → `employee-attendance`, `tasks-list` → `tasks`, `myleave-list` → `employee_leaves`, `myevaluation-list` → `myevaluation`. If they hold none of these, `employee-attendance`. |

  - Here `<company>` is `company_name || company_identifier || company_id`. **This is a different order from `CompanyIdentifierRole()`**, which puts `company_identifier` first.
- **Errors:** a network error or thrown error shows `err.response.data.message || err.message`.
- **Button:** shows "Log In", or a disabled "Logging In..." with a spinner while loading.

### 1.5 Forgot password (`ForgotPassword.jsx`), route `/forgot-password`

- **Field:** email, `type=email` and required.
- **API:** `POST /user/verify-email` with body `{ email }`.
- **Success:**
  - Shows a toast with `res.data.message || res.message || "Email verified, reset your password!"`.
  - Navigates to `/` with `state.email`.
- **Error:** shows `err.response.data.message`, falling back to "Something went wrong, try again!".
- The service also has `POST /user/forgot-password`, but nothing uses it.

### 1.6 Reset password (`ResetPassword.jsx`), route `/reset-password/:token`

- **Fields:** New Password and Confirm Password, both required, with no length or strength rule.
- **Validation:** the two passwords must match, otherwise a toast shows **"Passwords do not match!"**.
- **API:** `POST /user/reset-password` with body `{ token, password, confirmPassword }`.
- **Success:** shows `res.data.message || "Password reset successfully"` and navigates to `/`.
- **Error:** shows `err.response.data.message`, falling back to "Something went wrong, try again!".

### 1.7 Initial (forced) password reset (`InitialResetPassword.jsx`), route `/initial-reset-password`

- **Entry:** requires `location.state.email`. Without it the user is redirected to `/`.
- **Email field:** disabled and read-only.
- **Validation:**
  - Empty field: **"All fields are required"**.
  - Mismatch: **"Passwords do not match"**.
  - There is no strength rule.
- **API:** `POST /user/initial-password-reset` with body `{ email, password, confirmPassword }`.
- **Result:**
  - `!res.Good`: shows `res.data || res.message || "Failed to reset password"`.
  - Success: shows the toast "Password updated successfully! Please login with your new password." and navigates to `/`.
  - Error: shows `err.response.data.message || err.message || "Something went wrong"`.

### 1.8 Welcome (`Screens/Welcome/Welcome.jsx`), route `/home`

- **Shown to:** first-time employees, meaning users who are not HR and not Company Admin and have `has_seen_welcome !== true`.
- **"Get Started" button:**
  - Calls `POST /user/update-welcome-seen/:userId`.
  - Then routes using the same rules as Login (HR → dashboard, Company Admin → employee-attendance, otherwise the permission order), with `CompanyUrlPrefix()`.
- **Edge cases:**
  - If there is no `userId`, or the API fails, it navigates to `/<prefix>/dashboard`.
  - The local `adminInfo.has_seen_welcome` is **not** updated. The next login gets the new value from the server.

### 1.9 App-wide behaviour (`App.js`)

**Idle logout**
- **Activity tracking:** `mousemove`, `keypress`, `click` and `scroll` update `localStorage.lastActiveTime` at most once every 5 s, and only while the user is logged in.
- **Check:** runs every **30 s** and on mount. If `now - lastActiveTime > sessionTimeoutMins*60000`, the app removes `lastActiveTime`, calls `LoginService.logout()` (which clears **all** secure storage) and redirects to `/`.
- **Default timeout:** 360 min.

**Pending evaluation popup**
- **Eligibility:** only when `userdata.is_head === "yes"`, and `id` and `company_id` exist.
- **API:** `GET /evaluation/pending-evaluations?headId=&companyId=`.
- **Response fields used:** `hasPending`, `hasPastPending`, `screenBlocked`, `alreadySkippedToday`, `canSkip`, `periodStart` and `periodEnd`.
- **When it shows:** `hasPending && (screenBlocked || !alreadySkippedToday)`, and the current path has no `evaluation` segment. `myevaluation` does not count as that segment.
- **When it re-checks:**
  - On mount.
  - On every route change while `screenBlocked`, except on public paths or `/evaluation`.
  - On the socket event `evaluation_update` for the same company.
- **Popup** (`EvaluationPopup.jsx`):
  - **Title:** "Performance Evaluation Pending".
  - **Text:**
    - When `hasPastPending`: "You have pending performance evaluations from past periods. These are mandatory and must be completed to continue."
    - Otherwise: "You have pending performance evaluations that require your attention."
    - Plus " Please complete them to continue using the system." when blocked and there is no past-pending evaluation.
    - Plus " Kindly complete them at your earliest convenience." when not blocked.
  - **"Evaluate Now"** navigates to `/<cid>/evaluation`. If the popup is **not** blocking, it first calls `POST /evaluation/skip-evaluation`, so the click counts as a skip.
  - **"Skip"** appears **only when not `screenBlocked`**. It calls `POST /evaluation/skip-evaluation` with body `{head_id, company_id, period_start: periodStart||"all", period_end: periodEnd||"all"}`.
  - **Blocking mode:** when `screenBlocked`, the popup is a full-screen blocker.

**Socket listeners in `App.js`** (after `SocketService.connect()`)

| Event | Condition | Action |
|---|---|---|
| `role_update` | `data.company_id == companyId && data.action==="update_permissions" && data.roleId == userdata.role` | Replace `adminInfo.user.userdata.user_permissions = data.permissions` and dispatch `permissionsUpdated`, which remounts Main. |
| `session_settings_update` | same company | Actions `update` and `create` set `sessionTimeoutMins = data.data.timeout_minutes`. Action `status_update` sets it to `timeout_minutes` when `data.data.status===1`, otherwise **360**. |
| `evaluation_update` | same company | Re-check pending evaluations. |
| `modules_update`, `packages_update` | always | `GET /companies/:companyId/modules`. When `Good`, set `adminInfo.user.company.modules = res.data.modules` and dispatch `companyModulesUpdated`, which remounts Main. |
| `companies_update` | `data.data.id == companyId` | Same refresh as above. |

- **Remount:** both window events (`permissionsUpdated` and `companyModulesUpdated`) bump the `key` on `<Main>`. This remounts the whole app, so the menu and guards are re-evaluated. **A mobile app must re-evaluate menu visibility and guards in the same way.**
- **Toasts:** they render above everything, with `zIndex` 1100000.

### 1.10 Socket client (`Services/SocketService.js`)

- **Connection:** `socket.io-client` to `REACT_APP_SOCKET_URL`, falling back to `https://backend.planit.pk`, with `transports: ["websocket","polling"]` and `reconnection: true`. The app uses one shared connection.
- **Early listeners:** `on()` calls made before `connect()` are queued and replayed after the socket is created. `off()` also removes queued listeners.
- **No authentication:** there is no auth handshake. All listeners filter by `company_id` or user id **on the client side**.
- **Emits in this scope:** `registerRole(roleId)`, which Sidebar sends on mount, and `joinChatRoom(roomId)`, sent when a direct message is opened from the sidebar.

### 1.11 Header (`Layouts/Header.jsx`), rendered inside Sidebar

- **Title:** taken from a map keyed by the path segment after `:cid`. Numeric sub-segments become `:id`.
  - Examples: `users/:id` shows "Edit Employee" and `hr` shows "Attendance".
  - Pages without a title, and `saas-admin-dashboard`, show a greeting instead: `"<Good morning|afternoon|evening|night>, <user.name>!"` with "Let's make today productive!".
  - Greeting hours: 5 to 12 is morning, 12 to 17 afternoon, 17 to 21 evening, and anything else night.
- **Notification bell** (`Reuseable/Notofication.jsx`) is hidden when the page segment starts with `saas-admin`.
- **Profile menu:**
  - "Edit Profile" appears only when the user has `user-edit`. It navigates to `/<cid>/users/<ownUserId>`.
  - "Sign out" calls `LoginService.logout()`, which runs `secureLocalStorage.clear()`, then navigates to `/`. No logout API is called.
- **`NotificationBanner`:** when `Notification.permission !== "granted"`, a banner shows "Browser notifications are not enabled. Enable them to receive chat notifications." with a "How to enable" link to a guide for each browser and OS. This is web-only; on mobile it maps to the push-permission prompt.

### 1.12 Notification bell dropdown (`Reuseable/Notofication.jsx`)

- **Fetching:**
  - `GET /notification/all?company_id=<cid>&include_read=true`, reading `res.data.notifications`.
  - If that returns an empty list or an error, it falls back to `GET /notification/all?company_id=<cid>`, which returns unread only.
  - If `notifications === "Un-Athunticated request"`, the user is logged out.
- **Refetch triggers:** each time the dropdown opens, and on the socket event `notification` where `data.assigned_to == currentUserId`. The socket case also plays a sound at volume 0.4.
- **Notification object fields:** `id`, `typ`, `title`, `description`, `task_id`, `lead_id`, `mod_id`, `assigned_to`, `readed` (0 or 1), `createdAt`, and `assigned{first_name,last_name,image}`. The sender is "System" when there is no `assigned`.
- **Tabs:**
  - **All:** every notification.
  - **Unread:** `readed===0` and not a mention.
  - **Mentions:** `readed===0` and the title starts with "mentioned you".
  - Chat notifications arrive through the window event `chatNotification` from ChatContext. They are kept per room, capped at 10, and always count as unread. Chat mentions use `isMention===true`.
- **Badges:**
  - The Unread tab shows its count, and so does the Mentions tab.
  - The bell shows a green dot if any list is non-empty.
- **Relative time:** under 24 h uses `fromNow()`. Beyond that it shows "1 day ago" or "N days ago".
- **"Mark all read":** shown only if some notification has `readed===0`. It is optimistic: every item is set read locally, then `GET /notification/readAll?company_id=`.
- **"View all"** goes to `/<company_identifier>/inbox`.
- **Clicking a notification** is optimistic: `readed=1` locally, then `POST /notification/readOne/:id`. Where it goes depends on `typ`:

  | `typ` | Destination |
  |---|---|
  | `task` | `/<cid>/tasks` with state `{TaskId: task_id, isNotification:true}` |
  | `project` | `/<cid>/projects` with state `{TaskId, isNotification}` |
  | `leave` | `/<cid>/leaves_team` if `is_head==="yes"`, otherwise `/<cid>/employee_leaves` |
  | `attendance` | `/<cid>/employee-attendance` with state `{data: assigned_to, month, year}`. Month and year are parsed from the title regex `/for (\d{1,2} [A-Za-z]{3} \d{4})/` using the format `DD MMM YYYY`. |
  | `evaluation` | `/<cid>/evaluation` |
  | `lead` or `leads` | `/<cid>/crm-leads` with state `{LeadId: lead_id\|\|mod_id\|\|task_id, isNotification, isMention: title contains "mention" or "comment"}` |
  | `chat` | Opens chat room `description`, which holds the room id |
  | anything else | Treated as a lead, with `isMention:false` |

  Here `<cid>` is `company_identifier`.

### 1.13 Inbox page (`Screens/Notifications/Notifications.jsx`), route `/:cid/inbox`

- **Access:** no permission guard.
- **API:** `GET /notification/all?company_id=&include_read=true`. It refetches on the socket event `notification` for the current user.
- **Filters** (all client-side, and the page resets to 1 whenever one changes):
  - **Search:** matches `title`, `assigned.first_name` or `assigned.last_name`, case-insensitive.
  - **Type:** task, project, lead, leave, attendance, evaluation or chat. This compares against `typ` lowercased.
  - **Status:** Unread (`readed===0`), Read (`readed===1`), or Mention (title starts with "mentioned you").
  - **Date range:** inclusive from the start of the first day to the end of the last day, applied to `createdAt`.
- **Pagination:** client-side, **20 per page**. The paginator shows only when there are more than 20 results.
- **Columns:**
  - Created date, formatted `DD MMM YYYY, hh:mm A`.
  - Sender (avatar or "System") with the title.
  - A type badge.
  - An Unread or Read badge.
- **Row click:** same read-marking and routing as the bell (1.12).
- **Empty state:** "No notifications found."

### 1.14 HR Dashboard (`Screens/Home/Home.jsx`), route `/:cid/dashboard`

- **Access:** needs `dashboard-list`. `/admin/admin-dashboard` renders the same component with no guard.
- **APIs** (all with `?company_id=`):
  - `GET /summary/users` returns `totalUsers`, `activeUsers`, `inactiveUsers`, `upcomingBirthdaysCount`, `currentMonthBirthdaysList[{full_name,dob}]` and `latestUpcomingBirthdays[{full_name,dob}]`.
  - `GET /summary/leavesrequest` returns `pendingLeavesCount`. The UI shows `"00"` when the value is falsy.
  - `GET /homeattendence/users` returns an array of `{label, count}`. The dot colour is green for `Present`, red for `Absent` and blue for everything else.
  - `GET /overtime/todayattendance` returns an array of `{user_id, first_name, last_name, department, punch_in, punch_out}` for the "Real Time Monitor" table. A missing punch shows "—", and an empty list shows "No attendance records found for today."
  - `GET /homeattendence/graph` returns an array of `{day, Present, Absent, Leave, WFH}`. It draws the "Weekly Attendance Trend" spline chart; missing values count as 0. A skeleton shows while the array is empty.
- **Birthdays card:** the tooltip lists `currentMonthBirthdaysList`, or shows "No birthdays this month".
- **Known bug:** the "Upcoming Holidays" card never loads data because `setHolidays` is never called, so it always shows "No Upcoming Holidays".
- **Sockets** (all filtered by the same `company_id`):

  | Event | What it refetches |
  |---|---|
  | `attendance_update` | Today's attendance and the attendance summary |
  | `leave_update` | The leave summary |
  | `user_update` | The user summary |

### 1.15 Birthday animation (`Screens/Home/BirthdayAnimation.jsx`), on every private page

- **Frequency:** runs once per page load, guarded by a module-level flag. It skips if `birthday_celebrated_<userId>_<today>` is `"true"`.
- **API:** `GET /summary/users?company_id=`.
- **Matching:** filters `currentMonthBirthdaysList` for `dob === moment().format("Do MMMM")`, for example `"3rd March"`, so the backend must return this exact format.
- **When there is a match:**
  - Shows confetti (600 pieces) and a card "Happy Birthday!" with the names joined by " & ".
  - Marks today as shown.
  - Closes automatically after **10 s**, or manually with ×.

### 1.16 Global lead follow-up reminder (`Layouts/GlobalLeadNotifier.jsx`)

- **Trigger:** 2 s after mount, when there is a user id and a company id. It skips if `crm_global_notified_<userId>_<today>` is set.
- **API:** `CrmLeadsServices.getPaginatedLeads(companyId, page 1, size 50, {tab:'due_today', ownerFilter:userId})`.
- **3 leads or fewer:** one notification per lead, "Lead Follow Up Reminder" / "Scheduled for: <lead.title>", which stays for 10 s. Clicking it goes to `/<company_identifier>/crm-leads` with state `{LeadId}`.
- **More than 3 leads:** one summary, "Hello! You have N leads scheduled for follow-up today.", which stays for 8 s. Clicking it opens crm-leads.
- **Marking as shown:** the day is marked only when at least one lead was found.

### 1.17 Session Management (`Settings/SessionManagement.jsx`), route `/:cid/session-management`

- **Access:** needs `sessionout-list`. There is a single setting per company, holding the idle timeout.
- **APIs:**

  | Action | Call |
  |---|---|
  | List | `GET /session-management/all?company_id=` returns `data[]` of `{id, timeout_minutes, status}` |
  | Create | `POST /session-management/create` with `{company_id, timeout_minutes: parseInt}` |
  | Update | `POST /session-management/update/:id` with `{timeout_minutes}` |
  | Toggle status | `POST /session-management/statusupdate/:id` |
  | Delete | `DELETE /session-management/:id` |

- **Validation:** the Timeout (Minutes)* field is a number input with `min=1`. An empty value or a value of 0 or less shows **"Please enter a valid time in minutes"** inline, and typing clears it.
- **Visibility:**
  - "Create Session Setting" shows only when the **list is empty** and the user has `sessionout-list`, so each company gets one record.
  - The status toggle is clickable when the user has `sessionout-list` or `session-management-edit`. Otherwise a static Active or Deactive badge shows.
  - The Edit and Delete icons need `sessionout-list`. Without it the icons are greyed out with a tooltip.
- **Status toggle** (`StatusBadge`): optimistic. It rolls back when `Good===false` or on error. It shows "Status updated successfully!" or "Failed to update status." / "An error occurred while updating status.". The labels are Active and Deactive.
- **Delete:**
  - A confirmation modal asks "Delete Session Setting" / "Are you sure you want to delete this session setting?" / "This action cannot be undone."
  - The row is removed **optimistically**, then the API is called and the list refetched.
  - Messages: "Session setting deleted successfully!" on success. On failure, `res.data`, falling back to "Failed to delete session setting. Please try again!".
- **Create and update messages:** "Settings created successfully!" / "Settings updated successfully!". On failure, `res.data || "Action failed"`, or `err.response.data.data || "Process failed"`.
- **Socket:** `session_settings_update` for the same company refetches the list. App.js also applies the new timeout (1.9).
- **Effect of the setting:** the value becomes the idle timeout used in 1.9. When it is deactivated, the timeout goes back to 360 min.

### 1.18 Sidebar (`Layouts/Sidebar.jsx`): menu tree and visibility

**Shared definitions**

- `perms` is `user_permissions` from storage. It updates live on the socket event `updatePermissions` where `data.roleId == RoleId()`, which also rewrites storage, and on the window event `permissionsUpdated`.
- `modules` is `user.company.modules`.
- `cid` is `CompanyIdentifierRole()`.
- **Logo link:** `/<cid>/dashboard` if `CompanyId()===0`, otherwise `/<cid>/employee-attendance`.
- Only one flyout group is open at a time. The group that matches the current route opens automatically; other routes collapse the sidebar to icons.

**Branch A: `userdata.user_type === "user"` and not a SaaS admin**
- General → Dashboard (`/<cid>/dashboard`). This item has no condition.
- Packages (`/<cid>/packages`), which needs `package-list`.

**Branch B: SaaS admin** (`IsSaaSAdmin()`). These links have no prefix and no permission checks.
- Dashboard → `/saas-admin-dashboard`
- Module → `/modules`
- Package → `/packages`
- Company → `/companies`
- Users → `/saas-admin-users`
- Permission → `/permissions`
- Roles → `/saas-admin-roles`

**Branch C: company users**, in display order:

1. **My Attendance** → `/<cid>/employee-attendance`. Needs `myattendance-list`.

2. **Tasks & Projects** (flyout).
   - **Shown when:** `modules` includes `"Tasks"` **and** the user has (`tasks-list` or `project-list`).
   - **Label:** "Tasks & Projects" when the user has both, otherwise "Tasks" or "Projects".
   - **Parent click:** navigates to tasks if the user has `tasks-list`, otherwise to projects.
   - **Tasks section** (needs `tasks-list`):
     - The **"+ Add task" icon** shows only if `role_title === "Company Admin"` (exact case) **or** `is_head === "yes"`. On the tasks page it fires `openCreateTaskModal`; elsewhere it opens the global CreateTask modal, which gets `priority` and `task_owner` from `TaskServices.getDueTodayTask(companyId)`.
     - The "View all" icon goes to tasks with `state.taskFilter='due_today'`.
     - **Filters** navigate to `/<cid>/tasks` with `state.taskFilter`: `due_today` (the default when none is set), `due_in_7_days`, `delayed`, `created_by_me`, `assigned_to_me` and `pending_approval`.
   - **Projects section** (needs `project-list`):
     - Search (client-side, on `name` or `project_name`).
     - "+ Add project", with no extra role check. On the projects page it fires `openCreateProjectModal`; elsewhere it opens the global CreateProject modal.
     - "View all".
     - A list from `ProjectServices.getProjectsList(companyId)` → `res.projects`. Clicking a project navigates to projects with `state.openProjectId`.
     - The list refetches on the window event `planit:projectsUpdated`, and on socket `project_update` for the same company while the flyout is open.

3. **Leads** (flyout).
   - **Shown when:** `modules` includes `"Leads"` **and** the user has `leads-list`. The parent click navigates to `/<cid>/leads`.
   - **"+ Add lead":** on a leads page it fires `openCreateLeadModal`; elsewhere it opens the `CreateCrmLead` overlay.
   - **Items:**
     - Leads (`/leads`), Pipeline Board (`/crm-pipeline`) and Action Queue (`/crm-action-queue`). The sidebar shows these without checking `pipeline-list` or `que-list`, but the route guard still enforces them.
     - **Dashboard** (`/lead-dashboard`), which shows only when `role_title.toLowerCase() === "company admin"`.

4. **Leaves & WFH** (flyout).
   - **Shown when:** the user has any of `myleave-list`, `myteamleavesrequest-list`, `mywfh-list`, `myteamwfhrequest-list` or `hrwfhrequest-list`.
   - **Parent click:** navigates to the first page the user can open, in this order: `employee_leaves`, `leaves_team`, `employee_wfh`, `wfh_approvals`.
   - **Leaves sub-section** (needs `myleave-list` or `myteamleavesrequest-list`):
     - My Leaves (`employee_leaves`) needs `myleave-list`.
     - Team Leaves (`leaves_team`) needs `myteamleavesrequest-list`.
   - **WFH sub-section** (needs `mywfh-list`, `myteamwfhrequest-list` or `hrwfhrequest-list`):
     - My WFH (`employee_wfh`) needs `mywfh-list`.
     - Team WFH (`wfh_approvals`) needs `myteamwfhrequest-list`.
     - There is no item for `hrwfhrequest-list` here; that page is under HR.

5. **Chat** (flyout). Needs `chat-list`.
   - **Channels:** rooms with `type==="channel"` and no `parent_id`. The section has search and "+ new channel".
   - **Project Channels:** needs `project-list`. Each room with `type==="project"` is an accordion whose sub-channels are rooms with `type==="channel"` and `parent_id === project.id`. Each project has a "+" to add a channel.
   - **Inbox (DMs):** rooms with `type==="direct"`. The name is the other member's full name, or "Deleted User" when that member is missing, `is_deleted`, or has `status` 0. The section has search and "+ new DM".
   - **Sorting:** every list puts unread rooms first (`unreadCount>0`), then sorts by the latest `last_message.createdAt` or `createdAt`.
   - **Room context menu:**
     - **Mute/Unmute** calls `ChatService.muteRoom` and shows "Chat muted" or "Chat unmuted".
     - **Mark as Unread** calls `ChatService.markAsUnread` and sets `unreadCount` to at least 1 locally.
     - **Delete** shows only if `canDeleteRoom`:
       - A direct room needs `chat-delete`.
       - Other rooms: the creator (`created_by == me`) or a member whose `memberPermissions` entry has `permission === "Full edit"`.
   - **Delete confirmation:**
     - Title "Delete Conversation" or "Delete Channel".
     - Text "Are you sure you want to delete this conversation?" or `Are you sure you want to delete "<name>"?`, followed by "This action cannot be undone."
     - Deleting a direct room only **hides** it locally.
     - Deleting a channel calls `ChatService.leaveRoom({roomId, userId})`, removes the room, and closes it if it is open.

6. **Performance Evaluation** (flyout).
   - **Shown when:** the user has `Userevaluation-list` or `myevaluation-list`.
   - **Parent click:** goes to `evaluation` if the user has `Userevaluation-list`, otherwise `myevaluation`.
   - **Items:**
     - Evaluate Team (`evaluation`) and Team Evaluations (`teamevaluations`) need `Userevaluation-list`.
     - All Evaluations (`all-users-evaluations`) needs `allusers-evaluation-list`.
     - My Evaluation (`myevaluation`) needs `myevaluation-list`.

7. **Human Resource** (flyout).
   - **Shown when:** `modules` includes `"Human Resource"` **and** the user has any of `dashboard-list`, `user-list`, `hrattendance-list`, `hrleaverequest-list`, `hrwfhrequest-list` or `policy-list`.
   - **Parent click:** goes to the first page the user can open, in this order: dashboard, attendance, leaves, wfh_hr, policy.
   - **Items:**
     - Dashboard (`dashboard`) needs `dashboard-list`.
     - Attendance (`attendance`) needs `hrattendance-list`.
     - Leave Requests (`leaves`) needs `hrleaverequest-list`.
     - Work From Home (`wfh_hr`) needs `hrwfhrequest-list`.
     - Company HR Policy (`policy`) needs `policy-list`.
     - `user-list` alone shows the parent but no items under it.

8. **Activity Logs** → `/<cid>/activity-logs`. Needs `acctivitylogs-list`.

9. **Settings** → `/<cid>/settings`.
   - **Shown when:** the user has any of:
     - `leadsource-list`, `communicationsource-list`
     - `role-list`, `departments-list`, `jobstatus-list`, `user-list`
     - `leaveperiod-list`, `leavetype-list`, `holiday-list`
     - `priority-list`, `performanceperiod-list`, `weightages-list`
   - The route guard accepts more slugs than this list (`designation-list`, `pastdaysettings-list`, `ipaddress-list` and `sessionout-list`). A user with only those slugs can open `/settings` but does not see the menu item.

**Other notes**

- Company Admin is **not** exempt from sidebar permission checks. The sidebar tests `perms` literally for every item except the Lead Dashboard and the "+ Add task" rule, even though `PermissionRoute` exempts Company Admin.
- **Mobile layout (≤992 px):** the hamburger toggles the `sidebar-enable` body class, a backdrop tap closes the sidebar, and it also closes on route change.

---

## 2. Chat: Direct Messages, Channels & Project Channels

> Sources: `Screens/Chat/ChatContext.jsx` (global state and socket listeners), `ChatModal.jsx` (the floating chat window, which holds most of the logic), `Chat.jsx` (full-page chat at `/:cid/chat`, permission `chat-list`), `RoomList.jsx`, `MessageInput.jsx`, `Services/ChatService.js`.
> The success check is the same as everywhere else: the response contains `{ Good: true, ... }`.

### 2.1 Room types
| `type` | What it is | Notes |
|---|---|---|
| `direct` | 1-to-1 DM | Created or reused with `getOrCreateRoom({type:"direct", targetId})`. The name shown is the other member's name. |
| `channel` | Named group channel | `getOrCreateRoom({type:"channel", name, parent_id?})`. If `parent_id` is set, the channel is a **sub-channel** of a project room. An empty name shows *"Channel name is required"*. |
| `project` | Project channel | Created automatically by the backend when a project is created. After a `project_update` socket event with `action:"create"`, the frontend waits **2 s** and refetches the rooms. |

**Room list sections** (`RoomList.jsx`):
- **Inbox:** `direct` rooms.
- **Channels:** `channel` rooms where `parent_id == null`.
- **Projects:** `project` rooms, with their sub-channels (`channel` rooms whose `parent_id` equals the project room id) shown underneath.
- Each section has its own name search (case-insensitive substring match).
- An unread badge shows when `unreadCount > 0`.

### 2.2 API endpoints (`ChatService`)
| Action | Method + endpoint | Payload / query |
|---|---|---|
| List my rooms | `GET /chat/rooms` | Returns `rooms[]` with `_id, type, name, members[], created_by, last_message, unreadCount, is_muted, force_unread, my_visible_from, parent_id` |
| Search users (new DM / add people) | `GET /chat/search-users?query=` | An empty query returns all users |
| Mention users | `GET /user/note-mentions?company_id=` | |
| Create or get room | `POST /chat/get-or-create-room` | `{type:"direct", targetId}` or `{type:"channel", name, parent_id?}` |
| Messages (paged) | `GET /chat/messages/:roomId?page=N&after=<ISO>` | `after` = visible-from cutoff. Returns `messages[]` and `hasMore` |
| Send message | `POST /chat/send-message` | JSON `{room_id, text, parent_id, reply_to, postType}`, or **multipart** with the same fields plus `attachments` (one or more files) |
| Edit message | `POST /chat/edit-message` | `{messageId, text, keepAttachmentIds}`, or multipart with `keepAttachmentIds[]` and new `attachments` |
| Delete message | `POST /chat/delete-message` | `{messageId, deleteFor: "everyone" or "me"}` |
| React | `POST /chat/reaction` | `{messageId, emoji}` (toggles). Returns `reactions` |
| Pin / unpin | `POST /chat/toggle-pin` | `{messageId}`. Returns `is_pinned, message` |
| Pinned list | `GET /chat/pins/:roomId` | |
| Add member | `POST /chat/add-member` | `{roomId, userId}` |
| Remove member | `POST /chat/remove-member` | `{roomId, userId}` |
| Leave room | `POST /chat/leave-room` | `{roomId}` |
| Delete room | `POST /chat/delete-room` | `{roomId}` |
| Clear history | `POST /chat/clear-messages` | `{roomId}` |
| Mark read / unread | `POST /chat/mark-read`, `POST /chat/mark-unread` | `{roomId}` |
| Hide / unhide / mute | `POST /chat/hide-room`, `/chat/unhide-room`, `/chat/mute-room` | `{roomId}` |
| Post types | `GET /chat/post-types/:roomId`; `POST /chat/post-types` `{roomId, name, color, icon}`; `POST /chat/post-types/delete` | |
| Room permissions | `GET /chat/room-permissions/:roomId` | Returns `memberPermissions[] {userId, permission}` |
| Change member permission | `POST /chat/update-permission` | `{roomId, userId, permission}` |
| Invite by user or email | `POST /chat/invite` | `{roomId, userId?, email, permission}` |
| Generate invite link | `POST /chat/generate-link` | `{roomId, permission, allowedUserIds?}` |
| Accept invite | `GET /chat/accept-invite/:token` | Returns `room` |

### 2.3 Channel permission levels (per member, per channel)
| Level | What the UI allows |
|---|---|
| **Full edit** | Add or invite people, change other members' permissions, remove other members, create post types, pick a post type, send messages, and use all message actions |
| **Edit** | Send messages and **pick** a post type. The description says this level can also create post types, but the "create post type" button is only shown for Full edit |
| **Comment** | Send messages. The post-type selector is **not shown**, although the description says "existing post types" |
| **View Only** | The composer is replaced with *"You have view-only access to this channel."* Message action buttons (react, reply, pin, etc.) are hidden |

- The default is `myPermission = "Full edit"` until `getRoomPermissions` loads.
- A `roomPermissionUpdated` socket event updates the permission map live. If the event's `userId` is the current user, `myPermission` changes straight away.
- Changing the invite permission clears any invite link already generated, so a new link must be made with the new permission.

### 2.4 Membership rules
- **Remove button** for a member:
  - Never shown for the **room creator** (`created_by`).
  - With **Full edit**: shown for anyone except yourself.
  - Without Full edit: shown only for yourself, which acts as "leave".
- **Delete / hide conversation** (`canDeleteConversation`):
  - Anyone can do it on a `direct` room.
  - On a `channel` or `project` room, only the **creator** can.
- **Hide conversation** (for a DM) does all of the following:
  - adds the roomId to `localStorage.hidden_chat_rooms_<userId>`
  - stores `chat_cleared_at_<userId>_<roomId> = now`
  - calls `hide-room` and `clear-messages`
  - removes the room from the list
- **A hidden room reappears** automatically when a new message arrives in it: it is removed from the hidden list, the rooms are refetched, and only messages after the cleared time are shown.
- **Removed by someone else:** the socket `removedFromRoom` event removes the room from the list. If that room is open, it closes with *"You have been removed from this channel."*
- **Room deleted:** the socket `roomDeleted` event removes the room and closes it if it is open.
- Messages shown: *"Member added!"*, *"Member removed"*, *"Left room successfully"*, *"Room deleted"*, and on failure *"Failed to ..."*.

### 2.5 Sending messages
- **Composer:** `Enter` sends and `Shift+Enter` adds a new line. The Send button is disabled when `text.trim()` is empty **and** there are no attachments.
- **Optimistic sending:**
  1. A temporary message is added immediately (`_id: "temp-<timestamp>"`, `isSending: true`).
  2. Messages go out through a **one-at-a-time queue**, which keeps them in order.
  3. On success the temporary message is replaced by the server message. On failure it is marked `isFailed: true`.
- **Mentions:**
  - Typing `@` opens a picker of room members.
  - Before sending, each plain `@Full Name` is converted to the format `@[Full Name](userId)`. Longer names are matched first, so shorter names inside them are not matched by mistake.
  - Messages are displayed by parsing the regex `/@\[([^\]]+)\]\((\d+)\)/`.
- **Reply:** send `reply_to` (the parent message id). The reply preview shows the parent's text or attachment name.
- **Post type** (channels only, and only for Full edit or Edit): an optional tag sent as `postType`. The defaults are Announcement, Discussion, Idea and Update, and custom types have a name, color and icon.
- **Attachments:**
  - Added with the file picker, drag-and-drop, or paste.
  - Each attachment is shown as image, video, audio or file based on `file.type` (audio also matches the extensions `mp3|wav|webm|m4a|ogg`).
  - Images of **300 KB or more** are compressed on the device before upload: resized to at most **1920px** wide, saved as JPEG at 0.85 quality, and kept only if the result is smaller.
- **Voice notes:**
  - Recorded with `getUserMedia({audio:true})` as `audio/webm`, file name `voice-note-<ts>.webm`, sent as an attachment.
  - Recording can be paused, resumed or cancelled, and a timer shows `m:ss`.
  - If microphone access is refused: *"Microphone access denied"*.
- **Forward:**
  - Send the message to another room with `is_forwarded: true` and `forwarded_from_name`.
  - Attachments are downloaded again (using the `authToken` header) and uploaded again.
  - Each target room can only be sent once per forward dialog.
- **Typing indicator:**
  - Emit `typing {room_id, user_id, user_name, isTyping}` while the user types.
  - After **3 s** with no typing, `isTyping:false` is sent automatically. It is also sent when the message is sent.
  - The app ignores typing events from the current user.

### 2.6 Editing, deleting & other message actions
- **Edit:**
  - Only **your own** messages, only within **1 hour** of `createdAt`, and **not voice notes**.
  - You can keep or remove existing attachments and add new ones.
  - The edited message gets `is_edited: true`.
- **Delete:**
  - Only **your own** messages, within **1 hour**.
  - Scope is `everyone` (the default) or `me`.
  - A confirmation modal is shown first.
  - Messages: *"Message deleted for everyone"* or *"Message removed for you"*.
- **Pin / unpin:** has a pinned-messages panel. Messages: *"Message pinned"* / *"Message unpinned"*.
- **Reactions:** toggling an emoji makes the server return the full `reactions` list.
- **No actions** are shown on a message while it is sending or after it failed, or when the user is View Only.
- **Clear chat history:** `clear-messages`, then emit `chatCleared`, which empties everyone's open view. Message: *"Chat history cleared"*.

### 2.7 Loading messages & the visible-from cutoff
- Page 1 loads when a room opens, and older pages load as the user scrolls up, while `hasMore === true`.
- **visibleFrom** is the local `chat_cleared_at_<uid>_<roomId>` if set, otherwise the server's `my_visible_from`.
  - It is sent as the `after` value.
  - Messages older than it are **also removed on the device**, including new messages arriving by socket.
- **Opening a room:**
  1. emit `joinChatRoom`
  2. `POST mark-read`
  3. emit `messagesRead {room_id, user_id}`
  4. set that room's `unreadCount` to 0
  5. load post types, room permissions and mention users

### 2.8 Unread counts, delivery & read receipts
- **New message (`receiveChatMessage`):**
  - If the room is **not open**, its `unreadCount` goes up by 1 and `last_message` is updated.
  - If the room is open and visible, `unreadCount` stays 0.
  - The receiver emits `messageDelivered {messageId, senderId, roomId}`. The sender gets `messageDelivered` back and marks the message `isDelivered`.
- **Read receipts:** when another user emits `messagesRead` for the open room, all of your own messages in it are marked read.
- **Merging with the server:** when the room list is refetched, each room keeps `max(server unreadCount, local unreadCount)`.
- **Room settings over socket (`chatRoomSettingUpdated`):**
  - `mute` sets `is_muted`
  - `force_unread` makes the count at least 1 (manual "mark as unread")
  - `clear_unread` sets the count to 0

### 2.9 Notifications
- For messages from **other users** in rooms that are **not muted**:
  - Play a sound.
  - If the room is not currently open, show a **system (OS) notification** that closes itself after 8 s.
    - The title is the sender name for a DM, or `Sender · # channel` for a channel or project.
    - The body is the preview text: text, *"🎤 Voice message"*, or *"📎 <file name>"*.
  - Also dispatch an in-app `chatNotification` event. It includes `isMention = true` when the current user's id is in `data.mentions`.
- **Clicking a notification** opens that room. If the user is not logged in or is on a login page, the room id is saved in `localStorage.planit_pending_notif_room` and opened after login.
- Browser notification permission is requested on the user's **first click or key press**.

### 2.10 Invites
- **Direct invite:**
  - Pick users (sends one `invite` call per user, with their email) **or** enter an email, and choose a permission.
  - Nothing is sent if neither a user nor an email is given.
  - Messages: *"Invitation sent!"* / *"Failed to send invitation"*.
- **Invite link:**
  - Link type is **All Users** (anyone with the link can join) or **Selected Users Only** (sends `allowedUserIds`).
  - Choosing "Selected" with no users picked shows *"Please select users first to generate a restricted link"*.
  - The link format is `<origin>/?chat_invite=<token>`. Message: *"Invite link copied!"*
- **Accepting an invite:**
  - The `chat_invite` token from the URL is saved (`planit_pending_chat_invite`) and processed after login with `GET accept-invite/:token`.
  - On success the app adds or replaces the room, joins it, opens it, shows *"You've joined "<name>"!"*, and refreshes the rooms after 1.5 s.
  - On failure it shows the server message, or *"Invalid or expired invitation"*.

### 2.11 Online presence & reconnect
- **On connect**, emit `registerUser(userId)` and `getOnlineUsers`, then join every room (`joinChatRoom`).
- **Presence events:** `userOnline` / `userOffline` / `onlineUsers` / `onlineUsersList` keep the set of online user ids up to date. The payload can be one id, an object, or an array.
- **On socket reconnect**, register again, join every room again, and refetch the rooms (merging unread counts).
- **New room created for me** (`newRoom`): join it and add it to the top of the list, unless it is hidden.

### 2.12 Socket events summary
| Direction | Event | Payload / effect |
|---|---|---|
| emit | `registerUser` | `userId` |
| emit | `getOnlineUsers` | none |
| emit | `joinChatRoom` | `roomId` |
| emit | `typing` | `{room_id, user_id, user_name, isTyping}` |
| emit | `messagesRead` | `{room_id, user_id}` |
| emit | `messageDelivered` | `{messageId, senderId, roomId}` |
| emit (after REST success) | `messageUpdated`, `messageDeleted`, `messagePinned`, `messageReaction`, `memberJoined`, `userLeftRoom`, `roomDeleted`, `chatCleared` | Relay to other members |
| listen | `receiveChatMessage` | Message object (`room_id, sender_id, sender_name, sender_image, text, attachments, mentions, type`) |
| listen | `newRoom`, `roomDeleted`, `removedFromRoom`, `userLeftRoom`, `memberJoined` | Room and membership changes |
| listen | `messageUpdated`, `messageDeleted`, `messagePinned`, `messageReaction`, `messageDelivered`, `messagesRead`, `chatCleared` | Message changes |
| listen | `roomPermissionUpdated`, `chatRoomSettingUpdated` | Permissions, mute and unread |
| listen | `userOnline`, `userOffline`, `onlineUsers`, `onlineUsersList`, `typing` / `userTyping` | Presence and typing |
| listen | `project_update` (`action:"create"`) | Refetch rooms after 2 s |

### 2.13 Image URLs
If `image` starts with `http`, use it as is. If it contains `/`, use `<server>/public/<path>`. Otherwise use `REACT_APP_USER_DOCS_PATH` (or `<server>/public/users/docs/`) followed by the file name. Protected files must be fetched with the `authToken` header.

### 2.14 Local storage keys used by chat
`hidden_chat_rooms_<userId>` (JSON array of room ids), `chat_cleared_at_<userId>_<roomId>` (ISO time), `planit_pending_chat_invite`, `planit_pending_notif_room`.
