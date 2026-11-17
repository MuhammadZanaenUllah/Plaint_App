# Branch Integration Report — `main` → `taskchatbugs` (TaskChatBugs)

> Status: **PLANNED** (pre-merge). This document is updated continuously throughout the integration.

---

## A. Integration Overview

| Item | Value |
|---|---|
| Source branch | `main` (`origin/main` @ `a937ae7`, 2026-11-16) |
| Target branch | `TaskChatBugs` (`origin/TaskChatBugs` @ `ebaf5dc`, 2026-11-13) |
| Common ancestor (merge base) | `4a17a6b` (2026-10-14) "refactor: remove media library permission requests and block Android storage permissions to comply with Play policy" |
| Commits unique to `main` | 7 |
| Commits unique to `TaskChatBugs` | 42 |
| Local/remote sync | Both local branches in sync with `origin`; working tree clean at inspection time |
| Integration objective | Merge all compatible production fixes from `main` into `TaskChatBugs` while preserving the Chat fixes, the complete Task module, and the ACTIVE Project module of `TaskChatBugs`, plus the native Android / push-notification integration from `main`. |
| Strategy | Normal (non-fast-forward, non-squash) merge of `origin/main` into `TaskChatBugs`, with manual conflict resolution and post-merge implementation. No history rewriting. |

### Commits unique to `main` (7)

| Commit | Subject | Area |
|---|---|---|
| `4397ee4` | fixed notification grouping | Native patch + package.json autolinking (expo-notifications) |
| `bd630a3` | fixed voice note issue | Chat voice-note duration resolution (types/helpers/UI) |
| `3343d3e` | fixed keyboard hiding, images preview and documents below text | Conversation screen + MediaComposerModal |
| `d0ea29a` | changes | chat.types.ts + chatHelpers.ts additions |
| `9d5f298` | fixed attachment not sent with forwarded message, redesigned forward modal, fixed loader issue | conversation.tsx forward flow rewrite |
| `8754011` | fixed notification grouping issue with backend | Native patch update + JS notification grouping (roomOpened/roomClosed, token retry, auth-failure handling) |
| `a937ae7` | fixed channel notifications grouping | Native patch update (final version) |

### Commits unique to `TaskChatBugs` (42) — summary

- Full Task module development (phases 1–11 + audits f2–f7): `src/features/tasks/**` (screens, components, hooks, stores (Zustand), socket bridge, APIs, permissions, utils), task tests (`tests/task-logic/**`), `src/features/tasks/store/**`.
- Full Project module development (phase 8, p4): `src/features/projects/**`, project routes `src/app/projects/index.tsx` + `[id].tsx`, project permissions, sprints, stores.
- Module activation: Task module re-enabled in `src/app/_layout.tsx` (TaskProvider mounted, default tab tasks), Projects linked from chat tab and authenticated screens list.
- Chat improvements: project channels grouped under projects in chat list, project chip, task owners merged into contact list, consistent close buttons (`ModalCloseButton`), toast copy consistency, `AppToast` with toastConfig.
- Task/chat bug fixes: completed-tab performance, dropdown/status handling, comment delete, dependency table, keyboard avoiding in filter modal, error normalization.
- `android/` folder committed (prebuild output) for local/EAS builds: `b47aacf android folder`.
- `eas.json` / `app.json` adjustments: `runtimeVersion` fixed to `1.0.0`; dev/preview env URLs switched to `https://backend-planit.soulservices.com`.
- Dev tooling: `zustand`, `tsx`, `@types/node`, `test:tasks` script, `scripts/verify-task-module.mjs`.

---

## B. Changes Found in `main`

### B.1 Chat fixes
- **Voice note duration resolution** (`bd630a3`, `d0ea29a`): new `src/utils/voiceNoteDuration.ts` (metadata probe + cache + subscription); extended `MessageAttachment`/`RoomLastMessage` types with `originalName`, `type`, `mimeType`, `fileType`, `duration*` fields (`src/types/chat.types.ts`); `chatHelpers.ts` gained `isVideoAttachment`, ambiguity-safe `isAudioAttachment` (`.webm` handling), and backend-duration-preferring `getVoiceNoteSecondsFromAttachment`; chat list resolves website `.webm` voice-note durations in batches of 3 and subscribes to live resolution (`src/app/(tabs)/chat.tsx`); conversation screen voice-note bubbles resolve/probe durations (`src/app/conversation.tsx`).
- **Keyboard hiding / images preview / documents below text** (`3343d3e`): `MediaComposerModal.tsx` restructured (crop view + `KeyboardAvoidingView` behavior `height` on Android); conversation attachment rendering fixes (`decodeAttachmentName` usage, video/document preview handling).
- **Forwarded-message attachment fix + forward modal redesign** (`9d5f298`): attachments now downloaded once per session and forwarded correctly; redesigned sectioned forward room picker with search + per-room send status; loader fix.
- **Notification grouping (JS side)** (`8754011`): `ChatContext.markReadAction` captures `beforeTime` and calls `markRoomReadNotification`; `clear_unread` socket event also clears native room notifications; `src/utils/planitNotificationBridge.ts` (new) bridges to the patched native module; `socketService` emits `roomOpened`/`roomClosed` so the backend suppresses pushes for the room being viewed; token re-handshake on reconnect; `setSocketAuthFailureHandler` for unauthenticated socket errors.
- **Voice note playback fixes in conversation** (`bd630a3`).

### B.2 Shared application fixes
- **Auth failure handling** (`src/context/AuthContext.tsx`): on 401/unauthenticated socket errors, clear biometric session + stored auth before logout to avoid restore loops; socket auth-failure handler registered/unregistered.
- **Push token registration hardening** (`src/context/PushNotificationContext.tsx`): retry Expo push token fetch up to 3 times (FCM `SERVICE_NOT_AVAILABLE`); return `null` (instead of token) when backend device registration fails so the lifecycle retries on next foreground.
- **Push lifecycle** (`src/app/_layout.tsx`): `registerCompany` callback with dedup guard (`registeredCompanyRef` + `registeringCompanyRef`); foreground retry when registration previously failed.

### B.3 Native Android changes (via patch-package)
- **`patches/expo-notifications+57.0.15.patch`** (new; iterated in `4397ee4` → `8754011` → `a937ae7`): patches `node_modules/expo-notifications` native source —
  - Adds `PlanitChatNotification.kt` (per-room/sender chat-notification aggregation with group summary `pk.planit.CHAT_NOTIFICATIONS`) and `PlanitNotificationModule.kt` (native `markRoomRead` for clearing a room's notifications).
  - Modifies `ExpoNotificationBuilder.kt`, `ExpoFirebaseMessagingService.kt`, `ExpoPresentationDelegate.kt`, `FirebaseMessagingDelegate.kt` for grouping/aggregation behavior and auto-cancel behavior.
  - Modifies library `AndroidManifest.xml` and registers `PlanitNotificationModule` in `expo-module.config.json`.

### B.4 Build configuration changes
- **`package.json`**: added
  ```json
  "expo": { "autolinking": { "android": { "buildFromSource": ["expo-notifications"] } } }
  ```
  This is REQUIRED for the native patch to be compiled into the Android build (otherwise the prebuilt AAR is used and the patch has no effect).

### B.5 Other
- `src/types/push.types.ts`: extended `PushNotificationData` with chat sender aggregation + task event metadata fields.

---

## C. Changes Found in `TaskChatBugs` (must be preserved)

### C.1 Chat improvements
- Project channels visible in the chat list and grouped under their parent project room (expandable/collapsible) in the Channels tab (`src/app/(tabs)/chat.tsx`).
- Projects chip in chat header navigating to `/projects` (permission-gated by `canViewProjects` from `@/features/projects/permissions/projectPermissions`).
- Task owners merged into the contact list (`useTasks`).
- Consistent modal close buttons via `src/components/ModalCloseButton.tsx` (AttachmentModal, PinnedMessagesModal, forward modal headers in `conversation.tsx`).
- `AppToast` + `toastConfig` wired in `_layout.tsx`; toast copy consistency pass across chat screens (tap-to-reveal detailed message).
- Unread chip counts now include project rooms.

### C.2 Task module implementation (complete)
- `src/features/tasks/**`: screens (`TasksScreen`), API layer (`taskApi`, `taskAttachmentsApi`, `taskDependenciesApi`, `taskNotesApi`), hooks (dashboard, actions, deep link, delayed popup, socket sync, filters, tabs, stats), stores (Zustand `tasksStore`, `taskFiltersStore`, `taskUiStore`, `taskProjectAssignment`), socket bridge (`taskSocketBridge`, `scheduleBatcher`), permissions (`taskPermissions`), types, utils, constants.
- `src/context/TaskContext.tsx` refactored (~1166 lines changed), `src/app/(tabs)/tasks.tsx` reduced to a thin host, `src/components/TaskDetailModal.tsx`/`SingleTaskTable.tsx`/`CreateTaskModal.tsx` modularized into `src/features/tasks/components/**`.
- Task socket synchronization, notification-based hydration, sprint management, ATS (approval/status) workflows, delayed alerts.
- `tests/task-logic/*.test.ts` + `scripts/verify-task-module.mjs` + `npm run test:tasks`.

### C.3 Project module implementation (complete + ACTIVE)
- `src/features/projects/**`: `ProjectsScreen`, `ProjectDetailScreen`, projects/sprints APIs, `projectsStore`, project permissions, validation, status/sort utils, project pickers, CreateProjectModal, CreateSprintModal, sprint hooks.
- Routes: `src/app/projects/index.tsx`, `src/app/projects/[id].tsx`.
- Activated in `_layout.tsx` (authenticated screens list includes `projects`), chat tab chip, project channels enabled in chat list.

### C.4 Module activation state (critical)
- `src/app/_layout.tsx`: `TaskProvider` mounted; default redirect `/(tabs)/tasks`; `Task` tab present in `src/app/(tabs)/_layout.tsx`; project routes accessible.
- `src/context/PushNotificationContext.tsx`: task push types route to `/(tabs)/tasks` (with `taskId` param); leads fall back to `/notifications`.
- `src/context/AuthContext.tsx`: company modules refresh via `getCompanyModules` + socket events (`modules_update`, `packages_update`, `companies_update`), `Advanced Task Scheduling` flag; task stores reset on logout/login.

### C.5 Native / Android
- `android/` folder committed (Expo prebuild output, package `pk.planit`, google-services.json, debug/debugOptimized manifests with cleartext for dev, prebuild splash/notification resources).

### C.6 Build/config changes
- `package.json`: `zustand` dep; `@types/node`, `tsx` devDeps; `test:tasks` script.
- `app.json`: `runtimeVersion` → `"1.0.0"` (fixed) instead of `{ "policy": "appVersion" }`.
- `eas.json`: dev+preview env URLs → `https://backend-planit.soulservices.com` (main still uses `https://backend.planit.pk`).
- `tsconfig.json` (+1 line), `.easignore`, `.env.example`, `.gitignore` adjustments.

---

## D. Conflict and Overlap Register

| File/Area | Change in main | Change in taskchatbugs | Conflict/Risk | Recommended Decision | Status |
|---|---|---|---|---|---|
| `package.json` | `expo.autolinking.android.buildFromSource: ["expo-notifications"]` | `zustand` dep, `tsx`/`@types/node` devDeps, `test:tasks` script | LOW (auto-merged cleanly) | Keep both sets | Auto-merged ✓ |
| `src/context/AuthContext.tsx` (imports) | `setSocketAuthFailureHandler` + `removeBiometricSession`; `getModules` retained | `getCompanyModules` replaces `getModules`; `resetTaskStores`; modules socket refresh | **GIT CONFLICT** (import block). `getModules` is unused in TCB's refactored body | Keep TCB's `getCompanyModules`; add main's `setSocketAuthFailureHandler`; drop unused `getModules` | Planned: combine |
| `src/context/AuthContext.tsx` (auth-failure effect) | Full auth-failure cleanup (clear biometric session, invalidate token cache, logout) + socket failure handler | (unchanged original handler; added `refreshCompanyModules` after it) | Auto-merged cleanly — both present | Keep main's `handleAuthFailure` + TCB's module refresh | Auto-merged ✓ |
| `src/app/_layout.tsx` | Push lifecycle: `registerCompany` dedup + foreground retry | TaskProvider mounted, `projects` route, default `/tasks`, Toast config | Auto-merged cleanly (disjoint regions) | Keep both | Auto-merged ✓ |
| `src/context/PushNotificationContext.tsx` | Token fetch retry (3×), `null` on failed device registration | Task push routing restored (`/tasks`, taskId param; leads → `/notifications`) | Auto-merged cleanly (disjoint regions) | Keep both | Auto-merged ✓ |
| `src/app/(tabs)/chat.tsx` (room rendering) | Voice-note duration fallbacks in the inline room map (`voiceDurations`, `getCachedVoiceNoteDuration`) | Replaced inline map with project/channel split + extracted `renderRoomRow` (has OLD duration computation) | **GIT CONFLICT** | Keep TCB's project/channel rendering; port main's duration fallbacks into `renderRoomRow` | Planned: combine |
| `src/app/(tabs)/chat.tsx` (voice duration machinery) | `voiceDurations` state, subscription effect, `pendingVoiceNoteUrls` batch probe, imports | (none) | Auto-merged cleanly | Keep main's machinery | Auto-merged ✓ |
| `src/app/conversation.tsx` (forward flow) | Full forward redesign: sectioned picker, per-room status, attachment download cache, `closeForwardModal` | Toast string "Could not forward this message." + old `setForwarding` finally block | **GIT CONFLICT** (catch/finally block) | Keep main's per-room error status; use TCB's toast text; drop `setForwarding` (state removed by main) | Planned: combine |
| `src/app/conversation.tsx` (forward modal header) | Redesigned header with plain close `TouchableOpacity` | `ModalCloseButton` for consistent cross button | **GIT CONFLICT** (close button) | Use `ModalCloseButton` with `closeForwardModal` (consistency change preserved) | Planned: combine |
| `src/app/conversation.tsx` (other areas) | Voice-note playback/durations, keyboard/media fixes, `emitRoomOpened/Closed` | ModalCloseButton in Attachment/Pinned modals + toast strings | Auto-merged cleanly | Keep both | Auto-merged ✓ |
| `src/context/ChatContext.tsx` | `markRoomReadNotification` on mark-read + `clear_unread` | (unchanged) | None | Take main's version | Auto-merged ✓ |
| `src/services/socket/socketService.ts` | Token re-handshake, `roomOpened/Closed`, `setSocketAuthFailureHandler`, connect_error handling | (unchanged; consumers: taskSocketBridge, NotificationContext, CreateTaskModal, etc.) | LOW — TCB consumers only use preserved exports | Take main's version | Auto-merged ✓ |
| `src/types/chat.types.ts`, `src/utils/chatHelpers.ts` | Extended attachment fields; `isVideoAttachment`; safer `isAudioAttachment` | (unchanged; TCB uses `mentionMarkupToDisplay` which is preserved) | LOW — additive | Take main's versions | Auto-merged ✓ |
| `src/types/push.types.ts` | Extended `PushNotificationData` | (unchanged) | LOW — additive | Take main's version | Auto-merged ✓ |
| `src/utils/planitNotificationBridge.ts`, `src/utils/voiceNoteDuration.ts` | New files | (none) | None | Add from main | Auto-merged ✓ |
| `src/components/MediaComposerModal.tsx` | Keyboard/crop restructure | (unchanged) | None | Take main's version | Auto-merged ✓ |
| `patches/expo-notifications+57.0.15.patch` | New native patch (notification grouping + `PlanitNotificationModule`) | (not present; TCB relies on unpatched prebuilt AAR) | MEDIUM — requires `buildFromSource` to take effect in TCB's committed `android/` folder | Add patch + keep autolinking config | Planned: take from main |
| `android/**` | (main has no android folder — uses EAS prebuild) | Committed prebuild output | LOW — untouched by merge | Keep TCB's android folder; verify patched source compiles into it | Preserved ✓ |
| `app.json` (`runtimeVersion`) | `{ "policy": "appVersion" }` | `"1.0.0"` | LOW (no textual conflict — main didn't change it in the 7 commits) | Keep TCB's `"1.0.0"` — **flag for user confirmation** | Pending decision |
| `eas.json` (env URLs) | `https://backend.planit.pk` (unchanged from base) | `https://backend-planit.soulservices.com` | LOW (no textual conflict) | Keep TCB's URLs — **flag for user confirmation** (production URL choice) | Pending decision |
| `src/hooks/useTaskSocket.ts` | (exists in main, unchanged) | Deleted (superseded by `taskSocketBridge`) | LOW — merge keeps the deletion | Keep deletion | Preserved ✓ |

---

## E. Resolution Decision Log

### E.1 `src/context/AuthContext.tsx` — import block (git conflict)
- **main**: `getModules` + `onSocketEvent, setSocketAuthFailureHandler`; auth-failure handler clears biometric session before logout.
- **taskchatbugs**: `getCompanyModules` + `onSocketEvent`; refactored module refresh no longer uses the SaaS-only `/modules/all` catalog (`getModules`).
- **Decision**: keep `getCompanyModules` (TCB) + `setSocketAuthFailureHandler` (main). Drop `getModules` — unused after TCB's refactor (would fail lint). Both branches' bodies (main's `handleAuthFailure`, TCB's `refreshCompanyModules` + socket module events) are retained; they auto-merged.
- **Retained**: TCB module-refresh logic; main auth-failure logic.
- **Approval needed**: No (mechanical combination; no business logic chosen between).

### E.2 `src/app/(tabs)/chat.tsx` — room list rendering (git conflict)
- **main**: voice-note duration fallbacks inside the single inline `displayRooms.map`.
- **taskchatbugs**: project/channel split rendering + extracted `renderRoomRow`.
- **Decision**: keep TCB's project/channel rendering (Project module requirement). Port main's duration computation (`getVoiceNoteSecondsFromAttachment ?? voiceDurations[url] ?? getCachedVoiceNoteDuration(url)`) into `renderRoomRow`. Main's `voiceDurations` state, subscription, and batch-probe effect were auto-merged and remain in scope.
- **Retained**: TCB Project-channel grouping UI; main voice-note duration fix.
- **Approval needed**: No.

### E.3 `src/app/conversation.tsx` — forward catch/finally (git conflict)
- **main**: per-room `forwardStatus` error marking + "Failed to forward message"; `forwarding` state removed by the redesign.
- **taskchatbugs**: toast text "Could not forward this message." + legacy `finally { setForwarding(false) }`.
- **Decision**: keep main's `setForwardStatus(... "error")` + TCB's toast text; drop the `setForwarding` finally (state no longer exists — main's redesign removed it).
- **Approval needed**: No.

### E.4 `src/app/conversation.tsx` — forward modal close button (git conflict)
- **main**: `TouchableOpacity` + `Ionicons close` calling `closeForwardModal`.
- **taskchatbugs**: `ModalCloseButton` calling `setForwardOpen(false)` (consistency change across all modals).
- **Decision**: use `ModalCloseButton` with `closeForwardModal` (preserves both the redesigned close behavior — resetting search/status — and the consistent-cross-button UI change).
- **Approval needed**: No.

### E.5 `package.json`
- **Decision**: keep both (auto-merged). `expo.autolinking.android.buildFromSource` is mandatory for the native notification patch to be compiled into TCB's committed android project.
- **Approval needed**: No.

### E.6 Native patch + committed `android/` folder
- **Decision**: add `patches/expo-notifications+57.0.15.patch` from main (applies at `postinstall` via patch-package). With `buildFromSource`, TCB's gradle build (EAS or local) compiles the patched `expo-notifications` Kotlin instead of the prebuilt AAR. TCB's committed `android/` folder itself is left untouched (no destructive prebuild).
- **Approval needed**: No (integration is additive; verification still required).

### E.7 `app.json` runtimeVersion + `eas.json` env URLs — pending user decision
- `main` builds are live on Play Store using `backend.planit.pk` and `runtimeVersion` policy `appVersion`. `taskchatbugs` switched dev/preview URLs to `backend-planit.soulservices.com` and fixed `runtimeVersion` to `1.0.0`. There is no git conflict; the merge naturally keeps taskchatbugs values.
- **Decision**: PENDING user confirmation (see Phase 4 questions).

---

## F. Post-Merge Implementation Plan

| Implementation Required | Reason | Affected Files | Dependencies | Priority | Status |
|---|---|---|---|---|---|
| Port main's voice-note duration fallbacks into `renderRoomRow` | TCB extracted `renderRoomRow` with the pre-main duration computation; conflict resolution must not drop main's fix | `src/app/(tabs)/chat.tsx` | `src/utils/voiceNoteDuration.ts`, `voiceDurations` state (auto-merged) | High | Planned (part of conflict resolution) |
| Remove any leftover `forwarding`/`setForwarding` references | Main's redesign removed the `forwarding` state; TCB's finally block in the conflict would reference a missing setter | `src/app/conversation.tsx` | — | High | Planned |
| Verify patch-package applies the expo-notifications patch cleanly on the merged branch | Native grouping fix must actually apply post-merge | `patches/expo-notifications+57.0.15.patch`, `node_modules/expo-notifications` | `package.json` postinstall, patch-package | High | Planned (Phase 7) |
| Verify expo autolinking resolves `expo-notifications` from source | `buildFromSource` must be honored by TCB's committed android project for the patch to compile in | `package.json`, `android/**` (read-only check) | expo-modules-autolinking | High | Planned (Phase 7) |
| Verify Task/Project/Chat TS consumers still compile against main's extended types | Additive type changes should be safe; check imports of `chatHelpers`/`chat.types`/`push.types`/`socketService` | whole `src/` | `tsc`/`expo lint` | High | Planned (Phase 7) |
| Run task-module test suite | Confirm Task module unaffected | `tests/task-logic/**` | `npm run test:tasks` | High | Planned (Phase 7) |
| Full native build sanity (if tooling available) | Confirms patched native code compiles | `android/`, `node_modules` | Gradle/Android SDK availability | Medium | Planned (Phase 7, may be limited by environment) |
| Push-notification flow verification | End-to-end notification behavior (token, registration, grouping, tap navigation) | `PushNotificationContext`, `_layout`, `ChatContext`, native patch | Requires device + backend + FCM | Medium | Planned (Phase 7, likely "Not possible to verify" locally) |

---

## G. Verification Results

### Pre-merge
| Check | Result |
|---|---|
| Working tree clean (main) | Passed |
| Local ↔ remote sync both branches | Passed |
| Trial merge in throwaway worktree (no commit) | Performed — 3 conflicted files enumerated: `AuthContext.tsx`, `(tabs)/chat.tsx`, `conversation.tsx` |

### Post-merge (to be filled in Phase 7)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | Not run yet |
| `npm run lint` | Not run yet |
| `npm run test:tasks` | Not run yet |
| patch-package apply check | Not run yet |
| expo autolinking resolve (expo-notifications from source) | Not run yet |
| Android Gradle build | Not run yet |
| Device push-notification test | Not run yet — requires physical device/backend |
| Chat module spot verification | Not run yet |
| Task module spot verification | Not run yet |
| Project module activation verification | Not run yet |

---

## H. Remaining Risks

1. **Native patch compile risk**: the expo-notifications patch targets `~57.0.15`; if any installed transitive version drifts, patch-package will fail loudly at `postinstall` (safe failure, but build-blocking). Verified pinned at `~57.0.15` in both branches.
2. **`buildFromSource` in bare android folder**: relies on expo-modules-autolinking honoring `expo.autolinking` config from `package.json` during gradle build of the committed `android/` project. Needs verification in Phase 7; if not honored, a fallback would be re-running prebuild (NOT planned — destructive; would require approval).
3. **Backend contract assumptions**: notification grouping relies on backend sending `sender_id`, `room_id`, `message_id`, etc. in push payloads (extended `push.types.ts`). Cannot be verified without a live backend. The backend URL difference (`planit.pk` vs `soulservices.com`) is a business decision (E.7).
4. **Forward modal UI consistency**: combining `ModalCloseButton` with the redesigned modal is a small visual integration; must be visually reviewed on device.
5. **`runtimeVersion` fixed `1.0.0`**: OTA updates via EAS Update require the runtime version to match the binary; with fixed `1.0.0`, future native builds must keep it in sync. TCB chose this; flagged, not blocking.
6. **Push behavior on unpatched dev builds**: if a developer installs node_modules without running `postinstall`, the native module is absent; `planitNotificationBridge` degrades gracefully (`requireOptionalNativeModule` → no-op), so chat remains functional without grouping.
7. **Unverifiable end-to-end**: token registration, FCM delivery, grouping and tap navigation cannot be fully proven without a physical device, Firebase credentials and a live backend environment.

---

## I. Final Integration Summary

*(To be completed after the merge — Phase 8.)*

### Planned outcome
- **From main**: notification grouping native patch + buildFromSource config, voice-note duration fixes, forward modal redesign + attachment forward fix, keyboard/media composer fixes, push token retry, auth-failure cleanup, socket room-open suppression, chat read notification clearing, extended push/chat types.
- **From taskchatbugs (preserved)**: complete Task module, ACTIVE Project module, project-channel chat grouping, task/chat bug fixes, toast/close-button consistency, committed android folder, TCB build config (pending user decision on eas.json/app.json).
- **Combined implementations**: forward modal (main design + TCB close button + TCB toast text), chat room list (TCB project grouping + main voice durations), AuthContext (both logic sets), package.json (both dependency sets).

---

*Report maintained by: OpenCode integration session. Started 2026-11-16.*
