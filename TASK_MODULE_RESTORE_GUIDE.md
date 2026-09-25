# Task Module — Disable / Restore Guide

> Status: **Task module disabled for Chat-only delivery.**
> Nothing was deleted. Every disabled line/block is preserved either as a
> comment or as an intact, unreferenced file, so the Task module can be
> restored without rebuilding it.

This guide documents exactly what changed, what was intentionally kept because
Chat depends on it, and the ordered steps to bring the Task module back.

Convention used everywhere: blocks are marked with a `TASK MODULE DISABLED`
comment. Original code is preserved verbatim underneath (commented or
unreferenced). Search the repo for `TASK MODULE DISABLED` to find every site.

---

## 1. What was commented out / disabled

### 1.1 Tasks screen
- **`src/app/(tabs)/tasks.tsx`** — the entire original `TasksScreen`
  implementation is preserved *commented out line-by-line* between the markers
  `// >>> TASK_SCREEN_ORIGINAL_START` and `// >>> TASK_SCREEN_ORIGINAL_END`.
  A tiny inert placeholder default export (`TasksPlaceholder`) keeps Expo
  Router happy (every route file needs a default export). It renders nothing
  and is unreachable from the UI.

### 1.2 Task tab & navigation
- **`src/components/CustomTabBar.tsx`** — the `tasks` entry in `TABS` and the
  `TaskBlackIcon` / `TaskWhiteIcon` destructure are commented out.
- **`src/app/(tabs)/_layout.tsx`** — the `tasks` header config
  (`HEADER_CONFIGS.tasks`), the `<Tabs.Screen name="tasks" />` registration, and
  the Tasks-only compact-search-on-scroll logic are commented out. The layout
  now defaults to `chat` and uses `initialRouteName="chat"`.
- **`src/app/(tabs)/_layout.tsx` (tab bar)** — for the single-module build the
  bottom tab bar is hidden: the `CustomTabBar` import and the
  `tabBar={(props) => <CustomTabBar {...props} />}` prop are commented out, and
  `tabBarStyle: { display: "none" }` was added to `screenOptions` to suppress
  the default React Navigation tab bar that would otherwise appear. The
  `CustomTabBar.tsx` component itself is left intact (unreferenced).
- **`src/app/_layout.tsx`** — `TaskProvider` is no longer mounted (import and
  JSX wrapper commented out). The authenticated redirect target changed from
  `/(tabs)/tasks` to `/(tabs)/chat`.
- **`src/app/index.tsx`** — post-splash authenticated redirect changed from
  `/(tabs)/tasks` to `/(tabs)/chat`.
- **`src/app/(auth)/login.tsx`** — post-biometric redirect changed from
  `/(tabs)/tasks` to `/(tabs)/chat`.

### 1.3 Chat ↔ Task coupling
- **`src/app/(tabs)/chat.tsx`** — the `useTasks` import and `taskState` are
  commented out, and the "From task owners" loop that merged TaskContext
  `taskOwners` into the Add-People default contact list is commented out. Chat
  now builds its contact list from room members only.

### 1.4 Task notifications (app-side)
- **`src/components/headerapp.tsx`** (shared header used by Chat) — the
  `viewTask`, `NotificationItem` and `TaskDetailModal` imports, the
  `selectedTask` state, the `handleNotificationPress` task handler, the
  `onNotificationPress` prop passed to `InboxModal`, and the `<TaskDetailModal>`
  render are commented out. Chat notifications in the popup are still handled
  inside `InboxModal` and are unaffected.
- **`src/app/notifications.tsx`** (full Inbox screen) — the `viewTask` and
  `TaskDetailModal` imports, the `selectedTask` state, the task branch in
  `handleItemPress`, the `<TaskDetailModal>` render, and now-unused `companyId`
  in the callback deps are commented out. Chat notification taps are unchanged.
- **`src/context/NotificationContext.tsx`** — the `task_update` socket listener
  that generated local `task_mention` in-app notifications/toasts (and the
  `TaskUpdatePayload`, `chatHelpers`, `showInfo` imports plus the
  `cleanupTaskUpdate()` call) are commented out. The chat `notification`
  listener is untouched.
- **`src/context/PushNotificationContext.tsx`** — added a guard that ignores any
  `task` / `tasks` / `lead` push payload (or any payload carrying `task_id`)
  so stale/Task pushes never navigate to the removed Tasks screen. The original
  task navigation handlers are **preserved in place** (unreachable while the
  guard exists). No Task notification is redirected to Chat.

### 1.5 Task push notification generation
- Client-side Task push **generation** was only the `task_update` →
  `task_mention` local notification in `NotificationContext.tsx` (disabled, see
  above). Task/Lead push **sending** itself is done by the **backend**; the app
  only registers for push. There is no app-side "send task push" call, so no
  further client change was needed. See §7 (Backend) for the production note.

---

## 2. Files changed

| # | File | Change |
|---|------|--------|
| 1 | `src/app/(tabs)/tasks.tsx` | Entire screen commented out + placeholder export |
| 2 | `src/app/(tabs)/_layout.tsx` | Tasks tab/header removed, default = chat; bottom tab bar hidden |
| 3 | `src/app/_layout.tsx` | `TaskProvider` unmounted, redirect → chat |
| 4 | `src/app/index.tsx` | Splash redirect → chat |
| 5 | `src/app/(auth)/login.tsx` | Biometric redirect → chat |
| 6 | `src/components/CustomTabBar.tsx` | Tasks tab + icons removed (component now unreferenced; file kept) |
| 7 | `src/app/(tabs)/chat.tsx` | Removed `useTasks` / task-owner contact merge |
| 8 | `src/components/headerapp.tsx` | Removed task-notification detail opening |
| 9 | `src/app/notifications.tsx` | Removed task-notification detail opening |
| 10 | `src/context/NotificationContext.tsx` | Disabled `task_update` mention generation |
| 11 | `src/context/PushNotificationContext.tsx` | Added stale Task-push navigation guard |

New file: `TASK_MODULE_RESTORE_GUIDE.md` (this document).

---

## 3. Intentionally kept (not commented out)

These are **not** Task UI/entry points, and removing them would either break
Chat/Auth/Notifications or break type-checking. They are deliberately left
intact (unreferenced by the Chat runtime = not bundled by Metro).

### 3.1 Kept because Chat / shared features depend on them
| File | Why kept |
|------|----------|
| `src/context/SearchContext.tsx` | Shared search text used by Chat + header. |
| `src/components/FilterModal.tsx` | Shared by `notifications.tsx` and `leaves.tsx`. |
| `src/components/InboxModal.tsx` | Shared notification popup used by the header. Its task branch is inert because the header no longer passes `onNotificationPress`. |
| `src/components/DynamicTable.tsx` | Shared by `leaves.tsx`. |
| `src/utils/chatHelpers.ts` | Shared chat helpers (`getRoomDisplayName`, etc.). |
| `src/services/socket/socketService.ts` | Shared socket layer incl. chat; Task types/`task_update` event signature retained. |
| `src/context/AuthContext.tsx` | Auth is shared. `hasAdvancedTaskModule` is retained (it only feeds the disabled Create-Task flow and does not affect Chat). |

### 3.2 Kept intact (preserved, currently unreferenced)
These files are untouched so restoration is copy-free and type-checking of
disabled Project-module / debug code keeps working:

- `src/context/TaskContext.tsx`
- `src/hooks/useTasks.ts`
- `src/hooks/useTaskSocket.ts`
- `src/services/api/tasks.service.ts`
- `src/types/task.types.ts`
- `src/utils/statusMapper.ts`
- `src/components/CustomTabBar.tsx` — the whole component file is kept intact;
  only its import/usage in `(tabs)/_layout.tsx` is commented out while the app
  ships a single module.
- Task components: `TaskTable.tsx`, `TaskRow.tsx`, `TaskTableSkeleton.tsx`,
  `SingleTaskTable.tsx`, `CreateTaskModal.tsx`, `TaskDetailModal.tsx`,
  `RejectTaskModal.tsx`, `CriticalTaskModal.tsx`, `DependencyModal.tsx`,
  `AssignTaskProjectModal.tsx`, `taskdelay.tsx`, `TaskRefreshHeader.tsx`,
  `StatCard.tsx`, `AnimatedFAB.tsx`
- Task-only helpers in `src/utils/permissions.ts` (`canCreateTask`,
  `canViewTasks`, `canEditTask`, `canEditStatus`, `canDeleteTask`,
  `canReassignTask`, `canApproveReject`, `canCreateSubtask`). The chat
  permission helpers in the same file are used by Chat and remain active.
- Project-module files that still import Task code (`ProjectDetailModal.tsx`,
  `ProjectQuickMenuModal.tsx`, `CreateProjectModal.tsx`, etc.) — the Project
  module was already disabled before this change; they still compile because
  the Task files above remain.

### 3.3 Not touched (known leftover references)
- `scripts/generate-store-screenshots.js` still lists a `tasks` screenshot.
- `README.md` / `PROJECT.md` still describe the Tasks screen.
These are docs/tooling, not app runtime, and were left unchanged.

---

## 4. Navigation / routes / API / state changes summary

- **Default authenticated destination:** `/(tabs)/tasks` → `/(tabs)/chat`
  (root layout, splash, login).
- **Tab bar:** hidden entirely for the single-module build
  (`tabBarStyle: { display: "none" }`; `CustomTabBar` import/`tabBar` prop
  commented out). `chat` is the only screen (`tasks` removed; `leaves` was
  already disabled).
- **Tabs initial route:** `chat`.
- **Root providers:** `TaskProvider` removed from the tree. `TaskContext` still
  exists but is not provided anywhere.
- **Chat contact list:** no longer reads `TaskContext.taskOwners`.
- **Task API calls on startup:** none. Previously `TasksScreen` called
  `fetchAllTasks` on mount; with the screen gone, no `/tasks/*` calls are made
  by the app during normal Chat use.
- **Task socket syncing:** `useTaskSocket` is no longer mounted (only the Tasks
  screen used it).
- **Task notification generation:** disabled (`task_update` mention listener).
- **Task push navigation:** guarded/no-op (never navigates to Tasks).
- **Chat/Socket.IO/Auth:** unchanged.
- **Layout spacing (not adjusted):** Chat's scroll `paddingBottom: 80` and the
  FAB `bottom: 92` were sized around the floating tab bar. They were left
  unchanged to avoid unrelated visual edits; lower them if the FAB looks too
  high once the bar is hidden.

---

## 5. Exact steps to restore the Task module

Restore in this order (later steps depend on earlier ones).

### Step 1 — Restore the Tasks screen
In `src/app/(tabs)/tasks.tsx`:
1. Delete the inert `TasksPlaceholder` export (from
   `// >>> TASK_SCREEN_ORIGINAL_END` to the end of the file).
2. Remove the leading `// ` from every line between
   `// >>> TASK_SCREEN_ORIGINAL_START` and
   `// >>> TASK_SCREEN_ORIGINAL_END` (and the `//` before the start marker
   itself when you delete the header).
3. Remove the `TASK MODULE DISABLED` header comment block.
4. Confirm the file again has `export default function TasksScreen() { ... }`.

> Tip: the block is a pure line-comment wrap, so a scripted
> "remove first `// ` per line" over the marked region is safe.

### Step 2 — Re-enable Task navigation (order: provider → tab → redirects)
1. **`src/app/_layout.tsx`**
   - Uncomment `import { TaskProvider } from "@/context/TaskContext";`
   - Uncomment the `<TaskProvider>` opening and closing wrappers in
     `RootLayout()` (keep the `ChatProvider`/`NotificationProvider` nesting
     exactly as it is inside them).
   - Optionally change the authenticated redirect back from `/(tabs)/chat` to
     `/(tabs)/tasks`.
2. **`src/app/(tabs)/_layout.tsx`**
   - Uncomment the `# TASK MODULE DISABLED` `tasks` entry in `HEADER_CONFIGS`.
   - Restore the `useSearch` import and the `const { isHeaderCompact } = useSearch();`
     line, and uncomment the `forceSearchOpen` block.
   - Uncomment `<Tabs.Screen name="tasks" />`.
   - Remove `initialRouteName="chat"` if you want Tasks to be the default tab
     (or leave it if Chat should stay the landing tab).
   - **Re-show the bottom tab bar (CHAT-ONLY):** remove
     `tabBarStyle: { display: "none" }` from `screenOptions`, uncomment the
     `import CustomTabBar from "@/components/CustomTabBar";` line, and
     uncomment `tabBar={(props) => <CustomTabBar {...props} />}`.
3. **`src/components/CustomTabBar.tsx`**
   - Uncomment the `TaskBlackIcon` / `TaskWhiteIcon` destructure entries.
   - Uncomment the `tasks` entry in `TABS` (place it before `chat` to restore
     the original order).
4. **`src/app/index.tsx`** and **`src/app/(auth)/login.tsx`** — optionally
   change `/(tabs)/chat` redirects back to `/(tabs)/tasks`.

**Important ordering:** `TaskProvider` must be mounted (Step 2.1) before any
component that calls `useTasks()` is active, otherwise `useTasks()` throws
"useTasks must be used within a TaskProvider".

### Step 3 — Restore Chat's task-owner contact list (optional)
In `src/app/(tabs)/chat.tsx`:
1. Uncomment `import { useTasks } from "@/hooks/useTasks";`
2. Uncomment `const { state: taskState } = useTasks();`
3. Uncomment the "From task owners" loop in `defaultMemberList` and re-add
   `taskState?.taskOwners` to that `useMemo` dependency array.

### Step 4 — Restore task notifications
1. **`src/components/headerapp.tsx`**
   - Uncomment the `viewTask`, `NotificationItem`, and `TaskDetailModal` imports.
   - Uncomment `selectedTask` state and `handleNotificationPress`.
   - Uncomment the `onNotificationPress={handleNotificationPress}` prop and the
     `<TaskDetailModal>` render.
2. **`src/app/notifications.tsx`**
   - Uncomment the `viewTask` + `TaskDetailModal` imports, `selectedTask` state,
     the `handleItemPress` task branch, and the `<TaskDetailModal>` render.
   - Re-add `companyId` to the `handleItemPress` dependency array (it is
     preserved in the comment there).
3. **`src/context/NotificationContext.tsx`**
   - Uncomment the `TaskUpdatePayload` import, the `chatHelpers` import
     (`extractMentionedUserIds`, `mentionMarkupToDisplay`) and the `showInfo`
     import.
   - Uncomment the entire `cleanupTaskUpdate = onSocketEvent("task_update", ...)`
     block and the `cleanupTaskUpdate();` call in the effect cleanup.
4. **`src/context/PushNotificationContext.tsx`**
   - Remove the `TASK_PUSH_TYPES` guard block in `handleNotificationTap`.
   - Optionally restore the `if (!data)` and default-case fallbacks from
     `/(tabs)/chat` back to `/(tabs)/tasks`.

### Step 5 — Verify
```bash
npx tsc --noEmit
npx expo lint
npx expo start
```
Then confirm: Tasks tab appears, task list loads, task create/detail/status
flows work, task notifications open details, and Chat still works.

---

## 6. Dependencies / ordering rules when uncommenting

- **Provider before consumers:** mount `TaskProvider` before re-enabling
  `useTasks()` consumers (`TasksScreen`, `chat.tsx`, any task modal).
- **`(tabs)/tasks.tsx` default export:** Expo Router requires exactly one
  default export per route. Remove `TasksPlaceholder` *before* uncommenting the
  real `export default function TasksScreen`.
- **`Layout` redirects vs. screen registration:** restoring redirects to
  `/(tabs)/tasks` before re-registering `<Tabs.Screen name="tasks" />` is fine
  (the route file already exists), but the tab will not be visible until
  `CustomTabBar`'s `TABS` is restored.
- **Notification deps:** when re-adding the task branch in `notifications.tsx`,
  re-add `companyId` to the `useCallback` deps or you get a stale-closure bug.
- **Chat contact list:** only restore the task-owner merge after `TaskProvider`
  is mounted, or Chat will crash on `useTasks()`.
- **Do not remove** `src/context/TaskContext.tsx`, `tasks.service.ts`,
  `statusMapper.ts`, `types/task.types.ts`, or the task component files — they
  are the preserved implementation and are also imported (type-only) by the
  still-present Project-module code.

---

## 7. Backend note (Task push sending)

Disabling Task/Lead push **sending** happens on the server (the app does not
generate those pushes). To fully stop delivery for the Chat-only release, the
backend must stop scheduling/emitting Task and Lead push notifications. The
client change here is a defensive guard only: if a stale Task push still
arrives (e.g. queued before the backend change), the app logs a warning and
does **not** navigate anywhere, so it cannot land on the removed Tasks screen.
Chat pushes are untouched.

---

## 8. Intentionally NOT done (to avoid breaking shared functionality)

- `InboxModal.tsx` and its `NotificationItem.task_id` handling were left as-is;
  the task branch simply no longer receives a handler from the header.
- `FilterModal`, `DynamicTable`, `SearchContext`, `socketService`,
  `AuthContext`, and all Chat/project/leave code were not modified beyond the
  comment-outs listed above.
- No Task file was deleted; no Chat/Auth/Socket/Notification behavior was
  changed other than the specifically listed task branches.
