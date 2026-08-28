import { rf } from "@/utils/responsive";
import AddPeopleModal from "@/components/AddPeopleModal";
import Avatar from "@/components/Avatar";
import CalendarPicker from "@/components/CalendarPicker";
import SecureImage from "@/components/SecureImage";
import Icons from "@/constants/icons";
import { useAuth } from "@/hooks/useAuth";
import { useChat, useChatPresence } from "@/hooks/useChat";
import * as socketService from "@/services/socket/socketService";
import {
  ChatMessage,
  ChatPermission,
  MessageAttachment,
  Room,
  RoomMember,
} from "@/types/chat.types";
import {
  canPerformAction,
  filterMessagesByText,
  formatMessageTime,
  getRoomAvatar,
  isOwnMessage,
  isSameDay,
  resolveFileUrl,
  resolveSecureFileUrl,
} from "@/utils/chatHelpers";
import { triggerHaptic } from "@/utils/haptics";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { getStoredToken } from "@/utils/token";
import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File as FileSystemFile, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import EmojiPicker from "rn-emoji-keyboard";

const { ChatIcon: MainChatIcon } = Icons;

// ─── Voice Note Player Component ─────────────────────────────────────────────

/**
 * Plays a voice-note attachment.
 *
 * Backend-stored files live under `/public/...` and direct static access to
 * `/public/...` is DISABLED on the backend (verified at the network level:
 * `/api/v1/*` → 403 without a token, and every other path including `/public/*`
 * → Express JSON 404). Files must be fetched through the auth-gated proxy
 * `GET {origin}/api/v1/secure-file?p=public/<path>` with the token headers
 * (IMAGE_AND_AUDIO_HANDLING.md §4) — so remote voice notes are downloaded to a
 * local cache file with the token and then played from the local file URI.
 * Locally recorded files (file://, content://, blob:) play directly.
 *
 * expo-audio surfaces load/playback failures through the
 * `playbackStatusUpdate` payload (`isLoaded`, `error`) on both iOS
 * (AudioPlayer.swift) and Android (AudioPlayer.kt) — every status is logged so
 * a silent failure is visible instead of hanging in "Playing...".
 */
const voicePlayerPauseHandlers = new Set<() => void>();

/**
 * Download a `/public/...` file via the authenticated `secure-file` proxy into
 * the cache and return a local `file://` source for the audio player.
 */
async function downloadPublicAudio(
  publicPath: string,
): Promise<{ uri: string }> {
  if (Platform.OS === "web") {
    console.log(
      "[Audio] Web: secure-file download not implemented; using direct URL.",
    );
    return { uri: resolveFileUrl(publicPath) };
  }
  const token = await getStoredToken();
  const cacheDir = new Directory(Paths.cache, "voice-notes");
  try {
    if (!cacheDir.exists) {
      cacheDir.create({ intermediates: true, idempotent: true });
    }
  } catch (dirErr) {
    console.log("[Audio] Could not create voice-note cache dir:", dirErr);
  }

  const fileName = (
    publicPath.split("/").pop() || `voice-note-${Date.now()}.m4a`
  ).split("?")[0];
  const dest = new FileSystemFile(cacheDir, fileName);

  // Download fresh every time — Android can leave a partially-written file on
  // a failed download, so a stale `exists` is not trustworthy for playback.
  try {
    if (dest.exists) {
      dest.delete();
    }
  } catch (delErr) {
    console.log("[Audio] Could not clear previous download:", delErr);
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers.authToken = token;
    headers["x-access-token"] = token;
  }
  const secureUrl = resolveSecureFileUrl(publicPath);
  console.log("[Audio] Downloading authenticated audio:", {
    secureUrl,
    hasToken: !!token,
    fileName,
  });
  try {
    await FileSystemFile.downloadFileAsync(secureUrl, dest, {
      headers,
      idempotent: true,
    });
  } catch (secureErr) {
    console.log(
      "[Audio] secure-file download failed, trying direct:",
      secureErr,
    );
    await FileSystemFile.downloadFileAsync(resolveFileUrl(publicPath), dest, {
      headers,
      idempotent: true,
    });
  }

  console.log("[Audio] Playing downloaded audio file:", {
    uri: dest.uri,
    exists: dest.exists,
    size: dest.size,
  });
  return { uri: dest.uri };
}

const WAVEFORM_BAR_COUNT = 27;

// Deterministic pseudo-random bar heights (0..1) seeded from the audio URL,
// so a given voice note always renders the same waveform shape instead of
// reshuffling on every re-render. We don't have decoded amplitude data to
// draw a real waveform from, so this fakes the WhatsApp-style look.
function getWaveformBars(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(0.25 + ((h % 1000) / 1000) * 0.75);
  }
  return bars;
}

function VoiceNotePlayer({ audioUrl }: { audioUrl: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const waveformBars = useMemo(() => getWaveformBars(audioUrl), [audioUrl]);
  const playerRef = useRef<any>(null);
  const downloadedUriRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  const resolvedUrl = useMemo(() => resolveFileUrl(audioUrl), [audioUrl]);
  const isLocal = useMemo(() => {
    const u = (audioUrl || "").toLowerCase();
    return (
      u.startsWith("file://") ||
      u.startsWith("content://") ||
      u.startsWith("blob:")
    );
  }, [audioUrl]);

  const traceStatus = (status: any) => {
    console.log("[Audio] Playback status:", {
      isLoaded: status.isLoaded,
      error: status.error,
      playbackState: status.playbackState,
      currentTime: status.currentTime,
      duration: status.duration,
      playing: status.playing,
      isBuffering: status.isBuffering,
      didJustFinish: status.didJustFinish,
    });
  };

  const handlePlayPause = async () => {
    if (!resolvedUrl) {
      showError("Audio Error", "Audio URL is missing.");
      return;
    }
    try {
      if (playerRef.current) {
        if (isPlaying) {
          playerRef.current.pause();
          setIsPlaying(false);
          console.log("[Audio] Voice note paused:", resolvedUrl);
        } else if (!finishedRef.current) {
          // Resuming a paused note — keep the current position.
          playerRef.current.play();
          setIsPlaying(true);
          console.log("[Audio] Voice note resumed:", resolvedUrl);
        }
        // If finishedRef.current is true but playerRef still exists
        // (race), we fall through to recreate a fresh player below.
      } else {
        // Note finished earlier (or first play): recreate a player over
        // the cached download + restart from the beginning.
      }

      if (playerRef.current && !finishedRef.current) {
        return;
      }

      // A finished player must be recreated (ExoPlayer won't replay from
      // the END state) and any cached player reference cleared.
      if (playerRef.current) {
        try {
          playerRef.current.remove?.();
        } catch {}
        playerRef.current = null;
      }
      finishedRef.current = false;

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => {});

      // Only one voice message plays at a time — pause any other player.
      voicePlayerPauseHandlers.forEach((h) => {
        try {
          h();
        } catch {}
      });

      // Backend `/public/...` files are NOT statically served — they must
      // be fetched through the auth-gated `secure-file` proxy and played
      // from a local cache file. Locally recorded files play directly.
      let source: any;
      if (isLocal) {
        source = { uri: resolvedUrl };
      } else if ((audioUrl || "").startsWith("/public/")) {
        if (!downloadedUriRef.current) {
          const file = await downloadPublicAudio(audioUrl);
          downloadedUriRef.current = file.uri;
        }
        source = { uri: downloadedUriRef.current };
      } else {
        source = { uri: resolvedUrl };
      }

      console.log("[Audio] Creating player for voice note:", {
        audioUrl,
        resolvedUrl,
        isLocal,
        source,
      });

      const newPlayer = createAudioPlayer(source);
      playerRef.current = newPlayer;

      if (newPlayer.addListener) {
        newPlayer.addListener("playbackStatusUpdate", (status: any) => {
          if (!status) return;
          traceStatus(status);
          if (status.error) {
            console.log("[Audio] Playback error from native:", status.error);
            showError("Playback Error", "Could not play audio note.");
            setIsPlaying(false);
            setPosition(0);
            return;
          }
          if (typeof status.currentTime === "number") {
            setPosition(status.currentTime * 1000);
          }
          if (typeof status.duration === "number" && status.duration > 0) {
            setDuration(status.duration * 1000);
          }
          if (status.didJustFinish) {
            console.log("[Audio] Voice note finished.");
            // Release the finished player so the next tap recreates it
            // over the cached download and restarts from 0. (ExoPlayer
            // will not replay an item left in STATE_ENDED.)
            try {
              playerRef.current?.remove?.();
            } catch {}
            playerRef.current = null;
            finishedRef.current = true;
            setIsPlaying(false);
            setPosition(0);
          }
        });
      }

      try {
        newPlayer.play();
        setIsPlaying(true);
      } catch (playErr) {
        console.log("[Audio] play() threw:", playErr);
        showError("Playback Error", "Could not start audio playback.");
        setIsPlaying(false);
      }
    } catch (err) {
      console.log("[Audio] Failed to play voice note:", err);
      showError("Playback Error", "Could not play audio note.");
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    const pauseHandler = () => {
      if (playerRef.current) {
        try {
          playerRef.current.pause();
        } catch {}
      }
      setIsPlaying(false);
    };
    voicePlayerPauseHandlers.add(pauseHandler);
    return () => {
      voicePlayerPauseHandlers.delete(pauseHandler);
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.remove?.();
        } catch {}
        playerRef.current = null;
      }
    };
  }, []);

  const progress = duration > 0 ? (position / duration) * 100 : 0;
  const posSec = Math.floor(position / 1000);
  const durSec = Math.floor(duration / 1000);

  return (
    <View style={vnStyles.container}>
      <TouchableOpacity
        onPress={handlePlayPause}
        style={vnStyles.playBtn}
        activeOpacity={0.8}
      >
        <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#fff" />
      </TouchableOpacity>
      <View style={vnStyles.trackContainer}>
        <View style={vnStyles.waveformRow}>
          {waveformBars.map((h, i) => {
            const barProgress = (i / waveformBars.length) * 100;
            const isActive = barProgress <= progress;
            return (
              <View
                key={i}
                style={[
                  vnStyles.waveformBar,
                  {
                    height: 3 + h * 13,
                    backgroundColor: isActive ? "#00DEAB" : "#D1D5DB",
                  },
                ]}
              />
            );
          })}
        </View>
        <Text style={vnStyles.timeText}>
          {duration > 0
            ? `${Math.floor(posSec / 60)}:${(posSec % 60).toString().padStart(2, "0")} / ${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, "0")}`
            : isPlaying
              ? "Playing..."
              : "Voice note"}
        </Text>
      </View>
    </View>
  );
}

// ─── Attachment Popup Modal Component (System UI consistent popup) ───────────

function AttachmentModal({
  visible,
  onClose,
  onSelectCamera,
  onSelectGallery,
  onSelectDocument,
}: {
  visible: boolean;
  onClose: () => void;
  onSelectCamera: () => void;
  onSelectGallery: () => void;
  onSelectDocument: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={attModalStyles.overlay} onPress={onClose}>
        <Pressable
          style={attModalStyles.container}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={attModalStyles.header}>
            <Text style={attModalStyles.title}>Share Attachment</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <View style={attModalStyles.optionsRow}>
            <TouchableOpacity
              style={attModalStyles.optionBtn}
              activeOpacity={0.8}
              onPress={() => {
                onClose();
                onSelectCamera();
              }}
            >
              <View
                style={[
                  attModalStyles.iconCircle,
                  { backgroundColor: "#ECFDF5" },
                ]}
              >
                <Ionicons name="camera" size={24} color="#10B981" />
              </View>
              <Text style={attModalStyles.optionLabel}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={attModalStyles.optionBtn}
              activeOpacity={0.8}
              onPress={() => {
                onClose();
                onSelectGallery();
              }}
            >
              <View
                style={[
                  attModalStyles.iconCircle,
                  { backgroundColor: "#EFF6FF" },
                ]}
              >
                <Ionicons name="images" size={24} color="#3B82F6" />
              </View>
              <Text style={attModalStyles.optionLabel}>Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={attModalStyles.optionBtn}
              activeOpacity={0.8}
              onPress={() => {
                onClose();
                onSelectDocument();
              }}
            >
              <View
                style={[
                  attModalStyles.iconCircle,
                  { backgroundColor: "#F5F3FF" },
                ]}
              >
                <Ionicons name="document-text" size={24} color="#8B5CF6" />
              </View>
              <Text style={attModalStyles.optionLabel}>Document</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const attModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  container: {
    width: "100%",
    maxWidth: 330,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  optionBtn: {
    alignItems: "center",
    gap: 8,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
});

const vnStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
    gap: 10,
    minWidth: 180,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  trackContainer: {
    flex: 1,
    gap: 4,
  },
  waveformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 16,
  },
  waveformBar: {
    flex: 1,
    borderRadius: 1,
  },
  timeText: {
    fontSize: rf(10),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
});

// ─── Date Panel ───────────────────────────────────────────────────────────────

const DATE_RANGES = ["Today", "Last 7 days", "Last 30 days", "Last 90 days"];

function DateFilterPanel({
  onFilterChange,
}: {
  onFilterChange: (start: Date | null, end: Date | null) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [startDate, setStartDate] = useState<Date | null>(today);
  const [endDate, setEndDate] = useState<Date | null>(today);
  const [selectedRange, setSelectedRange] = useState<string | null>("Today");
  // Fires on mount too (no first-render skip) so the header's Date chip
  // reflects the "Today" default immediately instead of only after the
  // user picks a different range.
  useEffect(() => {
    onFilterChange(startDate, endDate);
  }, [startDate, endDate, onFilterChange]);

  const handleRangeSelect = (range: string) => {
    setSelectedRange(range);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let start: Date;
    switch (range) {
      case "Today":
        start = new Date(now);
        break;
      case "Last 7 days":
        start = new Date(now);
        start.setDate(now.getDate() - 6);
        break;
      case "Last 30 days":
        start = new Date(now);
        start.setDate(now.getDate() - 29);
        break;
      case "Last 90 days":
        start = new Date(now);
        start.setDate(now.getDate() - 89);
        break;
      default:
        start = new Date(now);
    }
    setStartDate(start);
    setEndDate(new Date(now));
  };

  const handleSelectStart = (d: Date) => {
    setStartDate(d);
    setSelectedRange(null);
  };

  const handleSelectEnd = (d: Date) => {
    setEndDate(d);
    setSelectedRange(null);
  };

  return (
    <View style={dp.container}>
      <View style={dp.sidebar}>
        {DATE_RANGES.map((r) => (
          <TouchableOpacity
            key={r}
            style={[dp.rangeItem, selectedRange === r && dp.rangeItemActive]}
            onPress={() => handleRangeSelect(r)}
            activeOpacity={0.7}
          >
            <Text
              style={[dp.rangeText, selectedRange === r && dp.rangeTextActive]}
            >
              {r}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={dp.calWrap}>
        <CalendarPicker
          startDate={startDate}
          endDate={endDate}
          onSelectStart={handleSelectStart}
          onSelectEnd={handleSelectEnd}
          onDone={() => {}}
          compact={true}
        />
      </View>
    </View>
  );
}

const dp = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 8,
  },
  sidebar: {
    width: 100,
    gap: 0,
  },
  rangeItem: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  rangeItemActive: {},
  rangeText: {
    fontSize: rf(11.5),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
  rangeTextActive: {
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  calWrap: {
    flex: 1,
  },
});

// ─── Attachments Panel ────────────────────────────────────────────────────────

const ATTACH_TABS = ["Images", "Videos", "Docs", "Links"];

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "heic"];
const VIDEO_EXTS = ["mp4", "mov", "avi", "webm", "mkv", "m4v", "3gp"];
const AUDIO_EXTS = ["mp3", "wav", "m4a", "ogg", "caf"];

function getAttachmentExt(a: MessageAttachment): string {
  // Prefer `url` over `name` (the server-assigned filename in `name` is
  // often extension-less/generic, e.g. "attachment") and strip any
  // query/hash suffix before splitting so `foo.jpg?token=…` still resolves
  // to `jpg` instead of `jpg?token=…`.
  const candidate = (a.url || a.name || "").split(/[?#]/)[0];
  return candidate.split(".").pop()?.toLowerCase() || "";
}

function isImageAttachment(a: MessageAttachment): boolean {
  return (
    IMAGE_EXTS.includes(getAttachmentExt(a)) ||
    (a.type || "").startsWith("image/")
  );
}

function isVideoAttachment(a: MessageAttachment): boolean {
  return (
    VIDEO_EXTS.includes(getAttachmentExt(a)) ||
    (a.type || "").startsWith("video/")
  );
}

function isAudioAttachment(a: MessageAttachment): boolean {
  return (
    AUDIO_EXTS.includes(getAttachmentExt(a)) ||
    (a.type || "").startsWith("audio/")
  );
}

// Matches http(s) URLs embedded in a message's plain text.
const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;

function AttachmentsPanel({ messages }: { messages: ChatMessage[] }) {
  const [activeTab, setActiveTab] = useState("Images");

  const imageAttachments = useMemo(
    () =>
      messages.flatMap((m) => (m.attachments || []).filter(isImageAttachment)),
    [messages],
  );
  const videoAttachments = useMemo(
    () =>
      messages.flatMap((m) => (m.attachments || []).filter(isVideoAttachment)),
    [messages],
  );
  const docAttachments = useMemo(
    () =>
      messages.flatMap((m) =>
        (m.attachments || []).filter(
          (a) =>
            !isImageAttachment(a) &&
            !isVideoAttachment(a) &&
            !isAudioAttachment(a),
        ),
      ),
    [messages],
  );
  const links = useMemo(() => {
    const found: { url: string; createdAt?: string }[] = [];
    for (const m of messages) {
      const matches = m.text?.match(URL_PATTERN);
      if (matches) {
        for (const url of matches) found.push({ url, createdAt: m.createdAt });
      }
    }
    return found;
  }, [messages]);

  return (
    <View style={ap.container}>
      <View style={ap.tabRow}>
        {ATTACH_TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[ap.tab, activeTab === t && ap.tabActive]}
            onPress={() => setActiveTab(t)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={
                t === "Images"
                  ? "image-outline"
                  : t === "Videos"
                    ? "videocam-outline"
                    : t === "Docs"
                      ? "document-text-outline"
                      : "link-outline"
              }
              size={13}
              color={activeTab === t ? "#1D1D1D" : "#9CA3AF"}
              style={{ marginRight: 4 }}
            />
            <Text style={[ap.tabText, activeTab === t && ap.tabTextActive]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {activeTab === "Images" &&
        (imageAttachments.length > 0 ? (
          <View style={ap.imageGrid}>
            {imageAttachments.map((item, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.85}
                style={ap.imageThumbWrap}
              >
                <SecureImage url={item.url} style={ap.imageThumb} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <EmptyAttachTab icon="image-outline" label="No images found" />
        ))}
      {activeTab === "Videos" &&
        (videoAttachments.length > 0 ? (
          <View style={ap.fileList}>
            {videoAttachments.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={ap.fileRow}
                activeOpacity={0.7}
                onPress={() =>
                  Linking.openURL(resolveFileUrl(item.url)).catch(() => {})
                }
              >
                <View style={ap.fileIconBadge}>
                  <Ionicons name="videocam" size={16} color="#00DEAB" />
                </View>
                <Text style={ap.fileName} numberOfLines={1}>
                  {item.name || "Video"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <EmptyAttachTab icon="videocam-outline" label="No videos found" />
        ))}
      {activeTab === "Docs" &&
        (docAttachments.length > 0 ? (
          <View style={ap.fileList}>
            {docAttachments.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={ap.fileRow}
                activeOpacity={0.7}
                onPress={() =>
                  Linking.openURL(resolveFileUrl(item.url)).catch(() => {})
                }
              >
                <View style={ap.fileIconBadge}>
                  <Ionicons name="document-text" size={16} color="#00DEAB" />
                </View>
                <Text style={ap.fileName} numberOfLines={1}>
                  {item.name || "Document"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <EmptyAttachTab icon="document-text-outline" label="No docs found" />
        ))}
      {activeTab === "Links" &&
        (links.length > 0 ? (
          <View style={ap.fileList}>
            {links.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={ap.fileRow}
                activeOpacity={0.7}
                onPress={() => Linking.openURL(item.url).catch(() => {})}
              >
                <View style={ap.fileIconBadge}>
                  <Ionicons name="link" size={16} color="#00DEAB" />
                </View>
                <Text style={ap.fileName} numberOfLines={1}>
                  {item.url}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <EmptyAttachTab icon="link-outline" label="No links found" />
        ))}
    </View>
  );
}

function EmptyAttachTab({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}) {
  return (
    <View style={ap.emptyTab}>
      <View style={ap.emptyTabIconCircle}>
        <Ionicons name={icon} size={22} color="#C7CBD1" />
      </View>
      <Text style={ap.emptyTabText}>{label}</Text>
    </View>
  );
}

// `width: "25%"` + `aspectRatio: 1` with no explicit height (inside a
// `flexWrap` row) doesn't reliably resolve a nonzero size in RN's Yoga
// layout — it rendered as an invisible 0-height box even once the image
// itself was confirmed loaded and cached. Explicit pixel dimensions (same
// approach as the message bubble's fixed 220×180 attachedImage, which
// always rendered correctly) sidesteps that.
const ATTACHMENT_GRID_GAP = 3;
const ATTACHMENT_THUMB_SIZE =
  Math.floor((Dimensions.get("window").width - ATTACHMENT_GRID_GAP * 4) / 3) -
  ATTACHMENT_GRID_GAP;

const ap = StyleSheet.create({
  container: { paddingBottom: 4 },
  tabRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#00DEAB",
  },
  tabText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },
  tabTextActive: {
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: ATTACHMENT_GRID_GAP,
    padding: ATTACHMENT_GRID_GAP,
  },
  imageThumbWrap: {
    borderRadius: 10,
    overflow: "hidden",
  },
  imageThumb: {
    width: ATTACHMENT_THUMB_SIZE,
    height: ATTACHMENT_THUMB_SIZE,
    backgroundColor: "#EDEEF1",
  },
  emptyTab: {
    padding: 32,
    alignItems: "center",
  },
  emptyTabIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTabText: {
    fontSize: rf(13),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
  },
  fileList: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  fileIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: {
    flex: 1,
    fontSize: rf(13),
    color: "#1F2937",
    fontFamily: "SF_Pro_Medium",
  },
});

// ─── Date Divider Component ───────────────────────────────────────────────────

function formatDateDivider(
  dateInput?: Date | string | null,
  isChannel?: boolean,
): string {
  if (!dateInput) {
    return isChannel ? "Today's Discussion" : "Today's Chat";
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return isChannel ? "Today's Discussion" : "Today's Chat";
  }
  const now = new Date();
  if (isSameDay(d, now)) {
    return isChannel ? "Today's Discussion" : "Today's Chat";
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) {
    return "Yesterday";
  }

  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()];

  return `${dayName} ${dayNum} ${monthName}`;
}

function DateDivider({ label }: { label: string }) {
  return (
    <View style={ddStyles.container}>
      <View style={ddStyles.line} />
      <TouchableOpacity style={ddStyles.pill} activeOpacity={0.8}>
        <Text style={ddStyles.text}>{label}</Text>
        <Ionicons
          name="chevron-down"
          size={13}
          color="#6B7280"
          style={{ marginLeft: 3 }}
        />
      </TouchableOpacity>
    </View>
  );
}

const ddStyles = StyleSheet.create({
  container: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
    width: "100%",
  },
  line: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4.5,
    zIndex: 1,
  },
  text: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
});

// ─── Message Action Icons ─────────────────────────────────────────────────────

function MessageActions({
  isOwn,
  onReact,
  onEmoji,
  onForward,
  onEdit,
  onReply,
  onMore,
}: {
  isOwn: boolean;
  onReact?: () => void;
  onEmoji?: () => void;
  onForward?: () => void;
  onEdit?: () => void;
  onReply?: () => void;
  onMore?: () => void;
}) {
  const icons: {
    name: React.ComponentProps<typeof Ionicons>["name"];
    handler?: () => void;
  }[] = isOwn
    ? [
        { name: "thumbs-up-outline", handler: onReact },
        { name: "happy-outline", handler: onEmoji },
        { name: "arrow-redo-outline", handler: onForward },
        { name: "arrow-undo-outline", handler: onReply },
        { name: "ellipsis-vertical", handler: onMore },
      ]
    : [
        { name: "thumbs-up-outline", handler: onReact },
        { name: "happy-outline", handler: onEmoji },
        { name: "arrow-redo-outline", handler: onForward },
        { name: "pencil-outline", handler: onEdit },
        { name: "arrow-undo-outline", handler: onReply },
        { name: "ellipsis-vertical", handler: onMore },
      ];

  return (
    <View style={styles.actionsRow}>
      {icons.map((icon, idx) => (
        <TouchableOpacity
          key={idx}
          activeOpacity={0.7}
          style={styles.actionBtn}
          onPress={icon.handler}
        >
          <Ionicons name={icon.name} size={14} color="#9CA3AF" />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({
  message,
  currentUserId,
  members,
  showSenderName = false,
  isChannel = false,
  repliedMessage,
  onLongPress,
  onReactionPress,
}: {
  message: ChatMessage;
  currentUserId: number;
  members?: RoomMember[];
  showSenderName?: boolean;
  isChannel?: boolean;
  repliedMessage?: ChatMessage | null;
  onLongPress?: (msg: ChatMessage, e?: GestureResponderEvent) => void;
  onReactionPress?: (msg: ChatMessage, emoji: string) => void;
}) {
  const own = isOwnMessage(message, currentUserId);
  const senderMember = members?.find((m) => m.id === message.sender_id);
  const senderName =
    message.sender_name ||
    (senderMember
      ? `${senderMember.first_name} ${senderMember.last_name}`
      : "");
  const senderImage =
    message.sender_image ??
    senderMember?.image ??
    (message as any).sender?.image ??
    (message as any).user?.image ??
    null;
  const time = formatMessageTime(message.createdAt);

  // Read receipt — only meaningful for a 1:1 direct chat's own messages
  // (a channel/group has many readers, so a single tick pair doesn't map
  // cleanly the way it does in WhatsApp's 1:1 view).
  const otherMember = members?.find((m) => m.id !== currentUserId);
  const isReadByOther =
    !isChannel &&
    !!otherMember &&
    (message.is_read ?? []).includes(otherMember.id);

  const repliedSenderMember = repliedMessage
    ? members?.find((m) => m.id === repliedMessage.sender_id)
    : undefined;
  const repliedSenderName = repliedMessage
    ? isOwnMessage(repliedMessage, currentUserId)
      ? "You"
      : repliedMessage.sender_name ||
        (repliedSenderMember
          ? `${repliedSenderMember.first_name} ${repliedSenderMember.last_name}`
          : "")
    : "";
  const repliedPreviewText = repliedMessage
    ? repliedMessage.text ||
      (repliedMessage.attachments?.length ? "📎 Attachment" : "")
    : "";

  const likedByMe = new Set(
    (message.reactions ?? [])
      .filter((r) => r.users.includes(currentUserId))
      .map((r) => r.emoji),
  );

  const audioAtt = message.attachments?.find((a) => {
    const str = (a.url || a.name || "").toLowerCase();
    return (
      str.includes(".m4a") ||
      str.includes(".mp3") ||
      str.includes(".wav") ||
      str.includes(".webm") ||
      str.includes(".ogg") ||
      str.includes(".caf") ||
      (a.type || "").startsWith("audio/")
    );
  });

  const imageAtts = message.attachments?.filter((a) => {
    const str = (a.url || a.name || "").toLowerCase();
    return (
      str.includes(".jpg") ||
      str.includes(".jpeg") ||
      str.includes(".png") ||
      str.includes(".webp") ||
      str.includes(".gif") ||
      str.includes(".heic") ||
      (a.type || "").startsWith("image/")
    );
  });

  const docAtts = message.attachments?.filter((a) => {
    const str = (a.url || a.name || "").toLowerCase();
    const isAudio =
      str.includes(".m4a") ||
      str.includes(".mp3") ||
      str.includes(".wav") ||
      str.includes(".caf") ||
      str.includes("audio");
    const isImage =
      str.includes(".jpg") ||
      str.includes(".jpeg") ||
      str.includes(".png") ||
      str.includes(".webp") ||
      str.includes(".gif") ||
      str.includes(".heic") ||
      (a.type || "").startsWith("image/");
    return !isAudio && !isImage;
  });

  const bubbleScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(bubbleScale, {
      toValue: 0.95,
      friction: 6,
      tension: 250,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(bubbleScale, {
      toValue: 1,
      friction: 6,
      tension: 250,
      useNativeDriver: true,
    }).start();
  };

  if (!own) {
    return (
      <View style={styles.messageWrapper}>
        <View style={styles.incomingRow}>
          <Avatar
            name={senderName}
            imagePath={senderImage}
            size={34}
            borderRadius={20}
            fontSize={14}
            fontFamily="SF_Pro_Regular"
          />
          <View style={styles.incomingContent}>
            <Text style={styles.senderMeta}>
              {showSenderName ? `${senderName} ` : null}
              <Text style={styles.timeMeta}>
                {showSenderName ? `| ${time}` : time}
              </Text>
            </Text>
            <Animated.View style={{ transform: [{ scale: bubbleScale }] }}>
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onLongPress={(e) => onLongPress?.(message, e)}
                delayLongPress={250}
                style={[
                  styles.incomingBubble,
                  message.is_pinned && styles.bubblePinnedIncoming,
                ]}
              >
                {repliedMessage ? (
                  <View style={styles.quotedPreview}>
                    <Text style={styles.quotedSender} numberOfLines={1}>
                      {repliedSenderName}
                    </Text>
                    <Text style={styles.quotedText} numberOfLines={1}>
                      {repliedPreviewText}
                    </Text>
                  </View>
                ) : null}
                {message.is_forwarded ? (
                  <View style={styles.forwardedRow}>
                    <Ionicons
                      name="arrow-redo-outline"
                      size={11}
                      color="#6B7280"
                    />
                    <Text style={styles.forwardedText}>
                      Forwarded
                      {message.forwarded_from_name
                        ? ` from ${message.forwarded_from_name}`
                        : ""}
                    </Text>
                  </View>
                ) : null}
                {audioAtt ? <VoiceNotePlayer audioUrl={audioAtt.url} /> : null}
                {imageAtts && imageAtts.length > 0 ? (
                  <View style={styles.imageAttachmentContainer}>
                    {imageAtts.map((att, i) => (
                      <SecureImage
                        key={i}
                        url={att.url}
                        style={styles.attachedImage}
                        resizeMode="cover"
                      />
                    ))}
                  </View>
                ) : null}
                {docAtts && docAtts.length > 0 ? (
                  <View style={styles.docAttachmentContainer}>
                    {docAtts.map((doc, i) => (
                      <View key={i} style={styles.docRow}>
                        <Ionicons
                          name="document-text"
                          size={18}
                          color="#00DEAB"
                        />
                        <Text style={styles.docName} numberOfLines={1}>
                          {doc.name || "Document"}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {message.text &&
                message.text !== "🎤 Voice message" &&
                !message.text.startsWith("📎 ") ? (
                  <Text style={styles.bubbleText}>{message.text}</Text>
                ) : message.text &&
                  message.text.startsWith("📎 ") &&
                  !imageAtts?.length &&
                  !docAtts?.length &&
                  !audioAtt ? (
                  <Text style={styles.bubbleText}>{message.text}</Text>
                ) : null}
              </Pressable>
            </Animated.View>
            {message.is_pinned && (
              <View style={styles.pinBadge}>
                <Ionicons name="pin" size={11} color="#00DEAB" />
                <Text style={styles.pinBadgeText}>Pinned</Text>
              </View>
            )}
            {message.reactions && message.reactions.length > 0 && (
              <View style={styles.reactionsRow}>
                {message.reactions.map((r, idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.7}
                    style={[
                      styles.reactionBadge,
                      likedByMe.has(r.emoji) && styles.reactionBadgeActive,
                    ]}
                    onPress={() => onReactionPress?.(message, r.emoji)}
                  >
                    <Text
                      style={[
                        styles.reactionText,
                        likedByMe.has(r.emoji) && styles.reactionTextActive,
                      ]}
                    >
                      {r.emoji} {r.users.length}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.messageWrapper}>
      <View style={styles.outgoingRow}>
        <View style={styles.outgoingContent}>
          <Text style={styles.senderMetaOutgoing}>
            {showSenderName ? `${senderName} ` : null}
            <Text style={styles.timeMeta}>
              {showSenderName ? `| ${time}` : time}
            </Text>{" "}
            <Ionicons
              name={isReadByOther ? "checkmark-done" : "checkmark"}
              size={13}
              color={isReadByOther ? "#0DDFAB" : "#9CA3AF"}
            />
          </Text>
          <Animated.View style={{ transform: [{ scale: bubbleScale }] }}>
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onLongPress={(e) => onLongPress?.(message, e)}
              delayLongPress={250}
              style={[
                styles.outgoingBubble,
                message.is_pinned && styles.bubblePinnedOutgoing,
              ]}
            >
              {repliedMessage ? (
                <View style={styles.quotedPreview}>
                  <Text style={styles.quotedSender} numberOfLines={1}>
                    {repliedSenderName}
                  </Text>
                  <Text style={styles.quotedText} numberOfLines={1}>
                    {repliedPreviewText}
                  </Text>
                </View>
              ) : null}
              {message.is_forwarded ? (
                <View style={styles.forwardedRow}>
                  <Ionicons
                    name="arrow-redo-outline"
                    size={11}
                    color="#6B7280"
                  />
                  <Text style={styles.forwardedText}>
                    Forwarded
                    {message.forwarded_from_name
                      ? ` from ${message.forwarded_from_name}`
                      : ""}
                  </Text>
                </View>
              ) : null}
              {audioAtt ? <VoiceNotePlayer audioUrl={audioAtt.url} /> : null}
              {imageAtts && imageAtts.length > 0 ? (
                <View style={styles.imageAttachmentContainer}>
                  {imageAtts.map((att, i) => (
                    <SecureImage
                      key={i}
                      url={att.url}
                      style={styles.attachedImage}
                      resizeMode="cover"
                    />
                  ))}
                </View>
              ) : null}
              {docAtts && docAtts.length > 0 ? (
                <View style={styles.docAttachmentContainer}>
                  {docAtts.map((doc, i) => (
                    <View key={i} style={styles.docRow}>
                      <Ionicons
                        name="document-text"
                        size={18}
                        color="#00DEAB"
                      />
                      <Text style={styles.docName} numberOfLines={1}>
                        {doc.name || "Document"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {message.text &&
              message.text !== "🎤 Voice message" &&
              !message.text.startsWith("📎 ") ? (
                <Text style={styles.bubbleText}>{message.text}</Text>
              ) : message.text &&
                message.text.startsWith("📎 ") &&
                !imageAtts?.length &&
                !docAtts?.length &&
                !audioAtt ? (
                <Text style={styles.bubbleText}>{message.text}</Text>
              ) : null}
            </Pressable>
          </Animated.View>
          {message.is_pinned && (
            <View style={styles.pinBadge}>
              <Ionicons name="pin" size={11} color="#00DEAB" />
              <Text style={styles.pinBadgeText}>Pinned</Text>
            </View>
          )}
          {message.reactions && message.reactions.length > 0 && (
            <View style={styles.reactionsRow}>
              {message.reactions.map((r, idx) => (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.7}
                  style={[
                    styles.reactionBadge,
                    likedByMe.has(r.emoji) && styles.reactionBadgeActive,
                  ]}
                  onPress={() => onReactionPress?.(message, r.emoji)}
                >
                  <Text
                    style={[
                      styles.reactionText,
                      likedByMe.has(r.emoji) && styles.reactionTextActive,
                    ]}
                  >
                    {r.emoji} {r.users.length}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <Avatar
          name={senderName}
          imagePath={senderImage}
          size={34}
          borderRadius={20}
          fontSize={14}
          fontFamily="SF_Pro_Regular"
        />
      </View>
    </View>
  );
});

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function WhatsAppMessageModal({
  visible,
  message,
  targetY,
  currentUserId,
  callerPermission,
  onClose,
  onReactionSelect,
  onOpenEmojiPicker,
  onReply,
  onCopy,
  onForward,
  onPin,
  onEdit,
  onDelete,
}: {
  visible: boolean;
  message: ChatMessage | null;
  targetY?: number;
  currentUserId: number;
  callerPermission?: ChatPermission;
  onClose: () => void;
  onReactionSelect: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible && message) {
      setMounted(true);
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.85);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 75,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMounted(false);
      });
    }
  }, [visible, message]);

  if (!mounted || !message) return null;

  const own = isOwnMessage(message, currentUserId);
  const canEditOthers = canPerformAction(callerPermission, "edit");
  const canDeleteOthers = canPerformAction(callerPermission, "delete");
  const allowEdit = own || canEditOthers;
  const allowDelete = own || canDeleteOthers;

  const screenHeight = Dimensions.get("window").height;
  const clampedY = targetY
    ? Math.max(90, Math.min(targetY - 70, screenHeight - 430))
    : screenHeight * 0.25;

  const handlePressAction = (actionFn: () => void) => {
    triggerHaptic("selection");
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
      actionFn();
    });
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => handlePressAction(() => {})}
    >
      <Animated.View style={[waModalStyles.overlay, { opacity: fadeAnim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => handlePressAction(() => {})}
        />
        <Animated.View
          style={[
            waModalStyles.focusedWrapper,
            {
              top: clampedY,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* 1. Quick Emojis Pill Attached On Top */}
          <View
            style={[
              waModalStyles.emojiBar,
              own ? waModalStyles.alignRight : waModalStyles.alignLeft,
            ]}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={waModalStyles.emojiItem}
                activeOpacity={0.6}
                onPress={() => handlePressAction(() => onReactionSelect(emoji))}
              >
                <Text style={waModalStyles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={waModalStyles.emojiItemPlus}
              activeOpacity={0.6}
              onPress={() => handlePressAction(onOpenEmojiPicker)}
            >
              <Ionicons name="add" size={18} color="#4B5563" />
            </TouchableOpacity>
          </View>

          {/* 2. Focused Message Bubble Highlight */}
          <View
            style={[
              waModalStyles.focusedBubble,
              own ? waModalStyles.ownBubble : waModalStyles.otherBubble,
            ]}
          >
            {!own && (
              <Text style={waModalStyles.senderName}>
                {message.sender_name || "User"}
              </Text>
            )}
            <Text
              style={[
                waModalStyles.bubbleText,
                own ? waModalStyles.ownText : waModalStyles.otherText,
              ]}
            >
              {message.text || "Message Attachment"}
            </Text>
          </View>

          {/* 3. WhatsApp Context Actions Menu Card Attached Below */}
          <View
            style={[
              waModalStyles.menuCard,
              own ? waModalStyles.alignRight : waModalStyles.alignLeft,
            ]}
          >
            <TouchableOpacity
              style={waModalStyles.menuItem}
              activeOpacity={0.6}
              onPress={() => handlePressAction(onReply)}
            >
              <Ionicons
                name="arrow-undo-outline"
                size={18}
                color="#374151"
                style={waModalStyles.menuIcon}
              />
              <Text style={waModalStyles.menuText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={waModalStyles.menuItem}
              activeOpacity={0.6}
              onPress={() => handlePressAction(onCopy)}
            >
              <Ionicons
                name="copy-outline"
                size={18}
                color="#374151"
                style={waModalStyles.menuIcon}
              />
              <Text style={waModalStyles.menuText}>Copy Text</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={waModalStyles.menuItem}
              activeOpacity={0.6}
              onPress={() => handlePressAction(onForward)}
            >
              <Ionicons
                name="arrow-redo-outline"
                size={18}
                color="#374151"
                style={waModalStyles.menuIcon}
              />
              <Text style={waModalStyles.menuText}>Forward</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={waModalStyles.menuItem}
              activeOpacity={0.6}
              onPress={() => handlePressAction(onPin)}
            >
              <Ionicons
                name="pin-outline"
                size={18}
                color="#374151"
                style={waModalStyles.menuIcon}
              />
              <Text style={waModalStyles.menuText}>
                {message.is_pinned ? "Unpin Message" : "Pin Message"}
              </Text>
            </TouchableOpacity>

            {allowEdit && (
              <TouchableOpacity
                style={waModalStyles.menuItem}
                activeOpacity={0.6}
                onPress={() => handlePressAction(onEdit)}
              >
                <Ionicons
                  name="pencil-outline"
                  size={18}
                  color="#374151"
                  style={waModalStyles.menuIcon}
                />
                <Text style={waModalStyles.menuText}>Edit Message</Text>
              </TouchableOpacity>
            )}

            {allowDelete && (
              <TouchableOpacity
                style={[waModalStyles.menuItem, waModalStyles.menuItemDelete]}
                activeOpacity={0.6}
                onPress={() => handlePressAction(onDelete)}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color="#EF4444"
                  style={waModalStyles.menuIcon}
                />
                <Text
                  style={[waModalStyles.menuText, waModalStyles.menuTextDelete]}
                >
                  Delete Message
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function DeleteMessageModal({
  visible,
  message,
  currentUserId,
  callerPermission,
  onClose,
  onConfirmDelete,
}: {
  visible: boolean;
  message: ChatMessage | null;
  currentUserId: number;
  callerPermission?: ChatPermission;
  onClose: () => void;
  onConfirmDelete: (deleteFor: "self" | "everyone") => void;
}) {
  if (!visible || !message) return null;

  const own = isOwnMessage(message, currentUserId);
  const canDeleteOthers = canPerformAction(callerPermission, "delete");
  const allowDeleteEveryone = own || canDeleteOthers;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={delModalStyles.overlay} onPress={onClose}>
        <Pressable
          style={delModalStyles.card}
          onStartShouldSetResponder={() => true}
        >
          <View style={delModalStyles.iconWrap}>
            <Ionicons name="trash-outline" size={26} color="#EF4444" />
          </View>
          <Text style={delModalStyles.title}>Delete Message?</Text>
          <Text style={delModalStyles.subtitle}>
            Choose how you want to delete this message.
          </Text>

          <View style={delModalStyles.actionsStack}>
            {allowDeleteEveryone && (
              <TouchableOpacity
                style={delModalStyles.deleteEveryoneBtn}
                activeOpacity={0.8}
                onPress={() => {
                  onConfirmDelete("everyone");
                  onClose();
                }}
              >
                <Ionicons
                  name="trash"
                  size={16}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={delModalStyles.deleteEveryoneText}>
                  Delete for Everyone
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={delModalStyles.deleteSelfBtn}
              activeOpacity={0.7}
              onPress={() => {
                onConfirmDelete("self");
                onClose();
              }}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color="#EF4444"
                style={{ marginRight: 8 }}
              />
              <Text style={delModalStyles.deleteSelfText}>Delete for Me</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={delModalStyles.cancelBtn}
              activeOpacity={0.7}
              onPress={onClose}
            >
              <Text style={delModalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const delModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: rf(18),
    fontFamily: "SF_Pro_Bold",
    color: "#1F2937",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
  actionsStack: {
    width: "100%",
    gap: 10,
  },
  deleteEveryoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    borderRadius: 12,
    paddingVertical: 12,
    width: "100%",
  },
  deleteEveryoneText: {
    color: "#FFFFFF",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
  },
  deleteSelfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 12,
    paddingVertical: 12,
    width: "100%",
  },
  deleteSelfText: {
    color: "#EF4444",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
  },
  cancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 12,
    width: "100%",
  },
  cancelText: {
    color: "#4B5563",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
  },
});

const waModalStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    zIndex: 9999,
    elevation: 9999,
  },
  focusedWrapper: {
    position: "absolute",
    left: 20,
    right: 20,
    gap: 8,
  },
  alignRight: {
    alignSelf: "flex-end",
  },
  alignLeft: {
    alignSelf: "flex-start",
  },
  emojiBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
    width: 275,
  },
  emojiItem: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: {
    fontSize: rf(20),
  },
  emojiItemPlus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  focusedBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  ownBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#00DEAB",
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#00DEAB",
    marginBottom: 2,
  },
  bubbleText: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Regular",
    lineHeight: 20,
  },
  ownText: {
    color: "#1F2937",
  },
  otherText: {
    color: "#1F2937",
  },
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    width: 240,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemDelete: {
    borderBottomWidth: 0,
    backgroundColor: "rgba(254, 242, 242, 0.6)",
  },
  menuIcon: {
    marginRight: 12,
  },
  menuText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
  },
  menuTextDelete: {
    color: "#EF4444",
    fontFamily: "SF_Pro_Semibold",
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type FilterTab = "date" | "attachments" | "chat_member" | "post_type" | null;

export default function ConversationScreen() {
  const params = useLocalSearchParams<{
    roomId?: string;
    name?: string;
    initials?: string;
    isChannel?: string;
    roomType?: string;
  }>();
  const name = params.name ?? "Chat";
  const initials = params.initials ?? "C";
  const isChannel = params.isChannel === "true";
  const roomId = params.roomId;

  const {
    state,
    fetchMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    togglePin,
    fetchPostTypes,
    postTypes,
    addMember,
    fetchRoomPermissions,
    roomPermissions,
    roomCreator,
    setSearchQuery,
    fetchPinnedMessages,
    setCurrentRoom,
  } = useChat();
  const { typingUsers } = useChatPresence();
  const authState = useAuth();
  const currentUserId = authState?.state?.user?.id ?? 0;
  const currentUserName = authState?.state?.user
    ? `${authState.state.user.first_name} ${authState.state.user.last_name}`.trim() ||
      `User #${currentUserId}`
    : `User #${currentUserId}`;

  // ── Room-level permission gating ──────────────────────────────────────
  // Room permissions come from GET /chat/room-permissions/:roomId
  // (per-member: "Full edit" | "Edit" | "Comment" | "View Only").
  // The room creator always holds the highest permission.
  const callerPermission = useMemo<ChatPermission | undefined>(() => {
    if (currentUserId === roomCreator) return "Full edit";
    const found = (roomPermissions ?? []).find(
      (p) => p.userId === currentUserId,
    );
    return found?.permission as ChatPermission | undefined;
  }, [currentUserId, roomCreator, roomPermissions]);

  // "View Only" members (and channel non-members) may read but not send.
  const canSendMessage = useMemo(() => {
    if (!isChannel) return true;
    if (!callerPermission) return true;
    return canPerformAction(callerPermission, "comment");
  }, [isChannel, callerPermission]);

  // Reactions require at least comment-level access.
  const canReact = useMemo(() => {
    if (!isChannel) return true;
    if (!callerPermission) return true;
    return canPerformAction(callerPermission, "comment");
  }, [isChannel, callerPermission]);

  // Only Edit / Full edit may tag messages with a post type.
  const canManagePostTypes = useMemo(() => {
    if (!callerPermission) return false;
    return canPerformAction(callerPermission, "edit");
  }, [callerPermission]);

  // Only the room creator / Full edit may add people to a channel.
  const canManageMembers = useMemo(() => {
    if (!callerPermission) return false;
    return canPerformAction(callerPermission, "manage");
  }, [callerPermission]);

  const [message, setMessage] = useState("");
  const scrollRef = useRef<any>(null);
  const [postTypeOpen, setPostTypeOpen] = useState(false);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [deleteModalMsg, setDeleteModalMsg] = useState<ChatMessage | null>(
    null,
  );

  // ── @-mention picker ───────────────────────────────────────────────────
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<number[]>([]);
  [];
  // Upload progress
  const [uploadProgress, setUploadProgress] = useState<{
    percentage: number;
    fileName: string;
  } | null>(null);
  const abortUploadRef = useRef<{ abort: () => void } | null>(null);

  // Send Attachment files helper
  const sendAttachments = useCallback(
    async (files: { uri: string; name: string; type: string }[]) => {
      if (!roomId || files.length === 0) return;
      setSending(true);
      setUploadProgress({ percentage: 0, fileName: files[0].name });
      try {
        await sendMessage({
          room_id: roomId,
          text:
            files.length === 1
              ? `📎 ${files[0].name}`
              : `📎 ${files.length} attachments`,
          attachments: files,
          onUploadProgress: (prog) => {
            setUploadProgress({
              percentage: prog.percentage,
              fileName: files[0].name,
            });
          },
          abortUpload: abortUploadRef,
        });
      } catch (err) {
        console.log("[Attachment] Send error:", err);
        showError("Upload Error", "Failed to upload attachments.");
      } finally {
        setSending(false);
        setUploadProgress(null);
      }
    },
    [roomId, sendMessage],
  );

  const handlePickCamera = useCallback(async () => {
    if (!roomId) return;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        showInfo(
          "Permission Required",
          "Camera permission is required to capture photos.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileName =
          asset.fileName ||
          `camera_${Date.now()}.${asset.type === "video" ? "mp4" : "jpg"}`;
        const fileType =
          asset.mimeType ||
          (asset.type === "video" ? "video/mp4" : "image/jpeg");
        await sendAttachments([
          { uri: asset.uri, name: fileName, type: fileType },
        ]);
      }
    } catch (err) {
      console.log("[Attachment] Camera error:", err);
      showError("Error", "Could not capture image from camera.");
    }
  }, [roomId, sendAttachments]);

  const handlePickGallery = useCallback(async () => {
    if (!roomId) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        showInfo(
          "Permission Required",
          "Media library permission is required.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const files = result.assets.map((asset, idx) => ({
          uri: asset.uri,
          name:
            asset.fileName ||
            `photo_${Date.now()}_${idx}.${asset.type === "video" ? "mp4" : "jpg"}`,
          type:
            asset.mimeType ||
            (asset.type === "video" ? "video/mp4" : "image/jpeg"),
        }));
        await sendAttachments(files);
      }
    } catch (err) {
      console.log("[Attachment] Gallery error:", err);
      showError("Error", "Could not pick image from gallery.");
    }
  }, [roomId, sendAttachments]);

  const handlePickDocument = useCallback(async () => {
    if (!roomId) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const files = result.assets.map((doc, idx) => ({
          uri: doc.uri,
          name: doc.name || `doc_${Date.now()}_${idx}`,
          type: doc.mimeType || "application/octet-stream",
        }));
        await sendAttachments(files);
      }
    } catch (err) {
      console.log("[Attachment] Document error:", err);
      showError("Error", "Could not pick document.");
    }
  }, [roomId, sendAttachments]);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  // Filter tabs
  const [activeFilter, setActiveFilter] = useState<FilterTab>(null);

  // WhatsApp style message modal
  const [selectedMsgForModal, setSelectedMsgForModal] = useState<{
    message: ChatMessage;
    targetY: number;
  } | null>(null);

  // Emoji picker
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiPickerMsg, setEmojiPickerMsg] = useState<ChatMessage | null>(
    null,
  );

  // ── Voice recorder (expo-audio — implemented from scratch) ──────────────
  // Records AAC in an MP4 (.m4a) container on iOS/Android (the browser
  // records audio/webm automatically). .m4a is an explicitly supported
  // voice-note extension per IMAGE_AND_AUDIO_HANDLING.md §3.3.
  const MAX_VOICE_SECONDS = 60;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [isRecording, setIsRecording] = useState(false);
  const recordingBusyRef = useRef(false);
  const recordingAutoStopSentRef = useRef(false);

  const recordingSeconds = Math.floor(recorderState.durationMillis / 1000);

  const [firstVisibleDate, setFirstVisibleDate] = useState<Date | null>(null);
  const [dateFilterStart, setDateFilterStart] = useState<Date | null>(null);
  const [dateFilterEnd, setDateFilterEnd] = useState<Date | null>(null);

  // Scroll-to-bottom FAB — the list is inverted, so offset 0 is the
  // newest message; show the button once the user has scrolled away from it.
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const handleMessagesScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      setShowScrollToBottom(e.nativeEvent.contentOffset.y > 300);
    },
    [],
  );
  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const startRecording = useCallback(async () => {
    if (!roomId || recordingBusyRef.current || isRecording) return;
    recordingBusyRef.current = true;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        showInfo(
          "Permission Required",
          "Microphone access is required to record voice notes.",
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingAutoStopSentRef.current = false;
      setIsRecording(true);
    } catch (err) {
      console.log("[Audio] Start recording error:", err);
      showError("Error", "Could not start audio recording");
    } finally {
      recordingBusyRef.current = false;
    }
  }, [roomId, recorder, isRecording]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch (err) {
      console.log("[Audio] Stop recording error:", err);
    }
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch {}
    setIsRecording(false);
    return recorder.uri;
  }, [recorder]);

  const stopAndSendRecording = useCallback(async () => {
    if (!roomId || recordingBusyRef.current) return;
    recordingBusyRef.current = true;
    setSending(true);
    try {
      const uri = await stopRecording();
      if (!uri) {
        showError(
          "Recording Error",
          "Could not obtain voice recording. Please try again.",
        );
        return;
      }
      // Web records audio/webm (matches IMAGE_AND_AUDIO_HANDLING.md §3.1);
      // iOS/Android record AAC in an MP4 (.m4a) container.
      const isWeb = Platform.OS === "web";
      const name = `voice-note-${Date.now()}.${isWeb ? "webm" : "m4a"}`;
      const type = isWeb ? "audio/webm" : "audio/mp4";

      // Verify the recorded file exists and log its size before uploading.
      if (isWeb) {
        console.log("[Audio] Recorded voice note:", { uri, name, type });
      } else {
        try {
          const recordedFile = new FileSystemFile(uri);
          console.log("[Audio] Recorded voice note:", {
            uri,
            exists: recordedFile.exists,
            size: recordedFile.size,
            name,
            type,
          });
        } catch (fileErr) {
          console.log("[Audio] Could not stat recorded voice note:", fileErr);
        }
      }

      setUploadProgress({ percentage: 0, fileName: name });
      // Must use the same XHR upload path as images (onUploadProgress).
      // Expo SDK 57's global `fetch` (WinterCG) cannot serialize React Native
      // `{ uri, name, type }` FormData parts and throws "Unsupported
      // FormDataPart implementation" — see AGENT_API_INTEGRATION.md.
      await sendMessage({
        room_id: roomId,
        text: "🎤 Voice message",
        attachments: [{ uri, name, type }],
        onUploadProgress: (prog) => {
          setUploadProgress({ percentage: prog.percentage, fileName: name });
        },
        abortUpload: abortUploadRef,
      });
    } catch (err) {
      console.log("[Audio] Send voice note error:", err);
      showError("Error", "Failed to send voice note");
    } finally {
      setSending(false);
      setUploadProgress(null);
      recordingBusyRef.current = false;
    }
  }, [roomId, stopRecording, sendMessage]);

  const cancelRecording = useCallback(async () => {
    if (recordingBusyRef.current) return;
    recordingBusyRef.current = true;
    try {
      await stopRecording();
    } catch {
    } finally {
      recordingBusyRef.current = false;
    }
  }, [stopRecording]);

  // Auto-stop at the duration cap and immediately send.
  useEffect(() => {
    if (
      isRecording &&
      !recordingAutoStopSentRef.current &&
      recorderState.durationMillis >= MAX_VOICE_SECONDS * 1000
    ) {
      recordingAutoStopSentRef.current = true;
      stopAndSendRecording();
    }
  }, [isRecording, recorderState.durationMillis, stopAndSendRecording]);

  // Release the microphone when leaving the screen mid-recording.
  // useAudioRecorder's useReleasingSharedObject releases the native
  // AudioRecorder on unmount BEFORE this cleanup runs, after which its native
  // getters/methods throw ("Cannot use shared object that was already
  // released") — so the stop attempt must be guarded defensively.
  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) {
          recorder.stop().catch(() => {});
        }
      } catch {}
    };
  }, [recorder]);

  const formatRecordingTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Forward
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const toggleFilter = (tab: FilterTab) => {
    setActiveFilter((prev) => (prev === tab ? null : tab));
  };

  // ── Pinned messages banner (WhatsApp-style) ─────────────────────────
  const pinnedMessages = state.pinnedMessages;
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [pinnedRoomId, setPinnedRoomId] = useState(roomId);
  if (pinnedRoomId !== roomId) {
    setPinnedRoomId(roomId);
    setPinnedIndex(0);
  }
  const activePinned =
    pinnedMessages.length > 0
      ? pinnedMessages[Math.min(pinnedIndex, pinnedMessages.length - 1)]
      : null;

  // Trigger initial user search when AddPeople modal opens
  useEffect(() => {
    if (addPeopleOpen) {
      setSearchQuery("");
    }
  }, [addPeopleOpen, setSearchQuery]);

  // Fetch messages when room changes
  useEffect(() => {
    if (roomId) {
      fetchMessages(roomId);
      // Join the room on the shared socket so this screen receives
      // real-time events even when opened directly (deep link / push)
      // without first mounting the chat tab.
      socketService
        .connectSocket()
        .then(() => socketService.joinChatRoom(roomId))
        .catch(() => {});
      if (isChannel) {
        fetchPostTypes(roomId).catch(() => {});
        fetchRoomPermissions(roomId).catch(() => {});
      }
      fetchPinnedMessages(roomId).catch(() => {});
    }
  }, [
    roomId,
    isChannel,
    fetchMessages,
    fetchPostTypes,
    fetchRoomPermissions,
    fetchPinnedMessages,
  ]);

  // Emit a "messagesRead" socket event whenever the user opens a room
  // so the sender can mark these messages as read on their side.
  useEffect(() => {
    if (roomId && currentUserId) {
      socketService.emitMessagesRead(roomId, currentUserId);
    }
  }, [roomId, currentUserId]);

  // Broadcast typing state to the room (only when the user may send).
  const handleTextChange = useCallback(
    (text: string) => {
      setMessage(text);

      // @-mention trigger detection: the "@" must start a fresh token
      // (preceded by whitespace/start) and the query must contain no spaces.
      const atIdx = text.lastIndexOf("@");
      let triggerActive = false;
      if (atIdx >= 0) {
        const prevChar = atIdx === 0 ? " " : text[atIdx - 1];
        const after = text.slice(atIdx + 1);
        if (
          (prevChar === " " || prevChar === "\n") &&
          !after.includes(" ") &&
          after.length <= 32
        ) {
          triggerActive = true;
          setMentionQuery(after);
        }
      }
      setMentionActive(triggerActive);
      if (!triggerActive) setMentionQuery("");

      if (!roomId || !currentUserId || !canSendMessage) return;
      if (text.trim().length > 0) {
        socketService.startTypingWithTimeout(
          roomId,
          currentUserId,
          currentUserName,
        );
      } else {
        socketService.emitStopTyping(roomId, currentUserId, currentUserName);
      }
    },
    [roomId, currentUserId, canSendMessage, currentUserName],
  );

  const selectMention = useCallback((member: RoomMember) => {
    const memberName =
      `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() ||
      `User ${member.id}`;
    setMessage((prev) => {
      const atIdx = prev.lastIndexOf("@");
      if (atIdx >= 0) {
        return `${prev.slice(0, atIdx)}@${memberName} `;
      }
      return `${prev}@${memberName} `;
    });
    setMentionedUserIds((prev) =>
      prev.includes(member.id) ? prev : [...prev, member.id],
    );
    setMentionActive(false);
    setMentionQuery("");
  }, []);

  // Names of other members currently typing in this room.
  const typingNames = useMemo(() => {
    const roomMap = typingUsers.get(roomId ?? "") ?? new Map<number, string>();
    return Array.from(roomMap.values());
  }, [typingUsers, roomId]);

  // Track date of latest message for top header divider
  useEffect(() => {
    if (state.messages.length > 0) {
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg?.createdAt) {
        setFirstVisibleDate(new Date(lastMsg.createdAt));
      }
    }
  }, [state.messages.length, roomId]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !roomId || sending) return;

    if (editingMsg) {
      const textToSave = message.trim();
      const targetMsg = editingMsg;
      setEditingMsg(null);
      setMessage("");
      setSending(true);
      try {
        await editMessage({
          messageId: targetMsg._id,
          text: textToSave,
        });
        showSuccess("Message updated");
      } catch (err) {
        console.log("[Conv] Edit error:", err);
        showError("Error", "Failed to update message");
        setEditingMsg(targetMsg);
        setMessage(textToSave);
      } finally {
        setSending(false);
      }
      return;
    }

    socketService.emitStopTyping(roomId, currentUserId, currentUserName);
    const text = message.trim();
    const mentions = mentionedUserIds;
    setMessage("");
    setMentionedUserIds([]);
    setMentionActive(false);
    setMentionQuery("");
    setSending(true);
    setReplyTo(null);

    try {
      console.log("[Conv] Sending message:", { roomId, text });
      await sendMessage({
        room_id: roomId,
        text,
        ...(mentions.length > 0 ? { mentions } : {}),
        parent_id: replyTo?.id.toString(),
      });
      console.log("[Conv] Message sent successfully");
      setTimeout(() => {
        scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);
    } catch (err) {
      console.log("[Conv] Send message error:", err);
      setMessage(text);
      setMentionedUserIds(mentions);
      setReplyTo(replyTo);
    } finally {
      setSending(false);
    }
  }, [
    message,
    editingMsg,
    roomId,
    sending,
    replyTo,
    editMessage,
    sendMessage,
    currentUserId,
    currentUserName,
    mentionedUserIds,
  ]);

  const handleReact = useCallback(
    async (msg: ChatMessage) => {
      if (!canReact) return;
      if (!roomId) return;
      try {
        await toggleReaction(msg._id, "👍");
      } catch {
        // Silent fail
      }
    },
    [roomId, toggleReaction, canReact],
  );

  const handleReactEmoji = useCallback(
    async (msg: ChatMessage, emoji: string) => {
      if (!canReact) return;
      if (!roomId) return;
      const existingUserReaction = (msg.reactions ?? []).find(
        (r) => r.users && r.users.includes(currentUserId),
      );
      try {
        if (existingUserReaction && existingUserReaction.emoji !== emoji) {
          await toggleReaction(msg._id, existingUserReaction.emoji);
        }
        [];
        await toggleReaction(msg._id, emoji);
      } catch {
        // Silent fail
      }
    },
    [roomId, toggleReaction, canReact, currentUserId],
  );

  const handleAddPeopleInvite = useCallback(
    async (users: { id: string; name: string }[]) => {
      if (!roomId) return;
      for (const u of users) {
        try {
          if (u.id) await addMember(roomId, parseInt(u.id, 10));
        } catch {
          // Continue with next user
        }
      }
    },
    [roomId, addMember],
  );

  const handleEmojiReact = useCallback(
    async (msg: ChatMessage, emoji: string) => {
      setEmojiPickerOpen(false);
      setEmojiPickerMsg(null);
      const existingUserReaction = (msg.reactions ?? []).find(
        (r) => r.users && r.users.includes(currentUserId),
      );
      try {
        if (existingUserReaction && existingUserReaction.emoji !== emoji) {
          await toggleReaction(msg._id, existingUserReaction.emoji);
        }
        await toggleReaction(msg._id, emoji);
      } catch {}
    },
    [toggleReaction, currentUserId],
  );

  const handleForward = useCallback(
    async (room: Room) => {
      if (!forwardMsg) return;
      setForwarding(true);
      try {
        await sendMessage({
          room_id: room._id,
          text: forwardMsg.text,
          is_forwarded: true,
          forwarded_from_name: forwardMsg.sender_name || "Someone",
        });
        setForwardOpen(false);
        setForwardMsg(null);
      } catch {
        showError("Error", "Failed to forward message");
      } finally {
        setForwarding(false);
      }
    },
    [forwardMsg, sendMessage],
  );

  const handleMore = useCallback(
    (msg: ChatMessage) => {
      const isOwn = isOwnMessage(msg, currentUserId);
      const canEditOthers = canPerformAction(callerPermission, "edit");
      const canDeleteOthers = canPerformAction(callerPermission, "delete");
      Alert.alert("Message Options", "", [
        {
          text: "Copy Text",
          onPress: () => {
            Clipboard.setStringAsync(msg.text);
          },
        },
        ...(isOwn || canEditOthers
          ? [
              {
                text: "Edit",
                onPress: () => {
                  setEditingMsg(msg);
                  setMessage(msg.text || "");
                },
              },
            ]
          : []),
        {
          text: msg.is_pinned ? "Unpin" : "Pin",
          onPress: () => {
            togglePin(msg._id).catch(() => {});
          },
        },
        ...(isOwn || canDeleteOthers
          ? [
              {
                text: "Delete",
                style: "destructive" as const,
                onPress: () => {
                  setDeleteModalMsg(msg);
                },
              },
            ]
          : []),
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [currentUserId, callerPermission, togglePin, deleteMessage],
  );

  const handleDateFilterChange = useCallback(
    (start: Date | null, end: Date | null) => {
      setDateFilterStart(start);
      setDateFilterEnd(end);
    },
    [],
  );

  // Derive current room from rooms list
  const currentRoom = useMemo(
    () =>
      state.rooms.find((r) => r._id === roomId || r.id.toString() === roomId),
    [state.rooms, roomId],
  );

  useEffect(() => {
    if (currentRoom) {
      setCurrentRoom(currentRoom);
    }
  }, [currentRoom?._id, currentRoom?.id, setCurrentRoom]);

  useEffect(() => {
    return () => {
      setCurrentRoom(null);
    };
  }, [setCurrentRoom]);

  // ── @-mention candidates (derived from the room's member list) ─────────
  const roomMembers = useMemo(
    () => (currentRoom?.members ?? []).filter((m) => m.id !== currentUserId),
    [currentRoom, currentUserId],
  );

  const mentionCandidates = useMemo(() => {
    if (!mentionActive || !isChannel) return [];
    const q = mentionQuery.trim().toLowerCase();
    return roomMembers
      .filter((m) => {
        const fullName = `${m.first_name ?? ""} ${m.last_name ?? ""}`
          .trim()
          .toLowerCase();
        return (
          fullName.includes(q) || (m.email ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [mentionActive, mentionQuery, roomMembers, isChannel]);

  const handleLongPress = useCallback(
    (msg: ChatMessage, e?: GestureResponderEvent) => {
      triggerHaptic("medium");
      const y = e?.nativeEvent?.pageY ?? Dimensions.get("window").height / 2;
      setSelectedMsgForModal({ message: msg, targetY: y });
    },
    [],
  );

  // Lookup for the "replying to" quote preview — only messages already
  // loaded in this screen can be shown; older, un-paginated-in replies
  // simply render without a preview (bubble degrades gracefully).
  const messageById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of state.messages) {
      map.set(m._id, m);
      map.set(String(m.id), m);
    }
    return map;
  }, [state.messages]);

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: index === 0 ? 8 : 20,
        }}
      >
        <MessageBubble
          message={item}
          currentUserId={currentUserId}
          members={currentRoom?.members}
          showSenderName={isChannel}
          isChannel={isChannel}
          repliedMessage={
            item.parent_id ? messageById.get(item.parent_id) : null
          }
          onLongPress={handleLongPress}
          onReactionPress={handleReactEmoji}
        />
      </View>
    ),
    [
      currentUserId,
      currentRoom?.members,
      isChannel,
      messageById,
      handleLongPress,
      handleReactEmoji,
    ],
  );

  // Inverted messages list for native bottom-anchored chat layout
  const invertedMessages = useMemo(() => {
    let filtered = search.trim()
      ? filterMessagesByText(state.messages, search)
      : state.messages;

    if (dateFilterStart && dateFilterEnd) {
      const startOfDay = new Date(dateFilterStart);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateFilterEnd);
      endOfDay.setHours(23, 59, 59, 999);
      const startMs = startOfDay.getTime();
      const endMs = endOfDay.getTime();
      filtered = filtered.filter((m) => {
        const msgDate = new Date(m.createdAt ?? 0).getTime();
        return msgDate >= startMs && msgDate <= endMs;
      });
    }
    return [...filtered].reverse();
  }, [state.messages, search, dateFilterStart, dateFilterEnd]);

  const handleLoadMore = useCallback(() => {
    if (roomId && state.hasMore && !state.messagesLoading) {
      const nextPage = state.messagePage + 1;
      fetchMessages(roomId, nextPage);
    }
  }, [
    roomId,
    state.hasMore,
    state.messagesLoading,
    state.messagePage,
    fetchMessages,
  ]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  const onViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: any[] }) => {
      for (const v of viewableItems) {
        const rawDate = v.item?.createdAt || v.item?.created_at;
        if (rawDate) {
          const parsed = new Date(rawDate);
          if (!isNaN(parsed.getTime())) {
            setFirstVisibleDate((prev) => {
              if (prev && isSameDay(prev, parsed)) return prev;
              return parsed;
            });
            return;
          }
        }
      }
    },
  ).current;

  const dynamicDateLabel = useMemo(() => {
    if (!firstVisibleDate || isNaN(firstVisibleDate.getTime())) {
      return isChannel ? "Today's Discussion" : "Today's Chat";
    }
    return formatDateDivider(firstVisibleDate, isChannel);
  }, [firstVisibleDate, isChannel]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* ── Header ── */}
        <View style={styles.header}>
          {!searchOpen ? (
            <>
              <View style={styles.headerLeft}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  hitSlop={8}
                  style={styles.backBtn}
                >
                  <Ionicons name="chevron-back" size={22} color="#1D1D1D" />
                </TouchableOpacity>

                <Avatar
                  name={name}
                  imagePath={
                    !isChannel
                      ? (roomMembers[0]?.image ?? (currentRoom as any)?.image)
                      : ((currentRoom as any)?.image ?? (currentRoom as any)?.avatar)
                  }
                  size={32}
                  borderRadius={6}
                  fontSize={14}
                  fontFamily="SF_Pro_Semibold"
                />

                <View style={styles.headerInfo}>
                  <Text style={styles.headerName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.headerStatus}>
                    {isChannel
                      ? `${roomPermissions.length} member${roomPermissions.length !== 1 ? "s" : ""}`
                      : roomMembers[0]?.isOnline
                        ? "Active"
                        : "Offline"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                hitSlop={8}
                onPress={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }}
              >
                <Ionicons name="search-outline" size={20} color="#1D1D1D" />
              </TouchableOpacity>
            </>
          ) : (
            <Pressable
              style={styles.searchRow}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color="#9CA3AF" />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  placeholder="Search messages..."
                  placeholderTextColor="#9CA3AF"
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSearchOpen(false);
                  setSearch("");
                }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          )}
        </View>

        {/* ── Filter Chips ── */}
        {!searchOpen && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            style={{ flexGrow: 0 }}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                (activeFilter === "date" || dateFilterStart !== null) &&
                  styles.filterChipActive,
              ]}
              activeOpacity={0.75}
              onPress={() => toggleFilter("date")}
            >
              <Ionicons
                name="calendar-outline"
                size={11}
                color={
                  activeFilter === "date" || dateFilterStart !== null
                    ? "#fff"
                    : "#6B7280"
                }
              />
              <Text
                style={[
                  styles.filterChipText,
                  (activeFilter === "date" || dateFilterStart !== null) &&
                    styles.filterChipTextActive,
                ]}
              >
                Date
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                activeFilter === "attachments" && styles.filterChipActive,
              ]}
              activeOpacity={0.75}
              onPress={() => toggleFilter("attachments")}
            >
              <Ionicons
                name="attach-outline"
                size={11}
                color={activeFilter === "attachments" ? "#fff" : "#6B7280"}
              />
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === "attachments" && styles.filterChipTextActive,
                ]}
              >
                Attachments
              </Text>
            </TouchableOpacity>

            {isChannel && (
              <>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    activeFilter === "chat_member" && styles.filterChipActive,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => toggleFilter("chat_member")}
                >
                  <Ionicons
                    name="people-outline"
                    size={11}
                    color={activeFilter === "chat_member" ? "#fff" : "#6B7280"}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === "chat_member" &&
                        styles.filterChipTextActive,
                    ]}
                  >
                    Chat Member
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    activeFilter === "post_type" && styles.filterChipActive,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => toggleFilter("post_type")}
                >
                  <Ionicons
                    name="apps-outline"
                    size={11}
                    color={activeFilter === "post_type" ? "#fff" : "#6B7280"}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === "post_type" &&
                        styles.filterChipTextActive,
                    ]}
                  >
                    Post Type
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}

        {/* ── Date / Attachments / Post Type panel ── */}
        {!searchOpen && activeFilter === "date" && (
          <View style={styles.panelWrapper}>
            <DateFilterPanel onFilterChange={handleDateFilterChange} />
          </View>
        )}
        {!searchOpen && activeFilter === "attachments" && (
          <View style={styles.panelWrapper}>
            <AttachmentsPanel messages={state.messages} />
          </View>
        )}
        {!searchOpen && activeFilter === "post_type" && isChannel && (
          <View style={styles.panelWrapper}>
            <View style={styles.postTypeListPanel}>
              {postTypes.map((pt: { name: string; color: string }) => (
                <TouchableOpacity
                  key={pt.name}
                  style={[
                    styles.postTypeListRow,
                    { backgroundColor: pt.color + "15" },
                  ]}
                  activeOpacity={0.75}
                >
                  <Ionicons name="pricetag" size={14} color={pt.color} />
                  <Text
                    style={[styles.postTypeListLabel, { color: pt.color }]}
                    numberOfLines={1}
                  >
                    {pt.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {postTypes.length === 0 && (
                <Text
                  style={{
                    fontSize: rf(12),
                    color: "#9CA3AF",
                    fontFamily: "SF_Pro_Regular",
                    padding: 12,
                  }}
                >
                  No post types configured
                </Text>
              )}
            </View>
          </View>
        )}
        {!searchOpen && activeFilter === "chat_member" && isChannel && (
          <View style={styles.panelWrapper}>
            <View style={styles.memberListPanel}>
              {state.roomPermissions.map((perm) => {
                const memberInfo = currentRoom?.members?.find(
                  (m) => m.id === perm.userId,
                );
                const fullName = memberInfo
                  ? `${memberInfo.first_name} ${memberInfo.last_name}`
                  : `User #${perm.userId}`;
                return (
                  <View key={perm.userId} style={styles.memberRow}>
                    <Avatar
                      name={fullName}
                      imagePath={memberInfo?.image}
                      size={32}
                      borderRadius={16}
                      fontSize={12}
                      fontFamily="SF_Pro_Semibold"
                      style={styles.memberAvatar}
                    />
                    <Text style={styles.memberName} numberOfLines={1}>
                      {fullName}
                    </Text>
                    <Text
                      style={{
                        fontSize: rf(11),
                        color: "#6B7280",
                        fontFamily: "SF_Pro_Regular",
                      }}
                    >
                      {perm.permission}
                    </Text>
                  </View>
                );
              })}
              {state.roomPermissions.length === 0 && (
                <Text
                  style={{
                    fontSize: rf(12),
                    color: "#9CA3AF",
                    fontFamily: "SF_Pro_Regular",
                    padding: 12,
                  }}
                >
                  No members loaded
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Fixed Date Divider (dynamic, updates on scroll) ── */}
        {!searchOpen && <DateDivider label={dynamicDateLabel} />}

        {/* ── Pinned messages banner (WhatsApp-style) ── */}
        {activePinned && !searchOpen && (
          <Pressable
            style={styles.pinnedBanner}
            onPress={() =>
              setPinnedIndex((i) => (i + 1) % pinnedMessages.length)
            }
          >
            <Ionicons name="pin" size={14} color="#00DEAB" />
            <View style={styles.pinnedBannerBody}>
              <Text style={styles.pinnedBannerTitle} numberOfLines={1}>
                {pinnedMessages.length > 1
                  ? `Pinned message ${pinnedIndex + 1} of ${pinnedMessages.length}`
                  : "Pinned message"}
              </Text>
              <Text style={styles.pinnedBannerText} numberOfLines={1}>
                {activePinned.text ||
                  (activePinned.attachments?.length ? "Attachment" : "")}
              </Text>
            </View>
          </Pressable>
        )}

        {/* ── Scrollable content ── */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={scrollRef}
            style={styles.scroll}
            inverted={true}
            data={invertedMessages}
            keyExtractor={(item: ChatMessage, idx: number) =>
              String(item._id ?? item.id ?? `msg-${idx}`)
            }
            renderItem={renderItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            windowSize={11}
            maxToRenderPerBatch={15}
            updateCellsBatchingPeriod={30}
            initialNumToRender={25}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListHeaderComponent={
              search.trim() ? (
                <View style={styles.searchResultBadge}>
                  <Text style={styles.searchResultText}>
                    {invertedMessages.length} result
                    {invertedMessages.length !== 1 ? "s" : ""} found
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              <>
                {state.messagesLoading && (
                  <View style={{ padding: 16, alignItems: "center" }}>
                    <ActivityIndicator size="small" color="#00DEAB" />
                  </View>
                )}
                {!state.hasMore && (
                  <View style={styles.workspaceContainer}>
                    <View style={styles.iconStack}>
                      {isChannel ? (
                        <Icons.ChannelTabIcon width={54} height={54} />
                      ) : (
                        <MainChatIcon />
                      )}
                    </View>
                    <Text style={styles.workspaceTitle}>
                      {isChannel
                        ? `Team Chat in #${name}`
                        : "Private workspace"}
                    </Text>
                    <Text style={styles.workspaceDescription}>
                      {isChannel
                        ? "Group keep your team's conversations\norganized by topic."
                        : "A place just for you to capture ideas, draft messages,\nand keep everything organized for later."}
                    </Text>
                    {isChannel && canManageMembers && (
                      <TouchableOpacity
                        style={styles.addPeopleChannelBtn}
                        activeOpacity={0.8}
                        onPress={() => setAddPeopleOpen(true)}
                      >
                        <Text style={styles.addPeopleChannelText}>
                          + Add people
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            }
            ListEmptyComponent={
              state.messagesLoading && state.messages.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator size="large" color="#00DEAB" />
                </View>
              ) : search.trim() && invertedMessages.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Ionicons name="search-outline" size={32} color="#D1D5DB" />
                  <Text
                    style={{
                      fontSize: rf(13),
                      color: "#9CA3AF",
                      fontFamily: "SF_Pro_Regular",
                      marginTop: 8,
                      textAlign: "center",
                    }}
                  >
                    No messages matching "{search}"
                  </Text>
                </View>
              ) : dateFilterStart &&
                dateFilterEnd &&
                state.messages.length > 0 &&
                invertedMessages.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Ionicons name="calendar-outline" size={32} color="#D1D5DB" />
                  <Text
                    style={{
                      fontSize: rf(13),
                      color: "#9CA3AF",
                      fontFamily: "SF_Pro_Regular",
                      marginTop: 8,
                      textAlign: "center",
                    }}
                  >
                    No messages found for this date range.
                  </Text>
                </View>
              ) : invertedMessages.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: rf(13),
                      color: "#9CA3AF",
                      fontFamily: "SF_Pro_Regular",
                      textAlign: "center",
                    }}
                  >
                    No messages yet. Start the conversation!
                  </Text>
                </View>
              ) : null
            }
            onViewableItemsChanged={onViewableItemsChangedRef}
            viewabilityConfig={viewabilityConfig}
            onScroll={handleMessagesScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          />

          {showScrollToBottom && (
            <TouchableOpacity
              style={(styles as any).scrollToBottomBtn}
              activeOpacity={0.85}
              onPress={scrollToBottom}
            >
              <Ionicons name="chevron-down" size={20} color="#1D1D1D" />
            </TouchableOpacity>
          )}

          {/* ── Reply Preview ── */}
          {replyTo && (
            <View style={styles.replyPreview}>
              <View style={styles.replyPreviewBar} />
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replyPreviewName} numberOfLines={1}>
                  Replying to {replyTo.sender_name}
                </Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {replyTo.text}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.4}
                onPress={() => setReplyTo(null)}
                hitSlop={8}
              >
                <Ionicons name="close" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Upload Progress ── */}
          {uploadProgress && (
            <View style={styles.uploadProgressContainer}>
              <View style={styles.uploadProgressRow}>
                <Ionicons
                  name="cloud-upload-outline"
                  size={14}
                  color="#00DEAB"
                />
                <Text style={styles.uploadProgressText} numberOfLines={1}>
                  Uploading {uploadProgress.fileName}...
                </Text>
                <Text style={styles.uploadProgressPercent}>
                  {uploadProgress.percentage}%
                </Text>
                <TouchableOpacity
                  activeOpacity={0.4}
                  onPress={() => {
                    abortUploadRef.current?.abort();
                    setUploadProgress(null);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
              <View style={styles.uploadProgressBarBg}>
                <View
                  style={[
                    styles.uploadProgressBarFill,
                    { width: `${uploadProgress.percentage}%` },
                  ]}
                />
              </View>
            </View>
          )}

          {/* ── Typing Indicator ── */}
          {typingNames.length > 0 && (
            <View style={styles.typingIndicator}>
              <View style={styles.typingDots}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, styles.typingDotMid]} />
                <View style={styles.typingDot} />
              </View>
              <Text style={styles.typingText} numberOfLines={1}>
                {typingNames.join(", ")}{" "}
                {typingNames.length === 1 ? "is" : "are"} typing…
              </Text>
            </View>
          )}

          {/* ── Mention Suggestions ── */}
          {mentionActive && mentionCandidates.length > 0 && (
            <View style={styles.mentionSuggestions}>
              {mentionCandidates.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.mentionSuggestionItem}
                  activeOpacity={0.6}
                  onPress={() => selectMention(member)}
                >
                  <Avatar
                    name={`${member.first_name ?? ""} ${member.last_name ?? ""}`}
                    imagePath={member.image}
                    size={24}
                    borderRadius={12}
                    fontSize={10}
                  />
                  <Text style={styles.mentionName} numberOfLines={1}>
                    {`${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() ||
                      `User ${member.id}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Inline Editing Message Banner ── */}
          {editingMsg && (
            <View style={styles.editingBanner}>
              <View style={styles.editingBannerLeftBar} />
              <Ionicons
                name="pencil"
                size={15}
                color="#00DEAB"
                style={{ marginHorizontal: 8 }}
              />
              <View style={styles.editingBannerTextWrap}>
                <Text style={styles.editingBannerTitle}>Editing message</Text>
                <Text style={styles.editingBannerText} numberOfLines={1}>
                  {editingMsg.text}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.6}
                style={styles.editingBannerCloseBtn}
                onPress={() => {
                  setEditingMsg(null);
                  setMessage("");
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Bottom Input Bar ── */}
          <View style={styles.inputBar}>
            {canSendMessage ? (
              <>
                {isRecording ? (
                  <View style={styles.recordingBar}>
                    <View style={styles.recordingLiveIndicator}>
                      <TouchableOpacity
                        style={styles.cancelRecordBtn}
                        activeOpacity={0.7}
                        onPress={cancelRecording}
                      >
                        <Ionicons name="close" size={22} color="#EF4444" />
                      </TouchableOpacity>
                      <View style={styles.redDot} />
                      <Text style={styles.recordingTimerText}>
                        {formatRecordingTimer(recordingSeconds)}
                      </Text>
                      <Text style={styles.recordingHintText}>Recording...</Text>
                    </View>
                    <View style={styles.recordingActions}>
                      <TouchableOpacity
                        style={styles.sendRecordBtn}
                        activeOpacity={0.8}
                        onPress={stopAndSendRecording}
                        disabled={sending}
                      >
                        {sending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="paper-plane" size={16} color="#fff" />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.inputContainer}>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Type anything..."
                        placeholderTextColor="#9CA3AF"
                        value={message}
                        onChangeText={handleTextChange}
                        multiline
                        maxLength={2000}
                      />
                    </View>

                    {/* Action row */}
                    <View style={styles.inputActions}>
                      <View style={styles.inputActionsLeft}>
                        <TouchableOpacity
                          activeOpacity={0.4}
                          style={styles.inputActionBtn}
                          onPress={() => setAttachmentModalOpen(true)}
                        >
                          <Ionicons name="add" size={20} color="#1D1D1D" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.4}
                          style={styles.inputActionBtn}
                          onPress={() => {
                            setEmojiPickerMsg(null);
                            setEmojiPickerOpen(true);
                          }}
                        >
                          <Ionicons
                            name="happy-outline"
                            size={18}
                            color="#1D1D1D"
                          />
                          <Text style={styles.plusBadge}>+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.4}
                          style={styles.inputActionBtn}
                          onPress={startRecording}
                        >
                          <Ionicons
                            name="mic-outline"
                            size={18}
                            color="#1D1D1D"
                          />
                        </TouchableOpacity>
                        {isChannel &&
                          postTypes.length > 0 &&
                          canManagePostTypes && (
                            <TouchableOpacity
                              activeOpacity={0.4}
                              style={[
                                styles.inputActionBtn,
                                styles.postTypeToggle,
                                postTypeOpen && styles.postTypeToggleActive,
                              ]}
                              onPress={() => setPostTypeOpen(!postTypeOpen)}
                            >
                              <Text
                                style={[
                                  styles.postTypeToggleText,
                                  postTypeOpen &&
                                    styles.postTypeToggleTextActive,
                                ]}
                              >
                                Post Type
                              </Text>
                            </TouchableOpacity>
                          )}
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.sendBtn,
                          (message.trim().length > 0 || sending) &&
                            styles.sendBtnActive,
                        ]}
                        activeOpacity={0.4}
                        onPress={handleSend}
                        disabled={sending || !message.trim()}
                      >
                        {sending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons
                            name={editingMsg ? "checkmark" : "paper-plane"}
                            size={16}
                            color="#fff"
                          />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* ── Post Type (horizontal chips, inside input box) ── */}
                    {postTypeOpen && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.postTypeScroll}
                        contentContainerStyle={styles.postTypeScrollContent}
                        keyboardShouldPersistTaps="handled"
                      >
                        {postTypes.map(
                          (pt: { name: string; color: string }) => (
                            <TouchableOpacity
                              key={pt.name}
                              style={[
                                styles.postTypeChip,
                                { backgroundColor: pt.color + "15" },
                              ]}
                              activeOpacity={0.4}
                            >
                              <Ionicons
                                name="pricetag"
                                size={14}
                                color={pt.color}
                                style={{ marginRight: 4 }}
                              />
                              <Text
                                style={[
                                  styles.postTypeChipText,
                                  { color: pt.color },
                                ]}
                              >
                                {pt.name}
                              </Text>
                            </TouchableOpacity>
                          ),
                        )}
                      </ScrollView>
                    )}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.viewOnlyBar}>
                <Ionicons name="eye-outline" size={16} color="#9CA3AF" />
                <Text style={styles.viewOnlyText}>
                  View only — you can read but not send messages.
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <AttachmentModal
        visible={attachmentModalOpen}
        onClose={() => setAttachmentModalOpen(false)}
        onSelectCamera={handlePickCamera}
        onSelectGallery={handlePickGallery}
        onSelectDocument={handlePickDocument}
      />

      <AddPeopleModal
        visible={addPeopleOpen}
        users={state.searchResults.map((u) => ({
          id: String(u.id),
          name:
            u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim(),
          email: u.email,
        }))}
        isChannelMode={true}
        onClose={() => setAddPeopleOpen(false)}
        onSearch={(query) => setSearchQuery(query)}
        onInviteUsers={handleAddPeopleInvite}
      />

      {/* ── WhatsApp Style Long-Press Message Modal ── */}
      <WhatsAppMessageModal
        visible={!!selectedMsgForModal}
        message={selectedMsgForModal?.message ?? null}
        targetY={selectedMsgForModal?.targetY}
        currentUserId={currentUserId}
        callerPermission={callerPermission}
        onClose={() => setSelectedMsgForModal(null)}
        onReactionSelect={(emoji) => {
          if (selectedMsgForModal?.message) {
            handleReactEmoji(selectedMsgForModal.message, emoji);
          }
        }}
        onOpenEmojiPicker={() => {
          if (selectedMsgForModal?.message) {
            setEmojiPickerMsg(selectedMsgForModal.message);
            setEmojiPickerOpen(true);
          }
        }}
        onReply={() => {
          if (selectedMsgForModal?.message)
            setReplyTo(selectedMsgForModal.message);
        }}
        onCopy={() => {
          if (selectedMsgForModal?.message) {
            Clipboard.setStringAsync(selectedMsgForModal.message.text);
            showInfo("Copied", "Message text copied to clipboard");
          }
        }}
        onForward={() => {
          if (selectedMsgForModal?.message) {
            setForwardMsg(selectedMsgForModal.message);
            setForwardOpen(true);
          }
        }}
        onPin={() => {
          if (selectedMsgForModal?.message) {
            togglePin(selectedMsgForModal.message._id).catch(() => {});
          }
        }}
        onEdit={() => {
          if (selectedMsgForModal?.message) {
            const msg = selectedMsgForModal.message;
            setEditingMsg(msg);
            setMessage(msg.text || "");
          }
        }}
        onDelete={() => {
          if (selectedMsgForModal?.message) {
            setDeleteModalMsg(selectedMsgForModal.message);
          }
        }}
      />

      {/* ── Custom Delete Message Modal ── */}
      <DeleteMessageModal
        visible={!!deleteModalMsg}
        message={deleteModalMsg}
        currentUserId={currentUserId}
        callerPermission={callerPermission}
        onClose={() => setDeleteModalMsg(null)}
        onConfirmDelete={(deleteFor) => {
          if (deleteModalMsg) {
            const mId = deleteModalMsg._id;
            deleteMessage(mId, deleteFor)
              .then(() => {
                showSuccess(
                  deleteFor === "everyone"
                    ? "Message deleted for everyone"
                    : "Message deleted for you",
                );
              })
              .catch(() => {
                showError("Error", "Failed to delete message");
              });
          }
        }}
      />

      {/* ── Emoji Picker (rn-emoji-keyboard) ── */}
      <EmojiPicker
        open={emojiPickerOpen}
        onClose={() => {
          setEmojiPickerOpen(false);
          setEmojiPickerMsg(null);
        }}
        onEmojiSelected={(emojiObject) => {
          const emoji = emojiObject.emoji;
          setEmojiPickerOpen(false);
          if (emojiPickerMsg) {
            handleEmojiReact(emojiPickerMsg, emoji);
            setEmojiPickerMsg(null);
          } else {
            setMessage((prev) => prev + emoji);
          }
        }}
      />

      {/* ── Forward Room Picker Modal ── */}
      <Modal
        visible={forwardOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setForwardOpen(false)}
        >
          <View
            style={styles.forwardPickerContainer}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.forwardHeader}>
              <Text style={styles.forwardTitle}>Forward to</Text>
              <TouchableOpacity onPress={() => setForwardOpen(false)}>
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            {forwardMsg && (
              <View style={styles.forwardPreview}>
                <Text style={styles.forwardPreviewLabel}>Message:</Text>
                <Text style={styles.forwardPreviewText} numberOfLines={2}>
                  {forwardMsg.text}
                </Text>
              </View>
            )}
            <FlatList
              data={state.rooms}
              keyExtractor={(item: Room, idx: number) =>
                String(item._id ?? item.id ?? `room-${idx}`)
              }
              renderItem={({ item: room }) => {
                const otherMembers = room.members?.filter(
                  (m) => m.id !== currentUserId,
                );
                const displayName =
                  room.name ||
                  otherMembers
                    ?.map((m) => `${m.first_name} ${m.last_name}`)
                    .join(", ") ||
                  "Chat";
                return (
                  <TouchableOpacity
                    style={styles.forwardRoomRow}
                    onPress={() => handleForward(room)}
                    disabled={forwarding}
                  >
                    <Avatar
                      name={displayName}
                      imagePath={getRoomAvatar(room, currentUserId)}
                      size={28}
                      borderRadius={6}
                      fontSize={12}
                    />
                    <Text style={styles.forwardRoomName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {forwarding && (
                      <ActivityIndicator size="small" color="#00DEAB" />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJI_LIST = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "😡",
  "🎉",
  "🔥",
  "👏",
  "💯",
  "✅",
  "❌",
  "⭐",
  "💪",
  "🙏",
  "😊",
  "😎",
  "🤔",
  "👀",
  "💐",
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const TEAL = "#00DEAB";
const TEXT_PRIMARY = "#1D1D1D";
const TEXT_SECONDARY = "#6B7280";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scrollToBottomBtn: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    minHeight: 54,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  backBtn: { marginRight: 2 },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: TEAL,
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatarText: {
    color: "#fff",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
  },
  headerInfo: { flex: 1 },
  headerName: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Medium",
    color: TEXT_PRIMARY,
  },
  headerStatus: {
    fontSize: rf(10),
    fontFamily: "SF_Pro_Regular",
    color: "#8A8A8A",
    marginTop: 1,
  },

  // ── Search ──
  searchRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    fontSize: rf(14),
    color: "#111827",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: TEAL,
  },

  // ── Filter Chips ──
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#fff",
  },
  filterChipActive: {
    backgroundColor: "#1D1D1D",
    borderColor: "#1D1D1D",
  },
  filterChipText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#8A8A8A",
  },
  filterChipTextActive: {
    color: "#fff",
    fontFamily: "SF_Pro_Medium",
  },

  // ── Panel ──
  panelWrapper: {
    paddingTop: 4,
  },

  // ── Scroll ──
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12 },

  // ── Empty State ──
  workspaceContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  iconStack: { marginBottom: 14 },
  workspaceTitle: {
    fontSize: rf(20),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
    marginBottom: 8,
    textAlign: "center",
  },
  workspaceDescription: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 20,
  },

  // ── Messages ──
  messagesContainer: {
    paddingHorizontal: 16,
    gap: 20,
    paddingTop: 8,
  },
  messageWrapper: { width: "100%" },
  searchResultBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "center",
    marginBottom: 4,
  },
  searchResultText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Medium",
    color: "#6B7280",
  },

  incomingRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    gap: 10,
  },
  incomingContent: {
    flex: 1,
    alignItems: "flex-start",
  },
  senderMeta: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
    marginBottom: 5,
    textAlign: "left",
  },
  incomingBubble: {
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "90%",
  },

  outgoingRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    gap: 10,
  },
  outgoingContent: {
    flex: 1,
    alignItems: "flex-end",
  },
  senderMetaOutgoing: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
    marginBottom: 5,
    textAlign: "right",
  },
  outgoingBubble: {
    backgroundColor: "#00DEAB",
    borderRadius: 14,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "90%",
  },

  bubbleText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
    lineHeight: 20,
  },
  forwardedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  forwardedText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    fontStyle: "italic",
    color: "#6B7280",
  },
  quotedPreview: {
    borderLeftWidth: 3,
    borderLeftColor: "#00DEAB",
    backgroundColor: "rgba(0,222,171,0.08)",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  quotedSender: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#00A67E",
  },
  quotedText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
  timeMeta: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
  },

  // ── Pinned messages ──
  bubblePinnedIncoming: {
    backgroundColor: "#CCF3E6",
  },
  bubblePinnedOutgoing: {
    backgroundColor: "#E3EAF7",
  },
  pinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  pinBadgeText: {
    fontSize: rf(10),
    fontFamily: "SF_Pro_Regular",
    color: "#00A67E",
    textTransform: "uppercase",
  },
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF9",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pinnedBannerBody: {
    flex: 1,
  },
  pinnedBannerTitle: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#00A67E",
    marginBottom: 1,
  },
  pinnedBannerText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
  },

  // ── Reactions ──
  reactionsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  reactionBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionBadgeActive: {
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FACC15",
  },
  reactionText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
  },
  reactionTextActive: {
    color: "#CA8A04",
  },

  // ── Message Actions ──
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  actionBtn: { padding: 2 },

  // ── Avatar (in message) ──
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 20,
    backgroundColor: TEAL,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: "#fff",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    letterSpacing: 0.3,
  },

  // ── Reply Preview ──
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  replyPreviewBar: {
    width: 3,
    height: 30,
    borderRadius: 1.5,
    backgroundColor: TEAL,
  },
  replyPreviewContent: {
    flex: 1,
    gap: 2,
  },
  replyPreviewName: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: TEXT_PRIMARY,
  },
  replyPreviewText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
  },

  // ── Upload Progress ──
  uploadProgressContainer: {
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  uploadProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  uploadProgressText: {
    flex: 1,
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
  },
  uploadProgressPercent: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: "#00DEAB",
  },
  uploadProgressBarBg: {
    height: 3,
    backgroundColor: "#E5E7EB",
    borderRadius: 1.5,
    overflow: "hidden",
  },
  uploadProgressBarFill: {
    height: "100%",
    backgroundColor: "#00DEAB",
    borderRadius: 1.5,
  },

  // ── Input Bar ──
  inputBar: {
    backgroundColor: "#fff",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  mentionSuggestions: {
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    overflow: "hidden",
  },
  mentionSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  mentionAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1D1D1D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  mentionAvatarText: {
    color: "#fff",
    fontSize: rf(10),
    fontFamily: "SF_Pro_Bold",
  },
  mentionName: {
    flex: 1,
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: TEAL,
    opacity: 0.9,
  },
  typingDotMid: {
    opacity: 0.5,
  },
  typingText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
    fontStyle: "italic",
    flex: 1,
  },
  viewOnlyBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 8,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
  },
  viewOnlyText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
  inputContainer: {
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  inputRow: {
    minHeight: 36,
    justifyContent: "flex-start",
  },
  textInput: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
    padding: 0,
    maxHeight: 100,
    textAlignVertical: "top",
  },
  inputActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  inputActionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputActionBtn: {
    width: 38,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F2F2F2",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  plusBadge: {
    position: "absolute",
    top: 6,
    right: 8,
    fontSize: rf(9),
    color: TEXT_PRIMARY,
    fontFamily: "SF_Pro_Semibold",
  },
  sendBtn: {
    width: 38,
    height: 36,
    borderRadius: 10,
    backgroundColor: TEAL,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnActive: { backgroundColor: TEAL },

  // Recording Bar
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFF5F5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  recordingLiveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  recordingTimerText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
    color: "#EF4444",
  },
  recordingHintText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    marginLeft: 2,
  },
  recordingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  cancelRecordBtn: {
    padding: 6,
  },
  sendRecordBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },

  // Channel specific empty state button
  addPeopleChannelBtn: {
    backgroundColor: TEAL,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  addPeopleChannelText: {
    color: "#fff",
    fontFamily: "SF_Pro_Medium",
    fontSize: rf(13),
  },

  // Post Type
  postTypeToggle: {
    width: "auto",
    paddingHorizontal: 12,
    backgroundColor: "#F2F2F2",
  },
  postTypeToggleActive: {
    backgroundColor: "#1D1D1D",
  },
  postTypeToggleText: {
    color: "#1D1D1D",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
  },
  postTypeToggleTextActive: {
    color: "#fff",
  },
  postTypeScroll: {
    marginTop: 10,
  },
  postTypeScrollContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  postTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  postTypeChipText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
  },

  postTypeListPanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  postTypeListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 5,
    gap: 6,
    width: "48.5%",
  },
  postTypeListLabel: {
    flex: 1,
    fontSize: rf(11.5),
    fontFamily: "SF_Pro_Medium",
  },

  // Chat Member panel
  memberListPanel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 2,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00DEAB",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  memberAvatarText: {
    color: "#fff",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
  },
  memberName: {
    flex: 1,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },

  // ── Modal Overlay ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Emoji Picker ──
  emojiPickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    width: "80%",
    maxWidth: 340,
  },
  emojiPickerTitle: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Medium",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginBottom: 12,
  },
  emojiGrid: {
    alignItems: "center",
  },
  emojiItem: {
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  emojiText: {
    fontSize: rf(26),
  },

  // ── Forward Picker ──
  forwardPickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "85%",
    maxHeight: "70%",
    overflow: "hidden",
  },
  forwardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  forwardTitle: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Medium",
    color: TEXT_PRIMARY,
  },
  forwardPreview: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
  },
  forwardPreviewLabel: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Medium",
    color: TEXT_SECONDARY,
    marginBottom: 4,
  },
  forwardPreviewText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
  },
  forwardRoomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  forwardRoomAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TEAL,
    justifyContent: "center",
    alignItems: "center",
  },
  forwardRoomAvatarText: {
    color: "#fff",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
  },
  forwardRoomName: {
    flex: 1,
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
  },

  // ── Edit Message ──
  editContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    width: "85%",
  },
  editTitle: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Medium",
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
    minHeight: 80,
    textAlignVertical: "top",
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 14,
  },
  editCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editCancelText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: TEXT_SECONDARY,
  },
  editSaveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: TEAL,
  },
  editSaveBtnDisabled: {
    opacity: 0.5,
  },
  editSaveText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: "#fff",
  },

  // ── Attachment rendering in bubbles ──
  imageAttachmentContainer: {
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 4,
  },
  attachedImage: {
    width: 220,
    height: 180,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    marginBottom: 2,
  },
  docAttachmentContainer: {
    marginBottom: 4,
    gap: 4,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
  },
  docName: {
    flex: 1,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
  },

  // ── Inline Editing Banner ──
  editingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  editingBannerLeftBar: {
    width: 3,
    height: 32,
    backgroundColor: TEAL,
    borderRadius: 1.5,
  },
  editingBannerTextWrap: {
    flex: 1,
  },
  editingBannerTitle: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: TEAL,
  },
  editingBannerText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
  },
  editingBannerCloseBtn: {
    padding: 4,
  },
});
