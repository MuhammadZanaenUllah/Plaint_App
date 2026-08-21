# Over-The-Air (OTA) Updates Guide for Plaint

This guide explains how to publish, test, and manage Over-The-Air (OTA) updates for the **Plaint** React Native Expo application using `expo-updates` and **EAS Update**.

---

## 1. Prerequisites (One-Time Setup)

Before publishing updates for the first time, ensure you are logged into your Expo account in your terminal:

```bash
npx eas login
```

---

## 2. Publishing an Update

Whenever you make changes to your React Native code, components, styles, or assets, you can push the update directly to user devices without submitting a new build to the App Store / Play Store.

### 🚀 Push to Production Users
```bash
npm run update:production
```
Or with a custom commit message:
```bash
npx eas update --channel production --message "Fix chat scroll and notification bugs"
```

### 🧪 Push to Preview / Internal Testers
```bash
npm run update:preview
```
Or with a custom commit message:
```bash
npx eas update --channel preview --message "Test new channel UI"
```

---

## 3. How Users Receive Updates Automatically

1. **Automatic Background Check**: When a user opens the app (or returns to it from the background), the app silently checks Expo servers for new updates matching their app version (`1.0.0`).
2. **Background Download**: If an update exists, it is downloaded in the background without interrupting what the user is doing.
3. **User Prompt / Reload**:
   - A toast notification will appear at the bottom: 
     > **Update Ready 🚀**  
     > *A new version of Plaint has been downloaded. Tap to restart.*
   - If the user taps the toast, the app reloads into the updated version instantly.
   - If they ignore it, the app will automatically launch the new version the next time they open the app.

---

## 4. What Can Be Updated via OTA

| Type of Change | Can be updated via OTA? | Action Required |
| :--- | :---: | :--- |
| **JS / TS Code** (UI changes, bug fixes, logic) | ✅ Yes | `npm run update:production` |
| **Assets** (Images, icons, fonts, audio files) | ✅ Yes | `npm run update:production` |
| **API Endpoints & State Management** | ✅ Yes | `npm run update:production` |
| **New Native Modules** (e.g. adding camera or Bluetooth) | ❌ No | Requires new native build (`eas build`) |
| **App Permissions / `app.json` native settings** | ❌ No | Requires new native build (`eas build`) |

---

## 5. Managing Updates & Rollbacks

### List All Published Updates
```bash
npx eas update:list
```

### Roll Back to a Previous Working Update
If an update accidentally introduced a bug, you can republish a previous working update group:
```bash
npx eas update:republish --channel production --group <UPDATE_GROUP_ID>
```

---

## 6. Architecture & Implementation Reference

- **Package**: `expo-updates` (`~57.0.16`)
- **Manifest Config**: [`app.json`](file:///Volumes/Code/websouls-repo/Plaint_App/app.json) (`updates.url`, `runtimeVersion: { "policy": "appVersion" }`)
- **Channel Targets**: [`eas.json`](file:///Volumes/Code/websouls-repo/Plaint_App/eas.json) (`production`, `preview`, `development`)
- **App Lifecycle Hook**: [`src/hooks/useUpdates.ts`](file:///Volumes/Code/websouls-repo/Plaint_App/src/hooks/useUpdates.ts)
