# Chat Permissions & Frontend Logic — Website → Mobile Mapping

> Source of truth: `FRONTEND_LOGIC.md` (§1.3, §1.12, §1.13, §1.18.5, §2, §6),
> `loginresponsepermissions.txt`, `apis_documents/AGENT_API_INTEGRATION.md`, and the
> existing Planit mobile code. No behavior was invented beyond the documented website rules.

## 1. Relevant website logic (extracted)

### Route / access
- `/:cid/chat` requires `chat-list` (§1.3).
- Sidebar **Chat** flyout requires `chat-list`; the **Project Channels** sub-section requires `project-list` (§1.18.5).
- Chat is **not** module-gated (only permission-gated).

### Room list
- Sections: `direct` (Inbox), `channel` with `parent_id == null` (Channels), `project` + child channels (Projects).
- Sort: unread first, then latest `last_message.createdAt` / `createdAt`.
- DM name = other member; "Deleted User" if missing / `is_deleted` / `status 0`.
- Room context menu: Mute/Unmute, Mark as Unread, Delete (only when `canDeleteRoom`).
  - direct → requires `chat-delete`;
  - channel/project → creator or member `Full edit`.

### Channel member permission levels (§2.3)
| Level | Send | Pick post type | Create post type | Invite / manage members |
|---|---|---|---|---|
| Full edit | ✓ | ✓ | ✓ | ✓ |
| Edit | ✓ | ✓ | ✗ (button hidden) | ✗ |
| Comment | ✓ | ✗ | ✗ | ✗ |
| View Only | ✗ | ✗ | ✗ | ✗ |

`roomPermissionUpdated` updates the map live. The website defaults `myPermission` to
`Full edit` until `getRoomPermissions` loads.

### Membership
- Remove button: never for creator; `Full edit` → anyone except self; without `Full edit` → only self (acts as leave).
- Delete/hide: `direct` (per §2.4) hide only; `channel` creator only (§2.4).

### Messages
- Edit: own messages only, **within 1 hour**, never voice notes.
- Delete: own messages only, **within 1 hour**, scope `everyone` / `me`.
- View Only: composer replaced; **all message action buttons hidden**.
- Post type select: `Full edit` / `Edit`.

### Notifications
- Other users' messages in non-muted rooms → OS notification + in-app `chatNotification` (`isMention` when current user id ∈ `mentions`).
- Bell `typ:"chat"` opens the room whose id is in `description`.

## 2. Login permissions relevant to Chat

| Permission | In the provided login payload | Controls | Website check | Mobile |
|---|---|---|---|---|
| `chat-list` | ✅ | Chat route, DM inbox, Channels, create channel | `PermissionRoute`, `Sidebar` | `canViewChat` / `canCreateChannel` |
| `chat-delete` | ✅ | Delete/hide a **direct** conversation | `Sidebar` `canDeleteRoom` | `canDeleteDirectChat` |
| `project-list` | ✅ | Project Channels section | `Sidebar` | `canViewProjects` (Projects UI disabled) |
| `chat-edit` | ❌ not present / not documented | (none) | nowhere | **removed** — was wrongly gating member management |

The provided login is a **Company Admin** (`role:12`, `role_title:"Company Admin"`), so
`chat-list` / `chat-delete` are present and `chat-edit` is absent — the previous
`canEditChannel("chat-edit")` gate was always `false` and blocked valid Full-edit members.

## 3. Implemented checks

### `src/utils/permissions.ts`
- `canViewChat(user)` → `chat-list`.
- `canCreateChannel(user)` → `chat-list`.
- `canDeleteDirectChat(user)` → `chat-delete`.
- Removed `canEditChannel` (`chat-edit`) and the old `canDeleteChannel` (unused / wrong key).

### `src/app/conversation.tsx`
- `canSendMessage`, `canReact`, `canUseMessageActions` → channel member permission (`Comment`+).
- `canManagePostTypes` → channel member permission (`Edit`/`Full edit`).
- `canManageMembers` → channel member permission (`Full edit`) **only** (no module key).
- `canModerateMembers` → owner or Full edit; `canLeaveChannel` → channel and not owner.
- `canClearHistory` → owner or Full edit.
- `canDeleteChat` → channel: **creator only**; direct: `canDeleteDirectChat` (`chat-delete`).
- Edit/Delete → own messages only, within **1 hour** (`isWithinEditWindow`), never voice notes / attachments; missing `createdAt` blocks the actions.
- View Only → message long-press actions and swipe-to-reply disabled entirely.
- Room menu: **Clear chat history** (owner/Full edit), **Leave channel** (any channel member, not the owner).
- Composer: **New** post-type chip + long-press a chip to delete (Full edit/Edit).
- Reactions gated by `Comment`+.

### `src/context/AuthContext.tsx`
- Login gate (website §1.4): a non-Company-Admin / non-SaaS-Admin without permissions or without a company policy is blocked with the documented message.
- Live permission refresh: socket `role_update` (`action:"update_permissions"`, matching company + role) replaces `user_permissions` and persists them, so all gated UI re-evaluates.

### `src/types/auth.types.ts`
- Added optional `is_saas_admin`, `user_type`, `has_seen_welcome` to `UserData`.

## 4. Intentionally excluded (and why)

| Item | Reason |
|---|---|
| Project Channels (`project-list`) | Project module is disabled in this Chat-only delivery (per decision). |
| Invite-link acceptance (`?chat_invite=` / `acceptInvite`) | No OS-level deep link available for the web invite URL (per decision). |
| `chat-edit` module gate | Not a real backend permission; website governs channels by member level only. |
| Default `callerPermission = "Full edit"` | Decision: keep the safer `undefined` default so actions stay hidden until `GET /chat/room-permissions` resolves. |
| Chat tab hidden when no `chat-list` | Decision: keep the tab and show the in-screen "no permission" state. |
| Editing others' messages | Website restricts edit/delete to own messages; higher channel levels no longer moderate others. |
| Company-Admin permission bypass on module/sidebar checks | Website `PermissionRoute` exempts Company Admin but `Sidebar` still checks literally; mobile mirrors the literal check. |

## 5. Resolved assumptions / decisions
- **DM delete** follows the sidebar rule: `chat-delete` required (not §2.4's "anyone").
- **Channel delete** follows §2.4: creator only.
- **Clear history** = owner or Full edit.
- **Leave channel** = any member of a channel (not the owner); DMs are hidden/deleted.
- **Post types** create/delete = Full edit **and** Edit.
- **1-hour window** uses `msg.createdAt`; absent/invalid timestamp blocks edit/delete.
- Denied controls are **hidden**, not disabled.

## 6. APIs / UI actions affected
- `POST /chat/delete-room` (channel, creator), `POST /chat/hide-room` (direct, `chat-delete`).
- `POST /chat/leave-room` (Leave channel).
- `POST /chat/clear-messages` + `chatCleared` (Clear history).
- `POST /chat/post-types`, `POST /chat/post-types/delete` (Full edit/Edit).
- `POST /chat/edit-message`, `POST /chat/delete-message` (own, ≤1h).
- `POST /chat/update-permission`, `POST /chat/add-member`, invite flow (owner/Full edit).
- Socket `role_update` (permission refresh); existing chat sockets unchanged.
