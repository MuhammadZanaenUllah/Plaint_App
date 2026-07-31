import { Platform } from 'react-native';

/**
 * Firebase Client SDK Configuration for Plaint App
 * Extracted from google-services.json (Android) and GoogleService-Info.plist (iOS).
 *
 * NOTE: The Firebase Admin SDK key (planit-23ccf-firebase-adminsdk-*.json)
 * must ONLY be used on your backend server and NEVER imported into this app.
 */
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyC1UP8Ecy1bNYbW5Q1_DHYJ3Z_n4us6h9E",
  authDomain: "planit-23ccf.firebaseapp.com",
  projectId: "planit-23ccf",
  storageBucket: "planit-23ccf.firebasestorage.app",
  messagingSenderId: "545626786844",
  appId: Platform.select({
    ios: "1:545626786844:ios:9f4983353d0bb75526e3d9",
    android: "1:545626786844:android:d21ba04c2486225126e3d9",
    default: "1:545626786844:android:d21ba04c2486225126e3d9",
  }),
};
