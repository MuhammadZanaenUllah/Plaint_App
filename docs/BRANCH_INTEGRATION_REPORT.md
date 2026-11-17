# Branch Integration Report — `main` → `taskchatbugs` (TaskChatBugs)

> Status: **COMPLETED** (merge executed and committed; final report). This document was maintained throughout the integration.

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
| `src/context/AuthContext.tsx` (imports) | `setSocketAuthFailureHandler` + `removeBiometricSession`; `getModules` retained | `getCompanyModules` replaces `getModules`; `resetTaskStores`; modules socket refresh | **GIT CONFLICT** (import block). `getModules` is unused in TCB's refactored body | Keep TCB's `getCompanyModules`; add main's `setSocketAuthFailureHandler`; drop unused `getModules` | Resolved: combined ✓ |
| `src/context/AuthContext.tsx` (auth-failure effect) | Full auth-failure cleanup (clear biometric session, invalidate token cache, logout) + socket failure handler | (unchanged original handler; added `refreshCompanyModules` after it) | Auto-merged cleanly — both present | Keep main's `handleAuthFailure` + TCB's module refresh | Auto-merged ✓ |
| `src/app/_layout.tsx` | Push lifecycle: `registerCompany` dedup + foreground retry | TaskProvider mounted, `projects` route, default `/tasks`, Toast config | Auto-merged cleanly (disjoint regions) | Keep both | Auto-merged ✓ |
| `src/context/PushNotificationContext.tsx` | Token fetch retry (3×), `null` on failed device registration | Task push routing restored (`/tasks`, taskId param; leads → `/notifications`) | Auto-merged cleanly (disjoint regions) | Keep both | Auto-merged ✓ |
| `src/app/(tabs)/chat.tsx` (room rendering) | Voice-note duration fallbacks in the inline room map (`voiceDurations`, `getCachedVoiceNoteDuration`) | Replaced inline map with project/channel split + extracted `renderRoomRow` (has OLD duration computation) | **GIT CONFLICT** | Keep TCB's project/channel rendering; port main's duration fallbacks into `renderRoomRow` | Resolved: combined ✓ |
| `src/app/(tabs)/chat.tsx` (voice duration machinery) | `voiceDurations` state, subscription effect, `pendingVoiceNoteUrls` batch probe, imports | (none) | Auto-merged cleanly | Keep main's machinery | Auto-merged ✓ |
| `src/app/conversation.tsx` (forward flow) | Full forward redesign: sectioned picker, per-room status, attachment download cache, `closeForwardModal` | Toast string "Could not forward this message." + old `setForwarding` finally block | **GIT CONFLICT** (catch/finally block) | Keep main's per-room error status; use TCB's toast text; drop `setForwarding` (state removed by main) | Resolved: combined ✓ |
| `src/app/conversation.tsx` (forward modal header) | Redesigned header with plain close `TouchableOpacity` | `ModalCloseButton` for consistent cross button | **GIT CONFLICT** (close button) | Use `ModalCloseButton` with `closeForwardModal` (consistency change preserved) | Resolved: combined ✓ |
| `src/app/conversation.tsx` (other areas) | Voice-note playback/durations, keyboard/media fixes, `emitRoomOpened/Closed` | ModalCloseButton in Attachment/Pinned modals + toast strings | Auto-merged cleanly | Keep both | Auto-merged ✓ |
| `src/context/ChatContext.tsx` | `markRoomReadNotification` on mark-read + `clear_unread` | (unchanged) | None | Take main's version | Auto-merged ✓ |
| `src/services/socket/socketService.ts` | Token re-handshake, `roomOpened/Closed`, `setSocketAuthFailureHandler`, connect_error handling | (unchanged; consumers: taskSocketBridge, NotificationContext, CreateTaskModal, etc.) | LOW — TCB consumers only use preserved exports | Take main's version | Auto-merged ✓ |
| `src/types/chat.types.ts`, `src/utils/chatHelpers.ts` | Extended attachment fields; `isVideoAttachment`; safer `isAudioAttachment` | (unchanged; TCB uses `mentionMarkupToDisplay` which is preserved) | LOW — additive | Take main's versions | Auto-merged ✓ |
| `src/types/push.types.ts` | Extended `PushNotificationData` | (unchanged) | LOW — additive | Take main's version | Auto-merged ✓ |
| `src/utils/planitNotificationBridge.ts`, `src/utils/voiceNoteDuration.ts` | New files | (none) | None | Add from main | Auto-merged ✓ |
| `src/components/MediaComposerModal.tsx` | Keyboard/crop restructure | (unchanged) | None | Take main's version | Auto-merged ✓ |
| `patches/expo-notifications+57.0.15.patch` | New native patch (notification grouping + `PlanitNotificationModule`) | (not present; TCB relies on unpatched prebuilt AAR) | MEDIUM — requires `buildFromSource` to take effect in TCB's committed `android/` folder | Add patch + keep autolinking config | Integrated ✓ (verified: patched Kotlin compiles) |
| `android/**` | (main has no android folder — uses EAS prebuild) | Committed prebuild output | LOW — untouched by merge | Keep TCB's android folder; verify patched source compiles into it | Preserved ✓ |
| `app.json` (`runtimeVersion`) | `{ "policy": "appVersion" }` | `"1.0.0"` | LOW (no textual conflict — main didn't change it in the 7 commits) | Keep TCB's `"1.0.0"` — **user approved** | Approved: keep `"1.0.0"` ✓ |
| `eas.json` (env URLs) | `https://backend.planit.pk` (unchanged from base) | `https://backend-planit.soulservices.com` | LOW (no textual conflict) | Keep TCB's URLs — **user approved** | Approved: keep soulservices URLs ✓ |
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

### E.7 `app.json` runtimeVersion + `eas.json` env URLs — RESOLVED (user decision)
- `main` builds are live on Play Store using `backend.planit.pk` and `runtimeVersion` policy `appVersion`. `taskchatbugs` uses `backend-planit.soulservices.com` and fixed `runtimeVersion` `1.0.0`. No git conflict existed; the merge naturally kept the taskchatbugs values.
- **User decision (2026-11-16)**: keep the soulservices URLs in `eas.json` AND keep `runtimeVersion` fixed at `"1.0.0"` in `app.json`. Both retained as-is.

---

## F. Post-Merge Implementation Plan

| Implementation Required | Reason | Affected Files | Dependencies | Priority | Status |
|---|---|---|---|---|---|
| Port main's voice-note duration fallbacks into `renderRoomRow` | TCB extracted `renderRoomRow` with the pre-main duration computation; conflict resolution must not drop main's fix | `src/app/(tabs)/chat.tsx` | `src/utils/voiceNoteDuration.ts`, `voiceDurations` state (auto-merged) | High | DONE (conflict resolution) |
| Remove any leftover `forwarding`/`setForwarding` references | Main's redesign removed the `forwarding` state; TCB's finally block in the conflict would reference a missing setter | `src/app/conversation.tsx` | — | High | DONE (verified: only a comment remains) |
| Verify patch-package applies the expo-notifications patch cleanly on the merged branch | Native grouping fix must actually apply post-merge | `patches/expo-notifications+57.0.15.patch`, `node_modules/expo-notifications` | `package.json` postinstall, patch-package | High | DONE (patched files verified present; see G) |
| Verify expo autolinking resolves `expo-notifications` from source | `buildFromSource` must be honored by TCB's committed android project for the patch to compile in | `package.json`, `android/**` (read-only check) | expo-modules-autolinking | High | DONE (resolves from sourceDir; `PlanitNotificationModule` registered) |
| Verify Task/Project/Chat TS consumers still compile against main's extended types | Additive type changes should be safe; check imports of `chatHelpers`/`chat.types`/`push.types`/`socketService` | whole `src/` | `tsc`/`expo lint` | High | DONE (`tsc --noEmit` clean) |
| Run task-module test suite | Confirm Task module unaffected | `tests/task-logic/**` | `npm run test:tasks` | High | DONE (77/77 passed) |
| Full native build sanity (if tooling available) | Confirms patched native code compiles | `android/`, `node_modules` | Gradle/Android SDK availability | Medium | DONE (`:app:preDebugBuild` + `:expo-notifications:compileDebugKotlin` BUILD SUCCESSFUL) |
| Push-notification flow verification | End-to-end notification behavior (token, registration, grouping, tap navigation) | `PushNotificationContext`, `_layout`, `ChatContext`, native patch | Requires device + backend + FCM | Medium | NOT POSSIBLE locally (no device/backend session) |

---

## G. Verification Results

### Pre-merge
| Check | Result |
|---|---|
| Working tree clean (main) | Passed |
| Local ↔ remote sync both branches | Passed |
| Trial merge in throwaway worktree (no commit) | Performed — 3 conflicted files enumerated: `AuthContext.tsx`, `(tabs)/chat.tsx`, `conversation.tsx` |

### Post-merge (executed 2026-11-16, after conflict resolution and before the merge commit)
| Check | Result |
|---|---|
| `npx tsc --noEmit` (ran twice: after resolution and pre-commit) | **Passed** — 0 errors both runs |
| `npm run lint` (`expo lint`) | **Failed** — 84 errors / 93 warnings. All findings are PRE-EXISTING baseline debt (React Compiler / react-hooks rules) in code from both branches; verified no finding is in merge-introduced code (no findings in `voiceNoteDuration.ts`, `planitNotificationBridge.ts`, `MediaComposerModal.tsx`, or the resolved conflict regions; `handleMore` unused is dead code in both branches) |
| `npm run test:tasks` | **Passed** — 77/77 tests |
| patch-package apply check | **Passed with note** — patched files verified present in `node_modules/expo-notifications` (`PlanitChatNotification.kt`, `PlanitNotificationModule.kt`, module registration in `expo-module.config.json`, `GROUP_KEY` in builder) since node_modules was installed under `main` (postinstall applied the same patch). A manual `npx patch-package expo-notifications` re-apply failed with a Windows MAX_PATH error on stale gradle `android/build` intermediates inside node_modules — environment quirk of patch-package's temp git repo, not a patch defect; fresh installs (EAS/CI, Linux) are unaffected |
| expo autolinking resolve | **Passed** — `expo-notifications` resolves from `sourceDir` (buildFromSource honored by the committed android project); `PlanitNotificationModule` appears in the resolved expo modules |
| Android Gradle build | **Passed (partial)** — `gradlew :app:preDebugBuild` (config + autolinking + codegen, 1m57s) and `gradlew :expo-notifications:compileDebugKotlin` (compiles the PATCHED Kotlin, 4m4s) both BUILD SUCCESSFUL with deprecation warnings only. Full `assembleDebug` not run (long); app native code is TCB-owned and unchanged by the merge |
| Device push-notification test | **Not run** — requires physical device, Firebase credentials and live backend session; not available in this environment |
| Chat module spot verification | **Passed (static)** — merged ChatContext/socketService/conversation/chat list contain all main fixes and TCB changes; `tsc` clean; conflict regions verified by code review |
| Task module spot verification | **Passed** — 142 `src/features/tasks` files + `TaskContext` + tasks tab present; 77/77 logic tests pass; consumers compile |
| Project module activation verification | **Passed** — `src/app/projects/**` routes present; `_layout.tsx` keeps `projects` in authenticated screens and mounts `TaskProvider`; chat tab Projects chip + project channels intact; no disabled-config from main leaked in (main's 7 commits touch no project/module-activation files) |

---

## H. Remaining Risks

1. **Native patch compile risk (resolved for current tree)**: the expo-notifications patch targets `~57.0.15`; verified pinned at `~57.0.15` in both branches, and the patched Kotlin compiled successfully (gradle `:expo-notifications:compileDebugKotlin`). If the package version drifts later, patch-package fails loudly at `postinstall` (safe failure, but build-blocking).
2. **`buildFromSource` in bare android folder (resolved)**: verified — autolinking resolves `expo-notifications` from sourceDir and gradle compiled the patched sources. No prebuild needed.
3. **Backend contract assumptions**: notification grouping relies on the backend sending `sender_id`, `room_id`, `message_id`, etc. in push payloads (extended `push.types.ts`). Cannot be verified without a live backend. The soulservices backend URL choice was confirmed by the user.
4. **Forward modal UI consistency**: combining `ModalCloseButton` with the redesigned modal is a small visual integration; needs a visual pass on device.
5. **`runtimeVersion` fixed `1.0.0`**: OTA updates via EAS Update require the runtime version to match the binary; future native builds must keep it in sync (user-confirmed choice).
6. **Push behavior on unpatched dev builds**: if a developer installs node_modules without running `postinstall`, the native module is absent; `planitNotificationBridge` degrades gracefully (`requireOptionalNativeModule` → no-op), so chat remains functional without grouping.
7. **Unverifiable end-to-end**: token registration, FCM delivery, notification grouping and tap navigation cannot be fully proven without a physical device, Firebase credentials and a live backend session — not available in this environment.
8. **Lint debt**: `expo lint` fails with pre-existing React Compiler rule violations from both branches (84 errors / 93 warnings). Not introduced by this merge and out of scope; recommend a dedicated cleanup task later.

---

## I. Final Integration Summary

### Actual outcome (executed and committed)

- **Merge commit**: `722d7b7` "Merge remote-tracking branch 'origin/main' into TaskChatBugs" on `TaskChatBugs` (branch now ahead of `origin/TaskChatBugs` by 8 commits; NOT pushed, per instructions).
- **Backup branch**: `backup/taskchatbugs-pre-merge-2026-11-16` created at pre-merge `TaskChatBugs` HEAD (`ebaf5dc`).
- **Conflicts encountered (3 files, 5 hunks)** — all resolved by combining, never by accepting one side wholesale:
  1. `src/context/AuthContext.tsx` — import block: TCB's `getCompanyModules` + main's `setSocketAuthFailureHandler`; unused `getModules` dropped.
  2. `src/app/(tabs)/chat.tsx` — kept TCB's project/channel rendering; ported main's voice-duration fallbacks into `renderRoomRow`; removed the obsolete inline map from main.
  3. `src/app/conversation.tsx` — forward catch: main's per-room error status + TCB's toast text, obsolete `setForwarding` finally dropped; forward header: `ModalCloseButton` calling main's `closeForwardModal`.

### Retained from main
- Native notification grouping patch (`patches/expo-notifications+57.0.15.patch`) + `buildFromSource` autolinking config (compiled successfully).
- Voice-note duration fixes (`voiceNoteDuration.ts`, extended chat types, safer `chatHelpers`).
- Forward modal redesign with attachment-forward fix.
- Keyboard hiding / media composer restructure.
- Push token fetch retry + registration-failure handling; push lifecycle dedup/foreground retry (`_layout.tsx`).
- Auth-failure cleanup (biometric session clear + socket auth-failure handler).
- `markRoomReadNotification` integration in ChatContext; `roomOpened/roomClosed` socket suppression.
- Extended `push.types.ts`.

### Retained from taskchatbugs
- Complete Task module (142 feature files, TaskContext, tasks tab, Zustand stores, socket bridge, tests — 77/77 passing).
- ACTIVE Project module (20 feature files + `src/app/projects/**` routes + `projects` in authenticated screens + chat Projects chip + project channel grouping).
- Project-channel grouping/collapse in the chat list; task owners in contacts.
- `ModalCloseButton` consistency + `AppToast`/`toastConfig` + toast copy.
- Committed `android/` folder (untouched; main's native fixes integrate into it via patch + autolinking).
- `eas.json` soulservices URLs (user-approved) and `app.json` `runtimeVersion` `"1.0.0"` (user-approved).
- `zustand`/`tsx`/`@types/node` deps + `test:tasks` script.

### Combined implementations created
- Forward modal: main's redesign + TCB's close button + TCB's toast text.
- Chat room list: TCB's project/channel split + main's voice durations.
- `AuthContext`: main's auth-failure handler + TCB's module refresh.
- `package.json`: main's autolinking config + TCB's dependency/tooling additions.

### Verification summary
- `tsc --noEmit`: PASS (twice). Task tests: PASS 77/77. Gradle: PASS (`preDebugBuild` + patched `expo-notifications` Kotlin compile). Autolinking: PASS (source resolution + module registration). Lint: FAIL on pre-existing baseline debt only. Device/end-to-end push: NOT RUN (environment limitation, documented).

### Success criteria
1. Latest compatible production fixes from main — ✅ integrated.
2. Chat functionality from both branches preserved — ✅.
3. Complete Task module functional — ✅ (tests + tsc).
4. Project module ACTIVE — ✅ (routes, navigation, permissions, chat integration verified present).
5. Required native Android changes from main — ✅ (patch + autolinking, compiled).
6. Push notification functionality and native dependencies preserved — ✅ (config-level; end-to-end unverified, documented).
7. Patches and dependency changes handled — ✅.
8. No known functionality unintentionally removed — ✅.
9. Verification checks completed and reported — ✅ (G section).
10. `docs/BRANCH_INTEGRATION_REPORT.md` documents the full integration — ✅.

---

*Report maintained by: OpenCode integration session. Started 2026-11-16. Final update: 2026-11-16 (post-merge).*
