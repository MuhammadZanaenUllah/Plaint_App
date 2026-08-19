# Plaint 🚀

> **Enterprise-Grade Task Management, Team Collaboration & Real-Time Chat Platform**

Plaint is a cross-platform mobile and web application built with **React Native**, **Expo (SDK 57)**, **Expo Router**, **TypeScript**, and **Socket.IO**. Designed for modern teams, Plaint combines real-time chat, channel discussions, rich task tracking, leave management, and biometric security into a unified workplace environment.

---

## 📸 Core Highlights

- **Real-Time Messaging**: WhatsApp-style long-press message context menus, quick emoji reactions, inline editing, custom delete options (*Delete for Me* / *Delete for Everyone*), voice notes, and file/image attachment support.
- **Task & Project Management**: Dynamic task tables, status/priority workflow tracking, critical/delay task highlights, rich text descriptions, and customizable task filtering.
- **Biometric Security & Authentication**: Secure token persistence via Expo SecureStore and hardware biometric sign-in (Face ID / Fingerprint).
- **Push & Contextual Notifications**: In-app notifications inbox modal, custom audio notification chimes, push token registration, and system haptic feedback.
- **Channel & Member Management**: Channel creation, role-based permissions (`comment`, `edit`, `delete`, `manage`), member invitations, and @-mention autosuggestions.

---

## 🛠 Tech Stack

| Domain | Tech / Library | Description |
|---|---|---|
| **Core Framework** | React Native `0.86` & Expo `~57.0` | Cross-platform framework for iOS, Android, and Web |
| **Routing** | Expo Router `~57.0` | File-based navigation with typed routes |
| **Language** | TypeScript `~6.0` | End-to-end type safety |
| **Real-Time Engine** | Socket.IO Client `^4.8` | Real-time events, typing indicators, and message broadcasts |
| **State Management** | React Context API | Context providers for Auth, Chat, Tasks, Notifications, and Search |
| **Media & Audio** | Expo Audio `~57.0`, Expo Image | High-performance image caching, voice recording & playback |
| **Storage & Security** | Expo SecureStore & LocalAuthentication | Encrypted keychain storage & biometric authentication |
| **UI & Motion** | Reanimated `4.5`, Gesture Handler, Bottom Sheet | Smooth 60 FPS animations and gesture-driven UI components |
| **Styling & Fonts** | SF Pro Fonts, Radial/Linear Gradients | Modern typography and customizable theme tokens |

---

## 📁 Project Structure

```
Plaint_App/
├── assets/                  # App branding, SF Pro fonts, icons, sound effects
│   ├── files/               # Native configuration files (google-services.json, etc.)
│   ├── fonts/               # Custom SF Pro font files (.otf)
│   ├── images/              # Visual assets, logos, splash graphics
│   └── sounds/              # Custom notification sound chimes (.mp3)
├── src/
│   ├── app/                 # Expo Router screens and file-based navigation routes
│   │   ├── _layout.tsx      # App root layout & Context provider orchestration
│   │   ├── index.tsx        # Entry redirect handler
│   │   ├── conversation.tsx # Real-time chat & channel messaging screen
│   │   ├── notifications.tsx# Notifications inbox view
│   │   ├── profile.tsx      # User profile screen
│   │   ├── settings.tsx     # Security, biometrics & cache settings
│   │   ├── splashscreem.tsx # Onboarding & splash screen
│   │   ├── (auth)/          # Authentication routes (Login screen)
│   │   └── (tabs)/          # Tab navigation (Tasks, Chat, Leaves, Home)
│   ├── components/          # Reusable UI components & Modals
│   │   ├── AddPeopleModal.tsx       # Member invitation modal
│   │   ├── Avatar.tsx               # Dynamic avatar with initials fallback
│   │   ├── CreateTaskModal.tsx      # Comprehensive task creation modal
│   │   ├── DynamicTable.tsx         # Responsive task data table
│   │   ├── InboxModal.tsx           # Contextual header notification popup
│   │   ├── SingleTaskTable.tsx      # Mobile-optimized single task card table
│   │   ├── TaskDetailModal.tsx      # Task preview & status management modal
│   │   └── texteditor.tsx           # Rich text task description editor
│   ├── context/             # React Context Providers
│   │   ├── AuthContext.tsx          # User session & token management
│   │   ├── ChatContext.tsx          # Real-time rooms, messages & reactions
│   │   ├── TaskContext.tsx          # Task dashboard state & API handlers
│   │   ├── NotificationContext.tsx  # In-app notifications state
│   │   └── PushNotificationContext.tsx # Native push registration & listener
│   ├── services/            # API Clients & Sockets
│   │   ├── api/             # REST API endpoints (Auth, Tasks, Chat, Uploads)
│   │   └── socket/          # Socket.IO connection & event handlers
│   ├── theme/               # Design tokens, color palettes & typography hooks
│   ├── types/               # Shared TypeScript models & API interfaces
│   └── utils/               # Helper utilities (date formatting, haptics, toast)
├── app.json                 # Expo app config (permissions, bundle ID, plugins)
├── eas.json                 # Expo Application Services build configuration
├── package.json             # Dependencies and scripts
└── tsconfig.json            # TypeScript compiler configuration
```

---

## ⚡️ Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: `v18.x` or `v20.x`
- **Package Manager**: `npm`
- **Expo CLI**: Installed globally or executed via `npx`
- **Mobile Environment** *(Optional for native builds)*:
  - iOS: **Xcode** & **CocoaPods** (macOS only)
  - Android: **Android Studio** & **Android SDK / Emulator**

---

### Environment Setup

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Configure your backend API base URL:

```env
EXPO_PUBLIC_API_BASE_URL=https://backend-planit.soulservices.com/api/v1
```

---

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/Plaint_App.git
   cd Plaint_App
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

---

## 🏃 Running the Application

### Development Server (Expo Start)

Start the Expo bundler server:

```bash
npm start
# or
npx expo start
```

Press `a` to launch in the Android Emulator, `i` for iOS Simulator, or `w` for Web.

---

### Platform-Specific Commands

| Target | Command |
|---|---|
| **Android Development Build** | `npm run android` *(runs `expo run:android`)* |
| **iOS Development Build** | `npm run ios` *(runs `expo run:ios`)* |
| **Web Browser** | `npm run web` *(runs `expo start --web`)* |
| **TypeScript Check** | `npx tsc --noEmit` |
| **ESLint Check** | `npm run lint` *(runs `expo lint`)* |

---

## 📱 Feature Breakdown

### 💬 Real-Time Chat System (`src/app/conversation.tsx`)
- **WhatsApp Context Overlay**: Long-press any message bubble to reveal a floating reaction pill and context menu.
- **Inline Message Editing**: Edit messages directly from the main chat bar without intrusive popups.
- **Delete Options Modal**: Choose between *Delete for Me* or *Delete for Everyone*.
- **Voice Notes**: Native audio recording and playback powered by `expo-audio`.
- **Media Attachments**: Secure image rendering (`SecureImage`), document sharing, and download handlers.
- **Member @-Mentions**: Live autocomplete suggestions triggered by typing `@`.

### 📋 Task & Workflow Dashboard (`src/app/(tabs)/tasks.tsx`)
- **Interactive Tables**: Responsive data tables with swipeable action rows and inline status pickers.
- **Rich Task Editor**: Integrated WYSIWYG editor for detailed task briefs (`react-native-pell-rich-editor`).
- **Custom Filters**: Filter by status, priority, date range, or assigned team members.
- **Critical & Delayed Alerts**: Visual indicators and badges for overdue or high-priority items.

### 🔒 Security & Settings (`src/app/settings.tsx`)
- **Biometric Login**: Enable Face ID or Fingerprint authentication via `expo-local-authentication`.
- **Cache Management**: Scan and clear physical disk cache storage (`FileSystem.cacheDirectory`) with live progress and feedback.
- **Secure Storage**: Sensitive auth tokens stored in encrypted iOS Keychain / Android Keystore via `expo-secure-store`.

---

## 📦 Building for Production

Build production standalone binaries for iOS and Android using **EAS Build**:

```bash
# Build Android APK / AAB
eas build --platform android --profile production

# Build iOS IPA
eas build --platform ios --profile production
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
