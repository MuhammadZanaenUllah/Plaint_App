# Plaint — Project Documentation

> Last updated: 2026-07-21

## Overview

Plaint is a cross-platform Expo app for task, project, and team management. It targets Android, iOS, and Web using Expo Router, React Native, TypeScript, and custom SF Pro fonts. The app covers onboarding, authentication, task dashboards, real-time-style chat with project channels, conversation messaging, leave management, and performance tracking.

---

## Key Features

- Onboarding carousel with auto-advance and call-to-action navigation
- Login screen with animated floating inputs and password visibility toggle
- Primary task dashboard with search, filters, stat cards, and scrollable task table
- Swipeable task rows with inline status dropdowns and hidden action columns
- Bottom sheet create/edit task modal with metadata chips and attachment simulation
- Custom floating bottom tab bar across all sections
- Chat list view with category chips (All, Unread, Read, Channels, Projects), unread indicators, and empty states
- Projects tab with expandable project rows, default channels (General, Discussion), and add-group flow
- Full-screen conversation/messaging screen with message bubbles, inline date filter, attachment panels, chat member list, post-type filter, and animated search bar
- Notification bell with dropdown inbox panel (positioned contextually below the bell icon)
- Leave management screen with leave type cards and detailed leave modals
- Performance/HR stats placeholder tab
- Profile screen

---

## Tech Stack

| Package | Version |
|---|---|
| Expo SDK | ~57 |
| React Native | 0.86.0 |
| React | 19.2.3 |
| TypeScript | ~6.0.3 |
| Expo Router | ~57.0.2 |
| react-native-reanimated | 4.5.0 |
| react-native-gesture-handler | latest |
| @expo/vector-icons | latest |
| react-native-svg | latest |
| expo-font | latest |
| expo-linear-gradient | latest |
| expo-splash-screen | latest |
| expo-image | latest |
| expo-device / expo-constants | latest |
| expo-linking / expo-web-browser | latest |

---

## Project Structure

```
Plaint/
├── assets/
│   ├── fonts/              # SF Pro Text font files (.otf)
│   ├── icons/              # Custom SVG icon components
│   └── images/             # App visuals, splash, banners, logos
├── scripts/
│   └── reset-project.js    # Reset helper script
├── src/
│   ├── app/                # Expo Router screens and routes
│   │   ├── _layout.tsx     # Root layout (ThemeProvider + Stack)
│   │   ├── index.tsx       # Entry redirect route
│   │   ├── splashscreem.tsx# Onboarding/splash screen
│   │   ├── explore.tsx     # Expo starter example screen
│   │   ├── profile.tsx     # User profile screen
│   │   ├── conversation.tsx# Full messaging/conversation screen
│   │   ├── (auth)/
│   │   │   └── login.tsx   # Login screen
│   │   └── (tabs)/
│   │       ├── _layout.tsx # Tabs layout with CustomTabBar
│   │       ├── tasks.tsx   # Main task dashboard
│   │       ├── chat.tsx    # Chat / Projects list screen
│   │       ├── leaves.tsx  # Leave management screen
│   │       ├── performance.tsx # Performance/HR placeholder
│   │       ├── home.tsx    # Home placeholder
│   │       ├── biometric.tsx   # Biometric placeholder
│   │       └── grid.tsx    # Grid placeholder
│   ├── components/         # Reusable UI components (see below)
│   ├── constants/
│   │   ├── icons.tsx       # Centralized icon exports
│   │   └── theme.ts        # System theme constants
│   ├── context/            # Reserved for React context providers
│   ├── data/               # Mock / static data files
│   ├── hooks/
│   │   ├── use-color-scheme.ts
│   │   └── use-theme.ts
│   ├── services/           # Reserved for API/service logic
│   ├── theme/
│   │   ├── root.tsx        # App colors, spacing, typography, radius tokens
│   │   └── useAppFonts.tsx # Font loader hook
│   ├── types/              # Shared TypeScript types
│   ├── utils/              # Utility helpers
│   └── global.css          # Web global styles
├── app.json                # Expo configuration
├── package.json
├── tsconfig.json
└── PROJECT.md              # This file
```

---

## Routing & Navigation

### Root Layout — `src/app/_layout.tsx`
- Wraps the app in Expo Router `ThemeProvider`.
- Uses `useColorScheme()` for light/dark theme selection.
- Sets `Stack` screen options with `headerShown: false`.
- Hides the Expo splash screen after mount.

### Tab Layout — `src/app/(tabs)/_layout.tsx`
- Uses Expo Router `Tabs` with a custom `CustomTabBar`.
- Defines tab routes: `tasks`, `chat`, `leaves`, `performance`, `home`, `biometric`, `grid`.

### App Flow

```
/ → splashscreem → /login → /(tabs)/tasks
                           → /(tabs)/chat → /conversation
                           → /(tabs)/leaves
                           → /profile
```

---

## Screens

### Onboarding — `src/app/splashscreem.tsx`
- Auto-scrolling banner carousel with 4 slides.
- Displays dot indicators for the current slide.
- Navigates to `/login` on CTA tap.

---

### Login — `src/app/(auth)/login.tsx`
- Login form with email and password fields using `FloatingInput`.
- Password field includes an eye toggle.
- `Log In` routes to the Tasks tab.
- Placeholder `Forgot Password?` link.

---

### Tasks — `src/app/(tabs)/tasks.tsx`
Main task management dashboard.

**Features:**
- `AppHeader` with greeting, notification bell, avatar initials, and search.
- Scrollable filter chips for task categories.
- Stat cards for quick task-count overview.
- `TaskTable` component renders mocked task data.
- FAB opens the `CreateTaskModal`.

**Task Filter Categories:**
All Tasks · Due Today · Due in 7 Days · Delayed · Created by Me · Assigned to Me · Recurring · Completed

---

### Chat — `src/app/(tabs)/chat.tsx`
Chat list screen with two sub-modes: **All Chats** and **Projects**.

**Filter Chips:** All · Unread · Read · Channels · Projects

**All / Unread / Read mode:**
- List of users with initials avatars, online dot, message snippet, timestamp, unread bubble.
- Tapping a user navigates to `/conversation`.
- FAB opens `AddPeopleModal` to start a new chat.

**Channels mode:**
- Separate list of channel entries.
- Empty state shows `ChannelTabIcon` + "Create Channel" button.
- FAB opens `CreateChannelModal` → `AddPeopleModal` flow.

**Projects mode:**
- Expandable project rows (chevron toggle).
- Each project has default channels: `# General`, `# Discussion`.
- `+` button on each project row opens `CreateChannelModal` (group name) → `AddPeopleModal` → new group appended to the project's channels list.
- Channel rows: white background by default; gray highlight on active/selected.
- Project rows: gray highlight on active/selected.

---

### Conversation — `src/app/conversation.tsx`
Full-screen messaging interface.

**Features:**
- Incoming (right-aligned, teal) and outgoing (left-aligned, white) message bubbles.
- Expandable animated search bar in the header.
- **Top filter chips** (single row): Date · Attachments · Chat Members · Post Type
  - **Date chip**: Quick filter buttons (Today, Last 7 Days, Last 30 Days, This Month, Last Month, Custom Range) + responsive `CalendarPicker` with correct 7-column week layout.
  - **Attachments chip**: Sub-tabs for Images, Videos, Docs, Links.
  - **Chat Members chip**: List of conversation members.
  - **Post Type chip**: Two post types displayed per row in a grid.
- All filter chips fit on a single line without wrapping.

---

### Leaves — `src/app/(tabs)/leaves.tsx`
Leave management screen.

**Features:**
- Leave balance cards (Annual, Sick, Casual, etc.).
- Apply leave form / flow.
- `LeaveDetailModal` for viewing leave request details.

---

### Performance — `src/app/(tabs)/performance.tsx`
Placeholder for HR/performance metrics. Uses shared `AppHeader`.

---

### Profile — `src/app/profile.tsx`
User profile screen with personal information and settings.

---

### Explore — `src/app/explore.tsx`
Expo starter example screen (template remnant). Theme-aware layout, collapsible sections, web-specific elements.

---

## Components

### `AppHeader` — `src/components/headerapp.tsx`
Reusable header used across all main screens.

- Greeting title + subtitle.
- Notification bell icon with contextual dropdown inbox panel:
  - Opens directly below the bell icon, aligned to icon position.
  - Responsive width — not full-screen.
  - Compact notification list with icon, title, description.
  - Text sizes match design spec (small/compact).
- Search bar (optional, togglable).
- Avatar initials circle.

---

### `CustomTabBar` — `src/components/CustomTabBar.tsx`
Floating pill-shaped bottom tab bar.

- Active tab icon has a white circular highlight.
- Uses Ionicons for all nav icons.
- Positioned above native system UI.

---

### `StatCard` — `src/components/StatCard.tsx`
Displays icon, label, and count.

- Supports Ionicons string icons and custom React nodes.
- Active card highlighted with a teal border.

---

### `TaskTable` — `src/components/TaskTable.tsx`
Collapsible section with horizontal scroll for wide rows.

- Column headers and multiple `TaskRow` children.
- Swipe-left reveals hidden columns and a "More" actions button.
- Only one row dropdown expanded at a time via `openRowIndex` state.

---

### `TaskRow` — `src/components/TaskRow.tsx`
Individual task row inside `TaskTable`.

- Task title, creator, assignee, due date, status, comments icon, project name.
- Inline status dropdown: Pending · In-Progress · On-Hold · Rejected · Completed · Pending-Approval.
- Completed tasks show checkmark and strikethrough styling.

---

### `DynamicTable` — `src/components/DynamicTable.tsx`
Advanced dynamic data table with configurable columns and rows.

---

### `CreateTaskModal` — `src/components/CreateTaskModal.tsx`
Bottom sheet modal for task creation.

- Floating title input and description editor.
- Action chips: assignee, due date, priority, approval, recurring, subtasks, dependencies.
- Simulated attachment chips and tags.
- UI-only; tasks are not persisted.

---

### `TaskDetailModal` — `src/components/TaskDetailModal.tsx`
Full-detail view modal for an existing task.

- Read/edit task fields, status, attachments, comments.

---

### `CreateChannelModal` — `src/components/CreateChannelModal.tsx`
Centered modal for naming a new channel or group.

- Uses `FloatingInput` for the channel/group name.
- Configurable `title` and `placeholder` props.
- Transitions to `AddPeopleModal` after submission.

---

### `AddPeopleModal` — `src/components/AddPeopleModal.tsx`
Bottom sheet user search and selection modal.

- Floating search input with filterable user list.
- **Single Select mode**: Tapping a user navigates directly to conversation.
- **Channel/Group mode** (`isChannelMode`): Checkbox multi-selection, "Select All", and green "Invite" button.

---

### `CalendarPicker` — `src/components/CalendarPicker.tsx`
Responsive date picker used inside the conversation date filter panel.

- 7-column weekday grid with even `flex: 1` column distribution.
- Responsive across all screen sizes (no empty Sunday column issue).
- Quick filter shortcuts: Today, Last 7 Days, Last 30 Days, This Month, Last Month, Custom Range.

---

### `FilterModal` — `src/components/FilterModal.tsx`
Task filter modal for the Tasks screen.

---

### `InboxModal` — `src/components/InboxModal.tsx`
Notification/inbox dropdown panel.

- Rendered inline below the bell icon (not full-screen).
- Width constrained and aligned to bell icon position.
- Lists notification items with icon, title, description.

---

### `LeaveDetailModal` — `src/components/LeaveDetailModal.tsx`
Modal for viewing and managing leave request details.

---

### `FloatingInput` — `src/components/FloatingInput.tsx`
Animated floating label input field.

| Prop | Type | Description |
|---|---|---|
| `label` | string | Floating label text |
| `secureToggle` | boolean | Adds eye icon for password visibility |
| `value` / `onChangeText` | string / fn | Controlled input |

- Label animates up and shrinks on focus or when value is present.
- Border transitions: `#E6E6E6` → `#1D1D1D` on focus.

---

### `texteditor` — `src/components/texteditor.tsx`
Rich text editor component for task descriptions.

---

### Decoration & Platform Components

| Component | Purpose |
|---|---|
| `gradientheader.tsx` (TopMintGlow) | Mint/teal gradient at top of screen |
| `gradientfooter.tsx` (BottomGlow) | Gradient at bottom of screen |
| `radialbottom.tsx` | Radial gradient bottom accent |
| `BottomTabBar.tsx` | Legacy alternate tab bar (unused) |
| `animated-icon.tsx` / `.web.tsx` | Animated icon wrapper (native + web) |
| `app-tabs.tsx` / `.web.tsx` | Platform tab abstraction |
| `external-link.tsx` | External URL link component |
| `themed-text.tsx` | Theme-aware Text wrapper |
| `themed-view.tsx` | Theme-aware View wrapper |
| `hint-row.tsx` | Hint/tip row UI element |
| `web-badge.tsx` | Web-only badge component |
| `ui/collapsible.tsx` | Generic collapsible section |

---

## Custom Icons — `assets/icons/`

Accessed via the centralized `constants/icons.tsx` barrel export.

| File | Component |
|---|---|
| `bellicon.tsx` | Bell notification icon (SVG) |
| `duetoday.tsx` | Due Today icon (SVG) |
| `filtericon.tsx` | Filter icon (SVG) |
| `sevenday.tsx` | 7-day icon (SVG) |
| `ChatIcon` | Main chat icon (SVG) |
| `ChannelTabIcon` | Channel tab icon (SVG) |

---

## Theme & Styling

### `src/theme/root.tsx` — App Tokens

```ts
Colors.primary       = '#1ED9A5'   // Teal brand color
Colors.bgButtonColor = '#00DFAB'   // CTA button background
Colors.buttonText    = '#1D1D1D'   // Button text
Colors.background    = '#FFFFFF'
Colors.textPrimary   = '#1D1D1D'
Colors.textSecondary = '#6B6B6B'
Colors.placeholder   = '#E6E6E6'
```

**Spacing:** `xs(4)` · `sm(8)` · `md(16)` · `lg(24)` · `xl(32)` · `xxl(48)`

**Border Radius:** `sm(8)` · `md(12)` · `lg(16)` · `pill(28)` · `screen(40)`

### `src/constants/theme.ts`
Light/dark mode color tokens, platform-specific fonts, spacing scale.

### Fonts
All text uses SF Pro Text loaded via `expo-font`:

| Family Key | File |
|---|---|
| `SF_Pro_Bold` | SF-Pro-Text-Bold.otf |
| `SF_Pro_Light` | SF-Pro-Text-Light.otf |
| `SF_Pro_Medium` | SF-Pro-Text-Medium.otf |
| `SF_Pro_Regular` | SF-Pro-Text-Regular.otf |
| `SF_Pro_Semibold` | SF-Pro-Text-Semibold.otf |

---

## Hooks

| Hook | File | Purpose |
|---|---|---|
| `useAppFonts` | `theme/useAppFonts.tsx` | Loads SF Pro fonts, returns `[fontsLoaded]` |
| `useColorScheme` | `hooks/use-color-scheme.ts` | Native color scheme detection |
| `useTheme` | `hooks/use-theme.ts` | App theme access |

---

## App Configuration — `app.json`

| Key | Value |
|---|---|
| Name | Planit |
| Version | 1.0.0 |
| Orientation | Portrait |
| Scheme | `planit` |
| UI Style | Automatic (light/dark) |
| Splash bg | `#208AEF` |
| Web output | Static |
| Typed Routes | Enabled |
| React Compiler | Enabled |

---

## Setup & Running

```bash
# Install dependencies
npm install

# Start dev server
npx expo start

# Start with cache cleared
npm run start -c

# Platform-specific
npx expo start --android
npx expo start --ios
npx expo start --web

# Lint
npx expo lint

# Reset to blank starter
npm run reset-project
```

---

## Key Design Decisions

- **File-based routing** via Expo Router — screens map directly to file paths
- **Custom tab bar** floats above content as a pill; no native tab bar used
- **Inline status dropdown** in `TaskRow` — only one open at a time via `openRowIndex` in `TaskTable`
- **StatCard filtering** — `TASKS_MAP` pre-filters task arrays per category; active tab drives which dataset renders
- **Floating label inputs** — pure React Native `Animated` API, no third-party form library
- **SF Pro fonts** loaded once at app root via `useAppFonts` hook before rendering
- **Notification panel** opens contextually below the bell icon, not as a full-screen modal
- **Projects chat** — expandable project rows with per-project channel lists; add-group flow appends new channels within a project
- **Channel active state** — white background by default; gray (`#F4F4F4`) only on actively selected channel row
- **Conversation filters** — all chips (Date, Attachments, Chat Members, Post Type) in a single horizontal row; Post Type shows 2 items per row in a grid
- **CalendarPicker** — 7 weekday columns with even `flex: 1` distribution; fixes Sunday-column misalignment on narrow screens

---

## Notes

- Most app data is currently mocked inline in screen files or in `src/data/`.
- Task creation modal is UI-only; created tasks are not persisted.
- Several tab screens (`home`, `biometric`, `grid`) are placeholders ready for feature expansion.
- `explore.tsx` is an Expo starter template remnant kept for reference.
- App structure is designed for iterative feature expansion with clear separation of screens, components, and theme tokens.
