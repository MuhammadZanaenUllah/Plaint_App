import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, type AudioSource } from "expo-audio";

import { resolveFileUrl, resolveSecureFileUrl } from "@/utils/chatHelpers";
import { getStoredToken } from "@/utils/token";

const STORAGE_KEY = "planit_voice_note_durations_v1";
const MAX_CACHE_ENTRIES = 200;
const PROBE_TIMEOUT_MS = 8000;

const durationCache = new Map<string, number>();
const inflight = new Map<string, Promise<number | null>>();
const listeners = new Set<(url: string, seconds: number) => void>();
let hydrationPromise: Promise<void> | null = null;

/** Subscribe to durations learned anywhere (probe or playback). */
export function subscribeVoiceNoteDurations(
  listener: (url: string, seconds: number) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persistCache() {
  const payload: Record<string, number> = {};
  durationCache.forEach((value, key) => {
    payload[key] = value;
  });
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
}

function hydrateCache(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        Object.entries(parsed).forEach(([key, value]) => {
          if (
            !durationCache.has(key) &&
            typeof value === "number" &&
            Number.isFinite(value) &&
            value > 0
          ) {
            durationCache.set(key, value);
          }
        });
      } catch {
        // A corrupt cache should never affect playback or the chat list.
      }
    })();
  }
  return hydrationPromise;
}

/** Duration learned earlier (playback or a metadata probe), in seconds. */
export function getCachedVoiceNoteDuration(
  url?: string | null,
): number | null {
  if (!url) return null;
  const value = durationCache.get(url);
  return value != null && value > 0 ? value : null;
}

/** Remember a real audio duration so the chat list can show it later. */
export function rememberVoiceNoteDuration(
  url: string | null | undefined,
  seconds: number | null | undefined,
) {
  if (!url || seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return;
  }
  const rounded = Math.round(seconds * 10) / 10;
  if (durationCache.get(url) === rounded) return;
  durationCache.set(url, rounded);
  if (durationCache.size > MAX_CACHE_ENTRIES) {
    const oldest = durationCache.keys().next().value;
    if (oldest != null) durationCache.delete(oldest);
  }
  persistCache();
  listeners.forEach((listener) => {
    try {
      listener(url, rounded);
    } catch {}
  });
}

async function buildProbeSource(url: string): Promise<AudioSource> {
  if (/^(file|content|blob|data):/i.test(url) || /^https?:/i.test(url)) {
    // Absolute URLs are either already local or a direct remote source.
    // Backend `/public/...` URLs need the auth proxy, handled below.
    const publicPathMatch = /^https?:\/\/[^/]+(\/public\/.*)$/i.exec(url);
    if (publicPathMatch) {
      const token = await getStoredToken();
      return {
        uri: resolveSecureFileUrl(publicPathMatch[1]),
        headers: token
          ? { authToken: token, "x-access-token": token }
          : undefined,
      };
    }
    return { uri: url };
  }

  const token = await getStoredToken();
  const headers = token
    ? { authToken: token, "x-access-token": token }
    : undefined;
  if (url.replace(/^\/+/, "").startsWith("public/")) {
    return { uri: resolveSecureFileUrl(url), headers };
  }
  return { uri: resolveFileUrl(url), headers };
}

/**
 * Read the real duration of a voice note without playing it.
 *
 * Website-originated notes are `.webm` and do not encode their duration in
 * the filename/message text (mobile notes do). Creating an expo-audio player
 * loads the source and reports the container duration in its status updates;
 * the player is muted and removed as soon as the duration is known.
 *
 * The result is cached persistently so the chat list can use it on later
 * launches without probing the file again.
 */
export function resolveVoiceNoteDuration(
  url?: string | null,
): Promise<number | null> {
  if (!url) return Promise.resolve(null);

  return hydrateCache().then(() => {
    const cached = getCachedVoiceNoteDuration(url);
    if (cached != null) return cached;
    const pending = inflight.get(url);
    if (pending) return pending;

    const promise = new Promise<number | null>((resolve) => {
      let settled = false;
      let player: any = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let pollTimer: ReturnType<typeof setInterval> | null = null;

      const finish = (seconds: number | null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (pollTimer) clearInterval(pollTimer);
        try {
          player?.pause?.();
        } catch {}
        try {
          player?.remove?.();
        } catch {}
        player = null;
        inflight.delete(url);
        if (seconds != null && seconds > 0) {
          rememberVoiceNoteDuration(url, seconds);
          resolve(seconds);
        } else {
          resolve(null);
        }
      };

      timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

      buildProbeSource(url)
        .then((source) => {
          try {
            player = createAudioPlayer(source, { updateInterval: 250 });
            // Loading the source is enough to get the duration; never play it
            // audibly or take audio focus.
            player.muted = true;
            player.volume = 0;
            player.addListener?.(
              "playbackStatusUpdate",
              (status: any) => {
                if (status?.error) {
                  finish(null);
                  return;
                }
                if (
                  typeof status?.duration === "number" &&
                  status.duration > 0
                ) {
                  finish(status.duration);
                }
              },
            );

            // The native player prepares immediately; also poll the duration
            // property in case the initial status was emitted before the
            // listener was attached.
            const checkDuration = () => {
              if (settled || !player) return;
              try {
                if (
                  typeof player.duration === "number" &&
                  player.duration > 0
                ) {
                  finish(player.duration);
                }
              } catch {
                finish(null);
              }
            };
            checkDuration();
            if (!settled) {
              pollTimer = setInterval(checkDuration, 300);
            }
          } catch {
            finish(null);
          }
        })
        .catch(() => finish(null));
    });

    inflight.set(url, promise);
    return promise;
  });
}
