// ─── Chat drafts — React Native store ────────────────────────────────────────
//
// Thin adapter around the pure DraftPersistence core:
//   • AsyncStorage is the persistence backend.
//   • AppState flushes pending writes when the app leaves the foreground, so a
//     draft is not lost if the OS kills a backgrounded app before unmount.
//   • `useChatDrafts` uses `useSyncExternalStore`, so only components that
//     actually render drafts (the chat list) re-render as the user types. The
//     rest of the chat context is untouched.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

import {
  DraftMap,
  DraftPersistence,
  DraftScope,
} from "@/features/chat/drafts/draftPersistence";

export const chatDraftPersistence = new DraftPersistence(
  {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  },
  { debounceMs: 400 },
);

// Flush pending drafts whenever the app leaves the foreground. Registered once
// at module scope; this listener only performs storage I/O.
AppState.addEventListener("change", (nextState) => {
  if (nextState !== "active") {
    void chatDraftPersistence.flush();
  }
});

/** Load persisted drafts for the signed-in user + company context. */
export function hydrateDrafts(scope: DraftScope): Promise<void> {
  return chatDraftPersistence.hydrate(scope);
}

/** Forget all in-memory drafts (used on logout / company change). */
export function resetDrafts(): void {
  chatDraftPersistence.reset();
}

/** Read a conversation's draft. Safe to call during render. */
export function getDraft(roomId: string | number | null | undefined): string {
  return chatDraftPersistence.get(roomId);
}

/** Update the in-memory draft immediately; disk write is debounced. */
export function updateDraft(
  roomId: string | number | null | undefined,
  text: string | null | undefined,
): void {
  chatDraftPersistence.set(roomId, text);
}

export function clearDraft(roomId: string | number | null | undefined): void {
  chatDraftPersistence.clear(roomId);
}

/**
 * Clear a draft only while it still equals `expectedText`. Protects a newer
 * draft typed while a send request was in flight.
 */
export function clearDraftIfUnchanged(
  roomId: string | number | null | undefined,
  expectedText: string,
): boolean {
  return chatDraftPersistence.clearIfUnchanged(roomId, expectedText);
}

/** Persist all pending draft writes now. */
export function flushDrafts(): Promise<void> {
  return chatDraftPersistence.flush();
}

/** Subscribe to the draft map (chat list previews). */
export function useChatDrafts(): DraftMap {
  return useSyncExternalStore(
    chatDraftPersistence.subscribe,
    chatDraftPersistence.getSnapshot,
    chatDraftPersistence.getSnapshot,
  );
}
