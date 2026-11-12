// Device-local "last seen task comment" persistence. This is intentionally
// per user + task and does not require any backend read/unread support.

import AsyncStorage from "@react-native-async-storage/async-storage";

const storageKey = (userId: number) => `planit_task_comment_seen_${userId}`;

type SeenMap = Record<string, number>;

async function readSeenMap(userId: number): Promise<SeenMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const map: SeenMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(value);
      if (Number.isFinite(id)) map[key] = id;
    }
    return map;
  } catch {
    return {};
  }
}

export async function loadLastSeenCommentId(
  userId: number,
  taskId: number,
): Promise<number | null> {
  if (!userId || !taskId) return null;
  const map = await readSeenMap(userId);
  const value = map[String(taskId)];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function saveLastSeenCommentId(
  userId: number,
  taskId: number,
  noteId: number,
): Promise<void> {
  if (!userId || !taskId || !Number.isFinite(noteId)) return;
  const map = await readSeenMap(userId);
  const key = String(taskId);
  const existing = map[key];
  if (existing !== undefined && existing >= noteId) return;
  map[key] = noteId;
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    // Best-effort only; the in-memory marker still updates for this session.
  }
}
