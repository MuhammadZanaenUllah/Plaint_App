# Planit Chat Notification Grouping — Implementation Guide & iOS Options

> Handover document for the teammate implementing iOS notification grouping.
> Describes exactly what Android does today, the backend contract, and the realistic iOS options.

---

## 1. Goal

Chat pushes must arrive grouped per conversation (and per sender for DMs), show unread counts, alert only once per sender/room, and disappear when the user reads that conversation — in both foreground and background/killed states.

---

## 2. What Android does today (complete)

### 2.1 Architecture — how custom native code ships

1. **`patches/expo-notifications+57.0.15.patch`** (repo: `patches/`) — modifies the `expo-notifications` npm package inside `node_modules`. It is applied **automatically** by `postinstall: patch-package` on every `npm install`. There is no manual step.
2. **`package.json`** — `expo.autolinking.android.buildFromSource: ["expo-notifications"]` forces Gradle to compile `expo-notifications` from the (patched) source instead of the prebuilt AAR. Without this, the patch would apply to files in `node_modules` but never reach the APK.
3. The committed `android/` folder needs **no changes** — autolinking reads the config at build time (verified: autolinking resolves the module from `sourceDir` and `PlanitNotificationModule` is registered).
4. If the npm package version drifts, `npm install` **fails loudly** (patch mismatch) → regenerate the patch with `npx patch-package expo-notifications`.

### 2.2 Patched files and what each does

| File (inside `node_modules/expo-notifications/android/...`) | Change |
|---|---|
| `presentation/PlanitChatNotification.kt` (new, ~1000 lines) | Core engine. Parses chat payloads, stores unread messages in SharedPreferences (`planit_chat_notification_senders`, dedup by `message_id`), aggregates DMs **per sender** and channel messages **per room**, posts one child notification per aggregate ("Name (N)") + one group summary ("Planit — N unread messages"), alerts only for the just-updated aggregate, `markRoomRead(roomId, beforeTime)`, dismiss-sync receiver. |
| `presentation/PlanitNotificationModule.kt` (new) | Expo native module `PlanitNotificationModule` with one function: `markRoomRead(roomId, beforeTime)`. |
| `presentation/builders/ExpoNotificationBuilder.kt` | For chat payloads: sets title=sender, text=preview, `CATEGORY_MESSAGE`, `setGroup(GROUP_KEY)`, `GROUP_ALERT_CHILDREN`. |
| `service/ExpoFirebaseMessagingService.kt` | **Background/killed fix**: Expo push sends FCM messages with both a `notification` and a `data` block; in background/killed the FCM SDK renders the notification itself and expo never sees it, so grouping can never run. For chat pushes (`type=chat`, from the Expo push service, app NOT foregrounded) the service strips the `gcm.n.*`/`gcm.notification.*` extras → the message becomes data-only → expo builds the notification → the grouping code runs in every app state. |
| `service/delegates/ExpoPresentationDelegate.kt` | When posting a chat notification, hands off to `PlanitChatNotification.onNotificationPosted(...)` instead of posting the raw per-message notification. |
| `service/delegates/FirebaseMessagingDelegate.kt` | `getNotificationIdentifier`: chat messages ignore the `tag` (which would replace an existing notification) and use the unique FCM `messageId`, so every message becomes its own child. |
| `android/src/main/AndroidManifest.xml` | Registers `PlanitChatNotificationDismissReceiver` (internal broadcast receiver for swipe-away sync). |
| `expo-module.config.json` | Registers `PlanitNotificationModule` in the Android modules list. |

### 2.3 Behavior details worth copying conceptually

- **Aggregation keys**: DM → `sender:<id|name>`; channel → `room:<room_id>`.
- **Counts**: child title shows `Name (N)`; summary shows `N unread messages`.
- **Alert policy**: only the sender/room that just received the message alerts (`setOnlyAlertOnce` + `setSilent` for the rest); the summary is always silent.
- **No auto-cancel on tap**: children are removed only after the backend read succeeds (`markRoomRead`) — a failed read never silently clears notifications.
- **Race safety**: `markRoomRead` takes a `beforeTime` cutoff so a message that arrives while the read request is in flight stays unread.
- **Dedup**: a `message_id` seen-set prevents a re-delivered push from inflating counters.
- **Channels**: reuses the push's channel; otherwise creates/uses a fallback `IMPORTANCE_HIGH` channel.
- **Tap intents**: child tap → `NotificationResponse` with data payload `{type:"chat", room_id}` (deep-links into the conversation via the existing JS routing); summary tap → chat list.

### 2.4 JS wiring (cross-platform code, already in the repo)

| File | Role |
|---|---|
| `src/utils/planitNotificationBridge.ts` | Loads `PlanitNotificationModule` via `requireOptionalNativeModule` (null on iOS/unpatched → safe no-op); exposes `markRoomReadNotification(roomId, beforeTime)`. |
| `src/context/ChatContext.tsx` | `markReadAction`: captures `Date.now()` **before** the API call, then calls the bridge after success. The `clear_unread` socket event also clears native notifications. |
| `src/services/socket/socketService.ts` | `emitRoomOpened(roomId)` / `emitRoomClosed(roomId)`; re-emits `roomOpened` on reconnect; emits `roomClosed` on disconnect. |
| `src/app/conversation.tsx` | Calls `emitRoomOpened` when the conversation screen opens/foregrounds, `emitRoomClosed` on blur/close. |
| `src/context/PushNotificationContext.tsx` | Foreground presentation handler (`shouldShowAlert/Banner/List`, `shouldPlaySound`), token fetch with 3 retries, device registration (`null` on failure → retry next foreground), tap routing (chat → conversation with `room_id`; tasks → `/tasks`; leads → `/notifications`). |
| `src/app/_layout.tsx` | `registerCompany` dedup + foreground retry of push registration. |
| `src/types/push.types.ts` | Extended `PushNotificationData` fields (`sender_id`, `sender_name`, `message_id`, `message`, `created_at`, task event fields…). |

### 2.5 Backend contract (Android)

Push data payload for chat (FCM `data`, JSON under `body`):

```json
{
  "type": "chat",
  "sender_id": "...",
  "sender_name": "...",
  "room_id": "...",
  "message_id": "...",
  "message": "...",
  "created_at": "..."
}
```

(title/text fallbacks are also parsed when the clean fields are missing.)

Plus two socket behaviors:

- `roomOpened {roomId, room_id}` → backend suppresses pushes for the room being viewed.
- `roomClosed {roomId, room_id}` → backend resumes pushes.

**Do not change these without touching both the native code and the JS side.**

---

## 3. What already works on iOS (no work needed)

- Expo push token registration → APNs (JS, cross-platform).
- Foreground presentation (banner/sound/list) via `setNotificationHandler`.
- Tap → deep-link routing (data payload `type` / `room_id` / `task_id`).
- Token retry, registration retry, badge reset.
- `markRoomReadNotification` currently **no-ops** on iOS (the bridge finds no native module — safe).
- Sound: `app.json` expo-notifications plugin `sounds` already configured.

---

## 4. iOS — what's missing and why it's different

**Hard OS limit**: iOS has no group-summary concept and no per-sender aggregate rows. The OS groups notifications automatically per app; an app cannot draw its own "Planit — 5 unread" header. You must implement iOS-idiomatic equivalents.

| Android behavior | iOS mechanism | Who changes what |
|---|---|---|
| Rows per sender/room + group summary | `threadIdentifier` (APNs `thread-id`) → Notification Center stacks per conversation; one banner per message. No "N messages" header possible. | Backend adds `thread-id` |
| "N unread" count + single collapsed notification | `apns-collapse-id` + **UNNotificationServiceExtension** rewriting content, OR the stock one-banner-per-message behavior | Backend + native Swift extension |
| `markRoomRead` clears room notifications | Pure JS with expo-notifications: `getPresentedNotificationsAsync()` → filter payload `room_id` → `dismissNotificationAsync()` | App only |
| Swipe-away keeps state | iOS delivered notifications are just notifications — nothing persisted to fix | n/a |
| Only latest alerts | iOS alerts per notification; OS throttling is minimal. The aggregation option solves this | extension |

---

## 5. iOS Option 1 — Minimal parity (recommended first step)

**What you get**: per-conversation grouping (native OS stacking), read-clearing, everything else stock. Zero native iOS code.

### App changes

1. Extend `src/utils/planitNotificationBridge.ts` with an iOS fallback. Sketch:

```ts
import * as Notifications from "expo-notifications";

/**
 * iOS fallback for markRoomRead: no native Planit module exists there, so
 * dismiss the delivered notifications that belong to the room via the
 * expo-notifications JS API.
 */
export async function markRoomReadIosFallback(roomId: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const targets = presented.filter((notification) => {
      const data = notification.request.content.data as { room_id?: string };
      return data?.room_id != null && String(data.room_id) === String(roomId);
    });
    await Promise.all(
      targets.map((notification) =>
        Notifications.dismissNotificationAsync(notification.request.identifier),
      ),
    );
  } catch (error) {
    console.warn("[Notifications] iOS markRoomRead fallback failed:", error);
  }
}
```

2. Wire it in `src/context/ChatContext.tsx` where `markRoomReadNotification` is called: on iOS (native module unavailable) call the fallback instead. Keep the existing behavior when the native module exists (Android).
3. Verify the payload flows through on iOS: Expo passes the FCM `data` block into `notification.request.content.data` — `room_id` must be present there for the filter to work. Confirm against a real APNs push before shipping.

### Backend changes (required)

Add `thread-id` to the APNs payload for chat pushes:

- Channel messages: `thread-id = room_id`
- DMs: `thread-id = dm:<otherUserId>` (must be **stable and identical** for both sides of the DM — e.g. `dm:<min>_<max>` of the two user ids)

### Limitations

- No unread-count aggregation; each message is its own banner.
- Multiple messages from one sender appear as multiple entries in the conversation stack.
- No custom summary; the OS draws one stack per `thread-id`.

---

## 6. iOS Option 2 — Full parity (aggregation via Notification Service Extension)

**What you get**: closest to Android — one collapsed notification per conversation showing "N new messages from X", a single alert, cleared on read.

### App changes (native Swift)

1. Add a **Notification Service Extension** target (`UNNotificationServiceExtension`) to the iOS app. The repo has **no committed `ios/` folder** (only `android/` is committed; iOS builds currently come from EAS prebuild), so choose one of:
   - **Commit a generated `ios/` project** (mirroring how `android/` is committed) and add the extension target in Xcode, or
   - **Write an Expo config plugin** that injects the extension at prebuild time (keeps the managed EAS workflow, no committed ios folder — recommended if you don't want to maintain the whole ios folder).
2. Extension logic (Swift):
   - Read the push payload (`sender_id`, `room_id`, `message_id`, `message`).
   - Persist per-conversation unread state in **App Group `UserDefaults`** (enable an App Group shared by the app and the extension, e.g. `group.pk.planit.notifications`).
   - Set `threadIdentifier = room_id` (or `dm:<userId>`) so the OS stacks it under that conversation.
   - Rewrite `content.title`/`content.body` to the aggregate text (`"Areeb"` / `"3 new messages"`).
   - Use `apns-collapse-id` = conversation key so only **one** notification per conversation is shown and it updates in place.
   - Optionally update `content.badge` for unread counts.
3. **Read-clearing parity**: when the backend read succeeds, the app writes "room X read at T" into the shared App Group UserDefaults; the extension stops updating that conversation. JS still dismisses already-delivered notifications via the Option-1 fallback (needed for anything already on screen).

### Backend changes (required)

For chat APNs pushes set:

- `aps.mutable-content = 1` (without this the extension never runs)
- `thread-id` (conversation key, same rules as Option 1)
- `apns-collapse-id` (conversation key)

`apns-priority` / `content-available` only if you also want background refresh behavior (not required for grouping).

### Limitations

- Still no visible group-summary header (the OS draws the stack; the "N new messages" text lives on the single collapsed notification).
- The extension has a ~30-second window; very old notifications cannot be rewritten (fine in practice).
- Silent pushes and `content-available` edge cases need device testing.

---

## 7. Decision checklist

- [ ] Backend team confirms `thread-id` (both options) and `mutable-content` + `apns-collapse-id` (Option 2).
- [ ] iOS build pipeline reality check: EAS prebuild only today (no committed ios folder). Option 2 via config plugin keeps that workflow; committing ios/ mirrors android/.
- [ ] App Group / bundle identifier (`pk.planit`) availability in the Apple developer portal.
- [ ] Option 1 is 100% shippable without native iOS code — implement it even if Option 2 follows later.

---

## 8. How to verify Android (regression checks after any change)

```
npm install                                    # patches apply automatically
npx tsc --noEmit                               # TypeScript clean
npm run test:tasks                             # 77 task tests
cd android && gradlew :expo-notifications:compileDebugKotlin   # patched Kotlin compiles
npx expo-modules-autolinking resolve --platform android         # expo-notifications from source + PlanitNotificationModule registered
```

Manual (device + backend session):

- App in background → chat push arrives → ONE notification per sender/room with count + silent group summary; no per-message spam.
- Tap child → correct conversation opens.
- Open the conversation → backend read succeeds → its notification disappears.
- Reconnect the socket while a room is open → `roomOpened` re-emitted (no push for the open room).
- Killed app → chat push still grouped (data-message conversion path).

---

## 9. Maintenance notes

- Bumping `expo-notifications` breaks the patch → regenerate (`npx patch-package expo-notifications` after reapplying your changes to a clean install).
- On Windows, re-running patch-package over an already-built node_modules can fail with MAX_PATH errors (stale gradle intermediates) — a clean install fixes it.
- `planitNotificationBridge` must always stay `requireOptionalNativeModule`-based so unpatched/iOS builds degrade gracefully.
- The socket contract (`roomOpened`/`roomClosed`) must match the backend; any backend change requires re-testing the background path (FCM data-message conversion in `ExpoFirebaseMessagingService`).
