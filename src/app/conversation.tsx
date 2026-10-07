import { rf } from "@/utils/responsive";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AddPeopleModal from "@/components/AddPeopleModal";
import InviteToChannelModal, {
  type ChannelMember,
  type ChannelPermission,
} from "@/components/InviteToChannelModal";
import Avatar from "@/components/Avatar";
import CalendarPicker from "@/components/CalendarPicker";
import MediaComposerModal, {
  type ComposerFile,
} from "@/components/MediaComposerModal";
import SecureImage from "@/components/SecureImage";
import Icons from "@/constants/icons";
import { useAuth } from "@/hooks/useAuth";
import { useChat, useChatPresence } from "@/hooks/useChat";
import * as socketService from "@/services/socket/socketService";
import * as chatService from "@/services/api/chat.service";
import {
  ChatMessage,
  ChatPermission,
  MessageAttachment,
  Room,
  RoomMember,
} from "@/types/chat.types";
import {
  buildVoiceNoteFileName,
  buildVoiceNoteText,
  canPerformAction,
  filterMessagesByText,
  formatMessageTime,
  formatVoiceDuration,
  getMessagePostType,
  getMessageTick,
  getRoomAvatar,
  getVoiceNoteSeconds,
  getVoiceNoteSecondsFromAttachment,
  isAudioAttachment,
  isOwnMessage,
  isRoomUnread,
  isVoiceNoteText,
  isWithinMessageActionWindow,
  resolveFileUrl,
  resolveSecureFileUrl,
} from "@/utils/chatHelpers";
import {
  markConversationClosed,
  markConversationOpen,
} from "@/utils/conversationNavigation";
import { canDeleteDirectChat } from "@/utils/permissions";
import {
  attachmentExtension,
  decodeAttachmentName,
  downloadChatAttachment,
  openChatDocument,
} from "@/utils/openChatDocument";
import { formatFileSize } from "@/services/api/upload.service";
import { triggerHaptic } from "@/utils/haptics";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { getStoredToken } from "@/utils/token";
import { useAuthToken } from "@/utils/secureImageFetch";
import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File as FileSystemFile, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
  AppState,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  ImageStyle,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Reanimated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import EmojiPicker from "rn-emoji-keyboard";

const { ChatIcon: MainChatIcon } = Icons;

// Long-press delay shared by message bubbles and their attachments, so opening
// the action toolbar feels identical wherever the press lands.
const ATTACHMENT_LONG_PRESS_DELAY = 250;

// How long a jumped-to (quoted reply / pinned) message stays highlighted.
// WhatsApp-style: one sustained highlight, not a flash.
const JUMP_HIGHLIGHT_MS = 1500;

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

/**
 * One waveform bar. Colour is driven on the UI thread from the shared progress
 * value, with a one-bar-wide interpolation window so the playhead sweeps
 * smoothly across the bars instead of snapping each on a status tick.
 */
function WaveformBar({
  height,
  index,
  count,
  progressPct,
}: {
  height: number;
  index: number;
  count: number;
  progressPct: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const barPct = count > 0 ? (index / count) * 100 : 0;
    const step = count > 0 ? 100 / count : 100;
    return {
      // Fade each bar in as the playhead reaches it, over one bar of travel,
      // so the teal fill sweeps continuously instead of switching in steps.
      backgroundColor: interpolateColor(
        progressPct.value,
        [barPct, barPct + step],
        ["#D1D5DB", "#00DEAB"],
        "RGB",
      ),
    };
  });
  return (
    <Reanimated.View
      style={[vnStyles.waveformBar, { height: 3 + height * 13 }, animatedStyle]}
    />
  );
}

function VoiceNotePlayer({
  audioUrl,
  initialDurationSec,
  onLongPress,
}: {
  audioUrl: string;
  initialDurationSec?: number | null;
  /** Forwards a long-press on the voice note to the message action toolbar. */
  onLongPress?: (e: GestureResponderEvent) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const waveformBars = useMemo(() => getWaveformBars(audioUrl), [audioUrl]);
  // Smooth waveform progress, driven on the UI thread. Native playback-status
  // updates only arrive ~once per second, so instead of repainting the bars on
  // each tick we advance `progressPct` every animation frame and let the status
  // updates re-sync it. The frame callback runs only while playing.
  const progressPct = useSharedValue(0);
  const durationMs = useSharedValue(0);
  const playingRef = useRef(false);

  const onFrame = useCallback(
    (frame: { timeSincePreviousFrame: number | null }) => {
      "worklet";
      if (durationMs.value <= 0) return;
      const dt = frame.timeSincePreviousFrame ?? 0;
      const next = progressPct.value + (dt / durationMs.value) * 100;
      progressPct.value = next > 100 ? 100 : next;
    },
    // Shared values are stable refs; they must not be listed (the compiler
    // treats a value passed to a hook as immutable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const frameCallback = useFrameCallback(onFrame, false);
  const setPlaying = useCallback(
    (next: boolean) => {
      playingRef.current = next;
      frameCallback.setActive(next);
    },
    [frameCallback],
  );

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
          setPlaying(false);
          console.log("[Audio] Voice note paused:", resolvedUrl);
        } else if (!finishedRef.current) {
          // Resuming a paused note — keep the current position.
          playerRef.current.play();
          setIsPlaying(true);
          setPlaying(true);
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
            setPlaying(false);
            progressPct.value = 0;
            return;
          }
          if (typeof status.duration === "number" && status.duration > 0) {
            durationMs.value = status.duration * 1000;
            setDuration(status.duration * 1000);
          }
          if (typeof status.currentTime === "number") {
            // Re-sync the smooth progress to the authoritative position. While
            // playing, never move it backwards (the frame callback may already
            // be slightly ahead between status ticks).
            const pct =
              durationMs.value > 0
                ? ((status.currentTime * 1000) / durationMs.value) * 100
                : 0;
            progressPct.value = playingRef.current
              ? Math.max(progressPct.value, pct)
              : pct;
            setPosition(status.currentTime * 1000);
          }
          setPlaying(!!status.playing);
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
            setPlaying(false);
            progressPct.value = 0;
          }
        });
      }

      try {
        newPlayer.play();
        setIsPlaying(true);
        setPlaying(true);
      } catch (playErr) {
        console.log("[Audio] play() threw:", playErr);
        showError("Playback Error", "Could not start audio playback.");
        setIsPlaying(false);
        setPlaying(false);
      }
    } catch (err) {
      console.log("[Audio] Failed to play voice note:", err);
      showError("Playback Error", "Could not play audio note.");
      setIsPlaying(false);
      setPlaying(false);
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
      setPlaying(false);
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
    // `setPlaying` is stable (deps: the stable frame-callback object), so this
    // still registers the cross-player pause handler exactly once.
  }, [setPlaying]);

  const posSec = Math.floor(position / 1000);
  const durSec = Math.floor(duration / 1000);
  // Prefer the real audio duration; fall back to the duration we tagged on the
  // message/filename so the length is visible before the note is played.
  const totalSec =
    durSec > 0
      ? durSec
      : initialDurationSec && initialDurationSec > 0
        ? Math.floor(initialDurationSec)
        : 0;

  return (
    <Pressable
      style={vnStyles.container}
      onLongPress={onLongPress}
      delayLongPress={ATTACHMENT_LONG_PRESS_DELAY}
    >
      <TouchableOpacity
        onPress={handlePlayPause}
        onLongPress={onLongPress}
        delayLongPress={ATTACHMENT_LONG_PRESS_DELAY}
        style={vnStyles.playBtn}
        activeOpacity={0.8}
      >
        <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#fff" />
      </TouchableOpacity>
      <View style={vnStyles.trackContainer}>
        <View style={vnStyles.waveformRow}>
          {waveformBars.map((h, i) => (
            <WaveformBar
              key={i}
              height={h}
              index={i}
              count={waveformBars.length}
              progressPct={progressPct}
            />
          ))}
        </View>
        <Text style={vnStyles.timeText}>
          {totalSec > 0
            ? isPlaying || position > 0
              ? `${formatVoiceDuration(posSec)} / ${formatVoiceDuration(totalSec)}`
              : formatVoiceDuration(totalSec)
            : isPlaying
              ? "Playing..."
              : "Voice note"}
        </Text>
      </View>
    </Pressable>
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
  // Default range when the Date card is opened: Last 90 days.
  const defaultStart = new Date(today);
  defaultStart.setDate(today.getDate() - 89);
  const [startDate, setStartDate] = useState<Date | null>(defaultStart);
  const [endDate, setEndDate] = useState<Date | null>(today);
  const [selectedRange, setSelectedRange] = useState<string | null>(
    "Last 90 days",
  );
  // Fires on mount too (no first-render skip) so the header's Date chip
  // reflects the "Last 90 days" default immediately instead of only after the
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

/**
 * Build an expo-video source for a chat attachment. Backend `/public/...`
 * files are auth-gated, so they must be streamed through the `secure-file`
 * proxy with the auth headers (a bare URL in a browser/external player would
 * just 401 — which is why videos previously "opened" the backend URL).
 */
function buildVideoSource(
  url: string | null | undefined,
  token: string | null | undefined,
): VideoSource {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("file://") ||
    lower.startsWith("content://") ||
    lower.startsWith("blob:") ||
    lower.startsWith("data:")
  ) {
    return { uri: url };
  }
  const headers = token
    ? { authToken: token, "x-access-token": token }
    : undefined;
  const uri = url.replace(/^\/+/, "").startsWith("public/")
    ? resolveSecureFileUrl(url)
    : resolveFileUrl(url);
  return { uri, headers };
}

// Matches http(s) URLs embedded in a message's plain text.
const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;
const URL_FULL_PATTERN = /^https?:\/\/[^\s]+$/i;

/** Renders message text with clickable, underlined links. */
function LinkifiedText({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const parts = text.split(URL_PATTERN);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        URL_FULL_PATTERN.test(part) ? (
          <Text
            key={i}
            style={styles.linkText}
            onPress={() =>
              Linking.openURL(part).catch(() =>
                showError("Error", "Could not open link"),
              )
            }
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

// ─── Member Permission Sheet ──────────────────────────────────────────────────

const MEMBER_PERMISSION_OPTIONS: ChannelPermission[] = [
  "Full edit",
  "Edit",
  "Comment",
  "View Only",
];

/**
 * Small anchored popover shown when the channel owner taps the edit icon on a
 * member in the "Chat members" panel. Mirrors the permission options used in
 * the Invite-to-Channel modal.
 */
function MemberPermissionSheet({
  visible,
  memberName,
  current,
  anchor,
  onSelect,
  onClose,
}: {
  visible: boolean;
  memberName?: string;
  current?: ChannelPermission;
  anchor: { x: number; y: number } | null;
  onSelect: (permission: ChannelPermission) => void;
  onClose: () => void;
}) {
  if (!visible || !anchor) return null;

  const { width: screenW, height: screenH } = Dimensions.get("window");
  const CARD_WIDTH = 168;
  const margin = 8;
  // Anchor the card under the tapped edit icon, clamped to the screen.
  const left = Math.min(
    Math.max(anchor.x - CARD_WIDTH + 24, margin),
    screenW - CARD_WIDTH - margin,
  );
  const top = Math.min(
    Math.max(anchor.y + 6, margin),
    screenH - 210,
  );

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={memberSheetStyles.overlay} onPress={onClose}>
        <Pressable
          style={[memberSheetStyles.card, { top, left, width: CARD_WIDTH }]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={memberSheetStyles.header} numberOfLines={1}>
            {memberName || "Member"}
          </Text>
          {MEMBER_PERMISSION_OPTIONS.map((opt) => {
            const active = current === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[
                  memberSheetStyles.option,
                  active && memberSheetStyles.optionActive,
                ]}
                activeOpacity={0.7}
                onPress={() => onSelect(opt)}
              >
                <Text
                  style={[
                    memberSheetStyles.optionText,
                    active && memberSheetStyles.optionTextActive,
                  ]}
                >
                  {opt}
                </Text>
                {active && <Ionicons name="checkmark" size={13} color="#00DEAB" />}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const memberSheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  card: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    fontSize: rf(10.5),
    fontFamily: "SF_Pro_Semibold",
    color: "#9CA3AF",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionActive: {
    backgroundColor: "#F0FDF9",
  },
  optionText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  optionTextActive: {
    fontFamily: "SF_Pro_Semibold",
    color: "#00A67E",
  },
});

/**
 * Build the body text for a "replying to…" preview. Voice notes surface their
 * length (the only way to tell two voice notes apart in a quoted reply).
 */
function getReplyPreviewText(m?: {
  text?: string | null;
  attachments?: { url?: string | null; name?: string | null; type?: string | null }[] | null;
} | null): string {
  if (!m) return "";
  const audio = (m.attachments ?? []).find((a) => isAudioAttachment(a));
  if (audio) {
    // Duration may be encoded in the filename or tagged in the message text.
    const secs = getVoiceNoteSeconds(m);
    return secs != null
      ? `🎤 Voice note · ${formatVoiceDuration(secs)}`
      : "🎤 Voice note";
  }
  if (isVoiceNoteText(m.text)) {
    const secs = getVoiceNoteSeconds(m);
    return secs != null
      ? `🎤 Voice note · ${formatVoiceDuration(secs)}`
      : "🎤 Voice note";
  }
  if (m.text) return m.text;
  return (m.attachments?.length ?? 0) > 0 ? "📎 Attachment" : "";
}

/**
 * Try to pull the original message id out of a quoted `parent_id` payload.
 * The backend usually sends `{ sender_name, text }` (no id), but some
 * deployments include one — support the common shapes.
 */
function extractParentId(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  const direct = [o._id, o.id, o.messageId, o.message_id, o.parent_id];
  for (const c of direct) {
    if (typeof c === "string" && c) return c;
    if (typeof c === "number" && c) return String(c);
  }
  const nested = o.message;
  if (nested && typeof nested === "object") {
    const n = nested as Record<string, unknown>;
    if (typeof n._id === "string" && n._id) return n._id;
    if (typeof n.id === "number" && n.id) return String(n.id);
  }
  return undefined;
}

function AttachmentsPanel({
  messages,
  onOpenImage,
  onOpenVideo,
}: {
  messages: ChatMessage[];
  onOpenImage?: (images: MessageAttachment[], index: number) => void;
  onOpenVideo?: (url: string, name?: string) => void;
}) {
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
                onPress={() => onOpenImage?.(imageAttachments, index)}
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
                onPress={() => onOpenVideo?.(item.url, decodeAttachmentName(item.name))}
              >
                <View style={ap.fileIconBadge}>
                  <Ionicons name="videocam" size={16} color="#00DEAB" />
                </View>
                <Text style={ap.fileName} numberOfLines={1}>
                  {decodeAttachmentName(item.name) || "Video"}
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
                  openChatDocument(
                    item.url,
                    decodeAttachmentName(item.name),
                  ).catch(() => {})
                }
              >
                <View style={ap.fileIconBadge}>
                  <Ionicons name="document-text" size={16} color="#00DEAB" />
                </View>
                <Text style={ap.fileName} numberOfLines={1}>
                  {decodeAttachmentName(item.name) || "Document"}
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

// ─── Date Divider ─────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_SHORT = [
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

/**
 * WhatsApp-style static date label:
 *   Today | Yesterday | weekday name (last 7 days) | "Mon, 11 Sep" (older).
 */
function formatDateDivider(dateInput?: Date | string | null): string {
  const d = dateInput ? new Date(dateInput) : null;
  if (!d || isNaN(d.getTime())) return "";

  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(new Date()) - startOfDay(d)) / 86_400_000,
  );

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) return WEEKDAY_LONG[d.getDay()];
  return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

// Simple, static date label shown above each date group.
function DateDivider({ label }: { label: string }) {
  return (
    <View style={ddStyles.container}>
      <View style={ddStyles.pill}>
        <Text style={ddStyles.text}>{label}</Text>
      </View>
    </View>
  );
}

const ddStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
    width: "100%",
  },
  pill: {
    backgroundColor: "#F0F2F5",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    fontSize: rf(8),
    fontFamily: "SF_Pro_Medium",
    color: "#54656F",
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

// ─── Swipe to Reply ─────────────────────────────────────────────────────────

const SWIPE_REPLY_TRIGGER = 56;
const SWIPE_REPLY_MAX = 88;

function SwipeToReply({
  children,
  onReply,
  enabled = true,
}: {
  children: React.ReactNode;
  onReply: () => void;
  enabled?: boolean;
}) {
  const translateX = useSharedValue(0);
  const pan = Gesture.Pan()
    // Only activate on a deliberate horizontal drag so vertical list
    // scrolling is never captured by the row.
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      translateX.value = Math.max(0, Math.min(e.translationX, SWIPE_REPLY_MAX));
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_REPLY_TRIGGER) {
        runOnJS(onReply)();
      }
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const iconStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, translateX.value / SWIPE_REPLY_TRIGGER);
    return {
      opacity: progress,
      transform: [{ scale: 0.5 + progress * 0.5 }],
    };
  });

  // View Only members get no reply affordance (website §2.6). Hooks above are
  // always called so the hook order stays stable across renders.
  if (!enabled) {
    return <View style={swipeReplyStyles.container}>{children}</View>;
  }

  return (
    <View style={swipeReplyStyles.container}>
      <Reanimated.View style={[swipeReplyStyles.iconWrap, iconStyle]}>
        <Ionicons name="arrow-undo" size={18} color="#00DEAB" />
      </Reanimated.View>
      <GestureDetector gesture={pan}>
        <Reanimated.View style={rowStyle}>{children}</Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const swipeReplyStyles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
  },
  iconWrap: {
    position: "absolute",
    left: 18,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Attachment Cluster (WhatsApp-style) ──────────────────────────────────────
// Groups multiple image attachments into a compact grid instead of stacking
// them full-size, and makes every image/doc tappable (images open in a viewer,
// docs open externally).

const ATT_GRID_WIDTH = 220;
const ATT_GRID_GAP = 3;
const ATT_CELL = Math.floor((ATT_GRID_WIDTH - ATT_GRID_GAP) / 2);
// Document cards are intentionally more compact than the image grid.
const DOC_CARD_WIDTH = 180;

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// WhatsApp-style presentation for a document attachment: an accent icon keyed
// by file type, plus a small metadata line ("PDF • 2.4 MB").
const DOC_TYPE_STYLE: Record<
  string,
  { icon: IoniconName; color: string; tint: string }
> = {
  pdf: { icon: "document-text", color: "#EF4444", tint: "#FEE2E2" },
  doc: { icon: "document-text", color: "#2563EB", tint: "#DBEAFE" },
  docx: { icon: "document-text", color: "#2563EB", tint: "#DBEAFE" },
  xls: { icon: "grid", color: "#16A34A", tint: "#DCFCE7" },
  xlsx: { icon: "grid", color: "#16A34A", tint: "#DCFCE7" },
  csv: { icon: "grid", color: "#16A34A", tint: "#DCFCE7" },
  ppt: { icon: "easel", color: "#EA580C", tint: "#FFEDD5" },
  pptx: { icon: "easel", color: "#EA580C", tint: "#FFEDD5" },
  zip: { icon: "archive", color: "#D97706", tint: "#FEF3C7" },
  rar: { icon: "archive", color: "#D97706", tint: "#FEF3C7" },
  "7z": { icon: "archive", color: "#D97706", tint: "#FEF3C7" },
  txt: { icon: "document-text", color: "#6B7280", tint: "#F3F4F6" },
};

function getDocumentPresentation(doc: MessageAttachment): {
  icon: IoniconName;
  color: string;
  tint: string;
  meta: string;
} {
  const ext =
    attachmentExtension(decodeAttachmentName(doc.name)) ||
    attachmentExtension(doc.url) ||
    "";
  const preset = DOC_TYPE_STYLE[ext] ?? {
    icon: "document-outline" as IoniconName,
    color: "#00A67E",
    tint: "#E6FBF5",
  };
  const mimeSubtype = (doc.type || "").includes("/")
    ? (doc.type || "").split("/")[1]
    : "";
  const typeLabel = (ext || mimeSubtype || "").toUpperCase().slice(0, 4);
  const meta = [typeLabel, doc.size ? formatFileSize(doc.size) : ""]
    .filter(Boolean)
    .join(" • ");
  return { icon: preset.icon, color: preset.color, tint: preset.tint, meta };
}

function AttachmentCluster({
  images,
  docs,
  videos = [],
  onOpenImage,
  onOpenVideo,
  onLongPress,
}: {
  images: MessageAttachment[];
  docs: MessageAttachment[];
  videos?: MessageAttachment[];
  onOpenImage?: (images: MessageAttachment[], index: number) => void;
  onOpenVideo?: (url: string, name?: string) => void;
  /** Forwards a long-press on any attachment to the message action toolbar. */
  onLongPress?: (e: GestureResponderEvent) => void;
}) {
  const openDoc = (doc: MessageAttachment) => {
    openChatDocument(doc.url, decodeAttachmentName(doc.name)).catch(() =>
      showError("Error", "Could not open attachment"),
    );
  };

  // Tracks which document is currently being saved so its row can show a
  // spinner instead of the download icon.
  const [downloadingDocKey, setDownloadingDocKey] = useState<string | null>(
    null,
  );
  const saveDoc = async (doc: MessageAttachment, key: string) => {
    if (downloadingDocKey) return;
    setDownloadingDocKey(key);
    try {
      await downloadChatAttachment(doc.url, decodeAttachmentName(doc.name));
    } catch {
      showError("Error", "Could not download document");
    } finally {
      setDownloadingDocKey(null);
    }
  };

  const count = images.length;
  const hasImages = count > 0;
  const hasDocs = docs.length > 0;
  const hasVideos = videos.length > 0;

  const cellStyle: StyleProp<ImageStyle> = {
    width: ATT_CELL,
    height: ATT_CELL,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  };

  const renderImage = (
    att: MessageAttachment,
    index: number,
    style: StyleProp<ImageStyle>,
    overlay?: number,
  ) => (
    <TouchableOpacity
      key={`img-${index}`}
      activeOpacity={0.9}
      onPress={() => onOpenImage?.(images, index)}
      onLongPress={onLongPress}
      delayLongPress={ATTACHMENT_LONG_PRESS_DELAY}
    >
      <SecureImage url={att.url} style={style} resizeMode="cover" />
      {overlay && overlay > 0 ? (
        <View style={styles.attGridMore}>
          <Text style={styles.attGridMoreText}>{`+${overlay}`}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <>
      {hasImages ? (
        <View style={styles.attGridWrap}>
          {count === 1 ? (
            renderImage(images[0], 0, styles.attachedImage)
          ) : count === 2 ? (
            <View style={styles.attGridRow}>
              {renderImage(images[0], 0, cellStyle)}
              {renderImage(images[1], 1, cellStyle)}
            </View>
          ) : count === 3 ? (
            <View style={styles.attGridCol}>
              {renderImage(images[0], 0, { width: ATT_GRID_WIDTH, height: ATT_CELL, borderRadius: 8, backgroundColor: "#E5E7EB" })}
              <View style={styles.attGridRow}>
                {renderImage(images[1], 1, cellStyle)}
                {renderImage(images[2], 2, cellStyle)}
              </View>
            </View>
          ) : (
            <View style={styles.attGridCol}>
              <View style={styles.attGridRow}>
                {renderImage(images[0], 0, cellStyle)}
                {renderImage(images[1], 1, cellStyle)}
              </View>
              <View style={styles.attGridRow}>
                {renderImage(images[2], 2, cellStyle)}
                {renderImage(images[3], 3, cellStyle, count - 4)}
              </View>
            </View>
          )}
        </View>
      ) : null}

      {hasVideos ? (
        <View style={styles.videoAttachmentContainer}>
          {videos.map((vid, i) => (
            <TouchableOpacity
              key={`video-${i}`}
              style={styles.videoCard}
              activeOpacity={0.85}
              onPress={() =>
                onOpenVideo?.(vid.url, decodeAttachmentName(vid.name))
              }
              onLongPress={onLongPress}
              delayLongPress={ATTACHMENT_LONG_PRESS_DELAY}
            >
              <View style={styles.videoCardBody}>
                <View style={styles.videoCardPlay}>
                  <Ionicons name="play" size={16} color="#fff" />
                </View>
                <Text style={styles.videoCardText} numberOfLines={1}>
                  {decodeAttachmentName(vid.name) || "Video"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {hasDocs ? (
        <View style={styles.docAttachmentContainer}>
          {docs.map((doc, i) => {
            const { icon, color, tint, meta } = getDocumentPresentation(doc);
            const docKey = `doc-${i}`;
            return (
              <View key={docKey} style={styles.docRow}>
                <TouchableOpacity
                  style={styles.docMain}
                  activeOpacity={0.75}
                  onPress={() => openDoc(doc)}
                  onLongPress={onLongPress}
                  delayLongPress={ATTACHMENT_LONG_PRESS_DELAY}
                >
                  <View style={[styles.docIconBox, { backgroundColor: tint }]}>
                    <Ionicons name={icon} size={20} color={color} />
                  </View>
                  <View style={styles.docInfo}>
                    <Text style={styles.docName} numberOfLines={2}>
                      {decodeAttachmentName(doc.name) || "Document"}
                    </Text>
                    {meta ? (
                      <Text style={styles.docMeta} numberOfLines={1}>
                        {meta}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.docDownloadBtn}
                  activeOpacity={0.7}
                  onPress={() => saveDoc(doc, docKey)}
                  onLongPress={onLongPress}
                  delayLongPress={ATTACHMENT_LONG_PRESS_DELAY}
                  disabled={downloadingDocKey === docKey}
                  hitSlop={8}
                >
                  {downloadingDocKey === docKey ? (
                    <ActivityIndicator size="small" color="#00A67E" />
                  ) : (
                    <Ionicons
                      name="download-outline"
                      size={19}
                      color="#6B7280"
                    />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

// ─── Image Viewer ─────────────────────────────────────────────────────────────

// Pinch-to-zoom page for the full-screen image viewer:
//   - pinch to zoom (fit up to 6x)
//   - drag to pan while zoomed (single finger, so it never fights the pinch)
//   - double-tap to toggle between fit and 2.5x, centered on the tapped point
// The page reports its zoom state so the pager can stop paging while an image
// is zoomed — otherwise a horizontal pan would swipe to the next image.
const VIEWER_MAX_SCALE = 6;
const VIEWER_DOUBLE_TAP_SCALE = 2.5;

function ZoomableImage({
  url,
  width,
  height,
  onZoomChange,
}: {
  url: string;
  width: number;
  height: number;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const notifyZoom = useCallback(
    (next: boolean) => {
      setZoomed(next);
      onZoomChange?.(next);
    },
    [onZoomChange],
  );

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(VIEWER_MAX_SCALE, Math.max(1, next));
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyZoom)(false);
        return;
      }
      const maxX = ((scale.value - 1) * width) / 2;
      const maxY = ((scale.value - 1) * height) / 2;
      const clampedX = Math.max(-maxX, Math.min(maxX, translateX.value));
      const clampedY = Math.max(-maxY, Math.min(maxY, translateY.value));
      translateX.value = withSpring(clampedX);
      translateY.value = withSpring(clampedY);
      savedScale.value = scale.value;
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
      runOnJS(notifyZoom)(true);
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .maxPointers(1)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      const maxX = ((scale.value - 1) * width) / 2;
      const maxY = ((scale.value - 1) * height) / 2;
      const clampedX = Math.max(-maxX, Math.min(maxX, translateX.value));
      const clampedY = Math.max(-maxY, Math.min(maxY, translateY.value));
      translateX.value = withSpring(clampedX);
      translateY.value = withSpring(clampedY);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd((e, success) => {
      if (!success) return;
      if (scale.value > 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyZoom)(false);
        return;
      }
      const next = VIEWER_DOUBLE_TAP_SCALE;
      const maxX = ((next - 1) * width) / 2;
      const maxY = ((next - 1) * height) / 2;
      const targetX = -(e.x - width / 2) * (next - 1);
      const targetY = -(e.y - height / 2) * (next - 1);
      const clampedX = Math.max(-maxX, Math.min(maxX, targetX));
      const clampedY = Math.max(-maxY, Math.min(maxY, targetY));
      scale.value = withSpring(next);
      translateX.value = withSpring(clampedX);
      translateY.value = withSpring(clampedY);
      savedScale.value = next;
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
      runOnJS(notifyZoom)(true);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View
        style={[
          { width, height, alignItems: "center", justifyContent: "center" },
          animatedStyle,
        ]}
      >
        <SecureImage url={url} style={{ width, height }} resizeMode="contain" />
      </Reanimated.View>
    </GestureDetector>
  );
}

function ImageViewerModal({
  visible,
  images,
  index,
  onClose,
  onChangeIndex,
}: {
  visible: boolean;
  images: MessageAttachment[];
  index: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}) {
  const listRef = useRef<FlatList<MessageAttachment>>(null);
  const { width, height } = Dimensions.get("window");
  const [zoomed, setZoomed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const safeIndex =
    images.length > 0 ? Math.max(0, Math.min(index, images.length - 1)) : 0;

  useEffect(() => {
    if (!visible || images.length === 0) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [visible, safeIndex, images.length]);

  const handleDownload = useCallback(async () => {
    const current = images[safeIndex];
    if (!current) return;
    setDownloading(true);
    try {
      await downloadChatAttachment(current.url, current.name);
    } catch {
      showError("Error", "Could not download image");
    } finally {
      setDownloading(false);
    }
  }, [images, safeIndex]);

  if (!visible || images.length === 0) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* The viewer lives inside a native Modal, which is a separate root on
          Android — it needs its own GestureHandlerRootView for the pinch/pan
          gestures to be recognized. */}
      <GestureHandlerRootView style={styles.viewerRoot}>
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          // While an image is zoomed, a one-finger drag pans the image, so the
          // pager must not also react to it.
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => `viewer-${i}`}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          initialScrollIndex={safeIndex}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            onChangeIndex(i);
          }}
          renderItem={({ item }) => (
            <ZoomableImage
              url={item.url}
              width={width}
              height={height}
              onZoomChange={setZoomed}
            />
          )}
        />
        <TouchableOpacity
          style={styles.viewerDownload}
          onPress={handleDownload}
          disabled={downloading}
          hitSlop={12}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="download-outline" size={22} color="#fff" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.viewerClose}
          onPress={onClose}
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        {images.length > 1 ? (
          <View style={styles.viewerCounter}>
            <Text style={styles.viewerCounterText}>
              {`${safeIndex + 1} / ${images.length}`}
            </Text>
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Video Viewer ─────────────────────────────────────────────────────────────

/**
 * Full-screen in-app video player. Streams the (auth-gated) video through the
 * secure-file proxy with headers instead of opening the raw backend URL.
 */
function VideoViewerModal({
  visible,
  url,
  name,
  onClose,
}: {
  visible: boolean;
  url: string | null;
  name?: string | null;
  onClose: () => void;
}) {
  const token = useAuthToken();
  // Only create a source while open — swapping to `null` releases the player.
  const source = useMemo<VideoSource>(
    () => (visible ? buildVideoSource(url, token) : null),
    [visible, url, token],
  );
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
  const [downloading, setDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    if (!url) return;
    setDownloading(true);
    try {
      await downloadChatAttachment(url, name);
    } catch {
      showError("Error", "Could not download video");
    } finally {
      setDownloading(false);
    }
  }, [url, name]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.videoViewerRoot}>
        <TouchableOpacity
          style={styles.videoViewerDownload}
          onPress={handleDownload}
          disabled={downloading}
          hitSlop={12}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="download-outline" size={22} color="#fff" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.videoViewerClose}
          onPress={onClose}
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        {source ? (
          <VideoView
            player={player}
            style={styles.videoViewerPlayer}
            nativeControls
            contentFit="contain"
            fullscreenOptions={{ enable: true }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({
  message,
  currentUserId,
  members,
  showSenderName = false,
  repliedPreview,
  highlighted = false,
  showTimestamp = true,
  onLongPress,
  onReactionPress,
  onOpenImage,
  onOpenVideo,
  onPressReply,
  postTypes,
}: {
  message: ChatMessage;
  currentUserId: number;
  members?: RoomMember[];
  showSenderName?: boolean;
  repliedPreview?: {
    senderName: string;
    text: string;
    targetId?: string;
  } | null;
  highlighted?: boolean;
  showTimestamp?: boolean;
  onLongPress?: (msg: ChatMessage, e?: GestureResponderEvent) => void;
  onReactionPress?: (msg: ChatMessage, emoji: string) => void;
  onOpenImage?: (images: MessageAttachment[], index: number) => void;
  onOpenVideo?: (url: string, name?: string) => void;
  onPressReply?: (messageId: string) => void;
  postTypes?: { name: string; color: string; icon?: string }[];
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

  // Post-type label (if the message was tagged with one).
  const messagePostType = getMessagePostType(message);
  const postTypeMeta = postTypes?.find((p) => p.name === messagePostType);
  const postTypeColor = postTypeMeta?.color ?? "#00DEAB";
  const postTypeBadge = messagePostType ? (
    <View
      style={[
        styles.postTypeBadge,
        { backgroundColor: postTypeColor + "22" },
      ]}
    >
      <Ionicons
        name={resolvePostTypeIcon(postTypeMeta?.icon)}
        size={10}
        color={postTypeColor}
      />
      <Text
        style={[styles.postTypeBadgeText, { color: postTypeColor }]}
        numberOfLines={1}
      >
        {messagePostType}
      </Text>
    </View>
  ) : null;

  // Quoted reply preview. When the parent message id is known it becomes
  // tappable — tapping scrolls to and highlights the original message.
  const replyTargetId = repliedPreview?.targetId;
  const replyPreviewBody = repliedPreview ? (
    <>
      <Text style={styles.quotedSender} numberOfLines={1}>
        {repliedPreview.senderName}
      </Text>
      <Text style={styles.quotedText} numberOfLines={2}>
        {repliedPreview.text}
      </Text>
    </>
  ) : null;
  const quotedPreviewNode =
    repliedPreview && replyTargetId && onPressReply ? (
      <TouchableOpacity
        style={styles.quotedPreview}
        activeOpacity={0.7}
        onPress={() => onPressReply(replyTargetId)}
      >
        {replyPreviewBody}
      </TouchableOpacity>
    ) : repliedPreview ? (
      <View style={styles.quotedPreview}>{replyPreviewBody}</View>
    ) : null;

  // Delivery / read tick from `delivered_to` + `is_read` (backend B5).
  // Double tick = reached every other member's device; blue = every other
  // member read it. Works for 1:1 and groups/channels alike.
  const tick = getMessageTick(message, members, currentUserId);
  const isTickDouble = tick === "delivered" || tick === "read";
  const tickColor = tick === "read" ? "#0DDFAB" : "#9CA3AF";

  const likedByMe = new Set(
    (message.reactions ?? [])
      .filter((r) => r.users.includes(currentUserId))
      .map((r) => r.emoji),
  );

  const audioAtt = message.attachments?.find((a) => isAudioAttachment(a));
  // Voice-note length: prefer the encoded filename, fall back to the text tag.
  const voiceNoteSeconds =
    getVoiceNoteSecondsFromAttachment(audioAtt ?? null) ??
    (isVoiceNoteText(message.text)
      ? getVoiceNoteSeconds({ text: message.text, attachments: null })
      : null);

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

  const videoAtts = message.attachments?.filter((a) => isVideoAttachment(a));

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
    return !isAudio && !isImage && !isVideoAttachment(a);
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
          {showTimestamp ? (
            <Avatar
              name={senderName}
              imagePath={senderImage}
              size={25}
              borderRadius={13}
              fontSize={10}
              fontFamily="SF_Pro_Regular"
            />
          ) : (
            <View style={styles.avatarSpacer} />
          )}
          <View style={styles.incomingContent}>
            {showTimestamp && (
              <Text style={styles.senderMeta}>
                {showSenderName ? `${senderName} ` : null}
                <Text style={styles.timeMeta}>
                  {showSenderName ? `| ${time}` : time}
                </Text>
              </Text>
            )}
            <Animated.View style={{ transform: [{ scale: bubbleScale }] }}>
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onLongPress={(e) => onLongPress?.(message, e)}
                delayLongPress={250}
                style={[
                  styles.incomingBubble,
                  message.is_pinned && styles.bubblePinnedIncoming,
                  highlighted && styles.bubbleHighlight,
                ]}
              >
                {postTypeBadge}
                {quotedPreviewNode}
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
                {audioAtt ? (
                  <VoiceNotePlayer
                    audioUrl={audioAtt.url}
                    initialDurationSec={voiceNoteSeconds}
                    onLongPress={(e) => onLongPress?.(message, e)}
                  />
                ) : null}
                <AttachmentCluster
                  images={imageAtts ?? []}
                  docs={docAtts ?? []}
                  videos={videoAtts ?? []}
                  onOpenImage={onOpenImage}
                  onOpenVideo={onOpenVideo}
                  onLongPress={(e) => onLongPress?.(message, e)}
                />
                {message.text &&
                !isVoiceNoteText(message.text) &&
                !message.text.startsWith("📎 ") ? (
                  <LinkifiedText text={message.text} style={styles.bubbleText} />
                ) : message.text &&
                  message.text.startsWith("📎 ") &&
                  !imageAtts?.length &&
                  !docAtts?.length &&
                  !videoAtts?.length &&
                  !audioAtt ? (
                  <LinkifiedText text={message.text} style={styles.bubbleText} />
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
            {showTimestamp && showSenderName ? `${senderName} ` : null}
            {showTimestamp ? (
              <>
                <Text style={styles.timeMeta}>
                  {showSenderName ? `| ${time}` : time}
                </Text>{" "}
              </>
            ) : null}
            {message.is_pending ? (
              <ActivityIndicator size={9} color="#9CA3AF" />
            ) : (
              <Ionicons
                name={isTickDouble ? "checkmark-done" : "checkmark"}
                size={13}
                color={tickColor}
              />
            )}
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
                highlighted && styles.bubbleHighlight,
              ]}
            >
              {postTypeBadge}
              {quotedPreviewNode}
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
              {audioAtt ? (
                  <VoiceNotePlayer
                    audioUrl={audioAtt.url}
                    initialDurationSec={voiceNoteSeconds}
                    onLongPress={(e) => onLongPress?.(message, e)}
                  />
                ) : null}
              <AttachmentCluster
                images={imageAtts ?? []}
                docs={docAtts ?? []}
                videos={videoAtts ?? []}
                onOpenImage={onOpenImage}
                onOpenVideo={onOpenVideo}
                onLongPress={(e) => onLongPress?.(message, e)}
              />
              {message.text &&
              !isVoiceNoteText(message.text) &&
              !message.text.startsWith("📎 ") ? (
                <LinkifiedText text={message.text} style={styles.bubbleText} />
              ) : message.text &&
                message.text.startsWith("📎 ") &&
                !imageAtts?.length &&
                !docAtts?.length &&
                !videoAtts?.length &&
                !audioAtt ? (
                <LinkifiedText text={message.text} style={styles.bubbleText} />
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
        {showTimestamp ? (
          <Avatar
            name={senderName}
            imagePath={senderImage}
            size={25}
            borderRadius={13}
            fontSize={10}
            fontFamily="SF_Pro_Regular"
          />
        ) : (
          <View style={styles.avatarSpacer} />
        )}
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
  withinEditWindow,
  onClose,
  onReactionSelect,
  onOpenEmojiPicker,
  onReply,
  onCopy,
  onForward,
  onDownload,
  onPin,
  onEdit,
  onDelete,
}: {
  visible: boolean;
  message: ChatMessage | null;
  targetY?: number;
  currentUserId: number;
  withinEditWindow?: boolean;
  onClose: () => void;
  onReactionSelect: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDownload: () => void;
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
  // Only plain text messages are editable — never attachments (images, docs,
  // videos) or voice notes.
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  const isEditableText =
    !hasAttachments &&
    !!message.text &&
    !isVoiceNoteText(message.text) &&
    !message.text.startsWith("📎 ");
  // Website §2.6: edit (and "delete for everyone") are limited to YOUR OWN
  // messages within 1 hour. Deletion itself is only ever possible for your own
  // messages — another user's message offers no Delete entry at all. Within the
  // window DeleteMessageModal offers both options; after it, only
  // "Delete for Me".
  const allowEdit = own && isEditableText && !!withinEditWindow;
  // Copy is only offered for real text messages — never for voice notes or
  // attachment-only marker texts ("📎 file").
  const copyableText =
    message.text &&
    !isVoiceNoteText(message.text) &&
    !message.text.startsWith("📎 ")
      ? message.text
      : "";

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

            {copyableText ? (
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
            ) : null}

            {hasAttachments ? (
              <TouchableOpacity
                style={waModalStyles.menuItem}
                activeOpacity={0.6}
                onPress={() => handlePressAction(onDownload)}
              >
                <Ionicons
                  name="download-outline"
                  size={18}
                  color="#374151"
                  style={waModalStyles.menuIcon}
                />
                <Text style={waModalStyles.menuText}>Download</Text>
              </TouchableOpacity>
            ) : null}

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

            {own && (
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
  withinEditWindow,
  onClose,
  onConfirmDelete,
}: {
  visible: boolean;
  message: ChatMessage | null;
  currentUserId: number;
  withinEditWindow?: boolean;
  onClose: () => void;
  onConfirmDelete: (deleteFor: "me" | "everyone") => void;
}) {
  if (!visible || !message) return null;

  // A user can only ever delete their own messages — another user's message is
  // never deletable (not even "for me"). The entry points are already hidden,
  // this is the modal-level guard.
  const own = isOwnMessage(message, currentUserId);
  if (!own) return null;
  // "Delete for Everyone" is only available within the 1-hour window; after it
  // only "Delete for Me" remains (Website §2.6).
  const allowDeleteEveryone = !!withinEditWindow;

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
                onConfirmDelete("me");
                onClose();
              }}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color="#EF4444"
                style={{ marginRight: 8 }}
              />
              <Text style={delModalStyles.deleteSelfText}>
                Delete for Me
              </Text>
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

// ─── Create Post Type Modal (Full edit / Edit only) ──────────────────────────

const POST_TYPE_COLORS = [
  "#0DDFAB", // teal
  "#1A73E8", // blue
  "#EA4335", // red
  "#FBBC04", // yellow
  "#34A853", // green
  "#FF6D00", // orange
  "#9C27B0", // purple
  "#E91E63", // pink
  "#00BCD4", // cyan
  "#FF5722", // deep orange
];
const POST_TYPE_ICONS: React.ComponentProps<typeof Ionicons>["name"][] = [
  "pricetag-outline",
  "star-outline",
  "flash-outline",
  "heart-outline",
  "flag-outline",
  "bookmark-outline",
  "information-circle-outline",
  "checkmark-circle-outline",
  "megaphone-outline",
  "notifications-outline",
  "bulb-outline",
  "chatbubbles-outline",
];

// Maps the icon names the backend may store (our Ionicons names, plus the
// website's Lucide-style names) to a valid Ionicons name so a post type's
// chosen icon actually renders in the chips instead of always falling back to
// the first icon.
const POST_TYPE_ICON_ALIASES: Record<
  string,
  React.ComponentProps<typeof Ionicons>["name"]
> = {
  tag: "pricetag-outline",
  pricetag: "pricetag-outline",
  "pricetag-outline": "pricetag-outline",
  star: "star-outline",
  "star-outline": "star-outline",
  zap: "flash-outline",
  flash: "flash-outline",
  "flash-outline": "flash-outline",
  heart: "heart-outline",
  "heart-outline": "heart-outline",
  flag: "flag-outline",
  "flag-outline": "flag-outline",
  bookmark: "bookmark-outline",
  "bookmark-outline": "bookmark-outline",
  info: "information-circle-outline",
  "info-circle": "information-circle-outline",
  "information-circle": "information-circle-outline",
  "information-circle-outline": "information-circle-outline",
  "check-circle": "checkmark-circle-outline",
  "circle-check": "checkmark-circle-outline",
  "checkmark-circle": "checkmark-circle-outline",
  "checkmark-circle-outline": "checkmark-circle-outline",
  megaphone: "megaphone-outline",
  "megaphone-outline": "megaphone-outline",
  bell: "notifications-outline",
  notifications: "notifications-outline",
  "notifications-outline": "notifications-outline",
  bulb: "bulb-outline",
  lightbulb: "bulb-outline",
  "bulb-outline": "bulb-outline",
  "message-square": "chatbubbles-outline",
  message: "chatbubbles-outline",
  chat: "chatbubbles-outline",
  chatbubbles: "chatbubbles-outline",
  "chatbubbles-outline": "chatbubbles-outline",
};

function resolvePostTypeIcon(
  icon?: string | null,
): React.ComponentProps<typeof Ionicons>["name"] {
  const key = (icon ?? "").trim().toLowerCase();
  return POST_TYPE_ICON_ALIASES[key] ?? "pricetag-outline";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const num = parseInt(full || "000000", 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const to = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** A single 0-255 RGB channel slider (responder-based, no native slider dep). */
function RgbSlider({
  value,
  onChange,
  trackColor,
}: {
  value: number;
  onChange: (v: number) => void;
  trackColor: string;
}) {
  const widthRef = useRef(1);
  const setFromX = (x: number) => {
    const ratio = Math.max(0, Math.min(1, x / (widthRef.current || 1)));
    onChange(Math.round(ratio * 255));
  };
  return (
    <View style={ptStyles.sliderRow}>
      <View
        style={ptStyles.sliderTrack}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width || 1;
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
        onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
      >
        <View
          style={[
            ptStyles.sliderFill,
            { width: `${(value / 255) * 100}%`, backgroundColor: trackColor },
          ]}
        />
        <View
          style={[
            ptStyles.sliderThumb,
            { left: `${(value / 255) * 100}%`, borderColor: trackColor },
          ]}
        />
      </View>
      <Text style={ptStyles.sliderValue}>{value}</Text>
    </View>
  );
}

function PostTypeCreateModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string, icon: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(POST_TYPE_COLORS[0]);
  const [icon, setIcon] = useState<React.ComponentProps<typeof Ionicons>["name"]>(
    POST_TYPE_ICONS[0],
  );
  const [saving, setSaving] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [rgb, setRgb] = useState(() => hexToRgb(POST_TYPE_COLORS[0]));

  useEffect(() => {
    if (visible) {
      setName("");
      setColor(POST_TYPE_COLORS[0]);
      setRgb(hexToRgb(POST_TYPE_COLORS[0]));
      setIcon(POST_TYPE_ICONS[0]);
      setSaving(false);
      setCustomOpen(false);
    }
  }, [visible]);

  const selectPreset = (c: string) => {
    setColor(c);
    setRgb(hexToRgb(c));
    setCustomOpen(false);
  };

  const applyRgb = (next: { r: number; g: number; b: number }) => {
    setRgb(next);
    setColor(rgbToHex(next.r, next.g, next.b));
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showError("Validation", "Post type name is required");
      return;
    }
    setSaving(true);
    try {
      await onCreate(trimmed, color, icon);
      onClose();
    } catch {
      showError("Error", "Could not create post type");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={ptStyles.overlay} onPress={onClose}>
        <Pressable style={ptStyles.card} onStartShouldSetResponder={() => true}>
          <Text style={ptStyles.title}>New Post Type</Text>
          <TextInput
            style={ptStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="Post type name"
            placeholderTextColor="#9CA3AF"
            maxLength={30}
          />

          <Text style={ptStyles.sectionLabel}>Icon</Text>
          <View style={ptStyles.iconRow}>
            {POST_TYPE_ICONS.map((ic) => (
              <TouchableOpacity
                key={ic}
                style={[
                  ptStyles.iconBtn,
                  icon === ic && ptStyles.iconBtnActive,
                ]}
                activeOpacity={0.7}
                onPress={() => setIcon(ic)}
              >
                <Ionicons
                  name={ic}
                  size={18}
                  color={icon === ic ? color : "#6B7280"}
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={ptStyles.sectionLabel}>Color</Text>
          <View style={ptStyles.swatchRow}>
            {POST_TYPE_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  ptStyles.swatch,
                  { backgroundColor: c },
                  color.toUpperCase() === c.toUpperCase() &&
                    !customOpen &&
                    ptStyles.swatchActive,
                ]}
                activeOpacity={0.7}
                onPress={() => selectPreset(c)}
              />
            ))}
          </View>

          {/* Custom color — tapping the swatch opens the RGB picker. */}
          <TouchableOpacity
            style={ptStyles.customRow}
            activeOpacity={0.75}
            onPress={() => setCustomOpen((v) => !v)}
          >
            <View style={[ptStyles.customSwatch, { backgroundColor: color }]} />
            <Text style={ptStyles.customLabel}>
              {customOpen ? "Custom color" : "Use a custom color"}
            </Text>
            <Ionicons
              name={customOpen ? "chevron-up" : "color-palette-outline"}
              size={16}
              color="#6B7280"
            />
          </TouchableOpacity>

          {customOpen && (
            <View style={ptStyles.rgbPanel}>
              <RgbSlider
                value={rgb.r}
                onChange={(r) => applyRgb({ ...rgb, r })}
                trackColor="#EA4335"
              />
              <RgbSlider
                value={rgb.g}
                onChange={(g) => applyRgb({ ...rgb, g })}
                trackColor="#34A853"
              />
              <RgbSlider
                value={rgb.b}
                onChange={(b) => applyRgb({ ...rgb, b })}
                trackColor="#1A73E8"
              />
              <Text style={ptStyles.hexText}>{color}</Text>
            </View>
          )}
          <View style={ptStyles.footer}>
            <TouchableOpacity
              style={ptStyles.cancelBtn}
              activeOpacity={0.7}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={ptStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ptStyles.createBtn, { backgroundColor: color }]}
              activeOpacity={0.85}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={ptStyles.createText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ptStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
  },
  title: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: "#9CA3AF",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    marginBottom: 14,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: "#1D1D1D",
  },
  iconRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: {
    borderColor: "#1D1D1D",
    backgroundColor: "#F3F4F6",
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  customSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#1D1D1D",
  },
  customLabel: {
    flex: 1,
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
  rgbPanel: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sliderTrack: {
    flex: 1,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 11,
  },
  sliderThumb: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    borderWidth: 2,
    marginLeft: -9,
  },
  sliderValue: {
    width: 32,
    textAlign: "right",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#374151",
  },
  hexText: {
    textAlign: "center",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  cancelText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
  createBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  createText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
    color: "#fff",
  },
});

// ─── Conversation Menu Popover (header three-dot) ─────────────────────────────

type RoomMenuAnchor = { x: number; y: number; width: number; height: number };

function RoomMenuPopover({
  visible,
  anchor,
  isMuted,
  canDelete,
  canLeave,
  canClear,
  isChannel,
  onClose,
  onToggleMute,
  onMarkUnread,
  onDelete,
  onLeave,
  onClear,
}: {
  visible: boolean;
  anchor: RoomMenuAnchor | null;
  isMuted: boolean;
  canDelete: boolean;
  canLeave: boolean;
  canClear: boolean;
  isChannel: boolean;
  onClose: () => void;
  onToggleMute: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onClear: () => void;
}) {
  if (!visible || !anchor) return null;

  const { width: screenW } = Dimensions.get("window");
  const CARD_WIDTH = 224;
  const margin = 8;
  const right = Math.min(
    Math.max(screenW - (anchor.x + anchor.width), margin),
    screenW - CARD_WIDTH - margin,
  );
  const top = anchor.y + anchor.height + 6;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={roomMenuStyles.overlay} onPress={onClose}>
        <Pressable
          style={[roomMenuStyles.card, { top, right, width: CARD_WIDTH }]}
          onStartShouldSetResponder={() => true}
        >
          <TouchableOpacity
            style={roomMenuStyles.item}
            activeOpacity={0.65}
            onPress={onToggleMute}
          >
            <Ionicons
              name={isMuted ? "notifications" : "notifications-off-outline"}
              size={15}
              color="#6B7280"
            />
            <Text style={roomMenuStyles.itemText}>
              {isMuted ? "Unmute notifications" : "Mute notifications"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={roomMenuStyles.item}
            activeOpacity={0.65}
            onPress={onMarkUnread}
          >
            <Ionicons name="mail-unread-outline" size={15} color="#6B7280" />
            <Text style={roomMenuStyles.itemText}>Mark as unread</Text>
          </TouchableOpacity>

          {canClear && (
            <TouchableOpacity
              style={roomMenuStyles.item}
              activeOpacity={0.65}
              onPress={onClear}
            >
              <Ionicons name="trash-bin-outline" size={15} color="#6B7280" />
              <Text style={roomMenuStyles.itemText}>Clear chat history</Text>
            </TouchableOpacity>
          )}

          {canLeave && (
            <TouchableOpacity
              style={roomMenuStyles.item}
              activeOpacity={0.65}
              onPress={onLeave}
            >
              <Ionicons name="exit-outline" size={15} color="#EF4444" />
              <Text
                style={[roomMenuStyles.itemText, roomMenuStyles.itemTextDanger]}
              >
                Leave channel
              </Text>
            </TouchableOpacity>
          )}

          {canDelete && (
            <TouchableOpacity
              style={roomMenuStyles.item}
              activeOpacity={0.65}
              onPress={onDelete}
            >
              <Ionicons name="trash-outline" size={15} color="#EF4444" />
              <Text
                style={[roomMenuStyles.itemText, roomMenuStyles.itemTextDanger]}
              >
                {isChannel ? "Delete channel" : "Delete chat"}
              </Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const roomMenuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.18)",
  },
  card: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 38,
  },
  itemText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  itemTextDanger: {
    color: "#EF4444",
  },
});

// ─── Delete Chat confirm (custom, minimal) ────────────────────────────────────

function DeleteChatModal({
  visible,
  isChannel,
  title,
  message,
  confirmLabel = "Delete",
  onClose,
  onConfirm,
}: {
  visible: boolean;
  isChannel?: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!visible) return null;

  const resolvedTitle =
    title ?? (isChannel ? "Delete channel?" : "Delete chat?");
  const resolvedMessage =
    message ??
    (isChannel
      ? "This channel will be deleted for all its members. This can't be undone."
      : "This chat will be deleted from your list. The other person will still have it.");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={deleteChatStyles.overlay} onPress={onClose}>
        <Pressable
          style={deleteChatStyles.card}
          onStartShouldSetResponder={() => true}
        >
          <Text style={deleteChatStyles.title}>{resolvedTitle}</Text>
          <Text style={deleteChatStyles.message}>{resolvedMessage}</Text>
          <View style={deleteChatStyles.actions}>
            <TouchableOpacity
              style={[deleteChatStyles.btn, deleteChatStyles.cancelBtn]}
              activeOpacity={0.8}
              onPress={onClose}
            >
              <Text style={deleteChatStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[deleteChatStyles.btn, deleteChatStyles.deleteBtn]}
              activeOpacity={0.85}
              onPress={onConfirm}
            >
              <Text style={deleteChatStyles.deleteText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const deleteChatStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  title: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    textAlign: "center",
  },
  message: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
  },
  cancelBtn: {
    backgroundColor: "#F3F4F6",
  },
  cancelText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
  deleteBtn: {
    backgroundColor: "#EF4444",
  },
  deleteText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
    color: "#FFFFFF",
  },
});

// ─── Pinned Messages Modal ────────────────────────────────────────────────────

function PinnedMessagesModal({
  visible,
  messages,
  currentUserId,
  members,
  onClose,
  onJump,
  onUnpin,
}: {
  visible: boolean;
  messages: ChatMessage[];
  currentUserId: number;
  members?: RoomMember[];
  onClose: () => void;
  onJump: (message: ChatMessage) => void;
  onUnpin: (messageId: string) => void;
}) {
  if (!visible) return null;

  // Newest first — the most recent pin is the easiest to reach.
  const ordered = [...messages].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  const senderLabel = (msg: ChatMessage) => {
    if (isOwnMessage(msg, currentUserId)) return "You";
    if (msg.sender_name) return msg.sender_name;
    const member = members?.find((m) => m.id === msg.sender_id);
    return member
      ? `${member.first_name} ${member.last_name}`.trim() || "Unknown"
      : "Unknown";
  };

  const previewOf = (msg: ChatMessage) =>
    msg.text?.trim() ||
    (msg.attachments?.length
      ? `📎 ${msg.attachments.length} attachment${msg.attachments.length > 1 ? "s" : ""}`
      : "Message");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={pinnedModalStyles.overlay} onPress={onClose}>
        <Pressable
          style={pinnedModalStyles.card}
          onStartShouldSetResponder={() => true}
        >
          <View style={pinnedModalStyles.header}>
            <View style={pinnedModalStyles.headerIcon}>
              <Ionicons name="pin" size={16} color="#00DEAB" />
            </View>
            <Text style={pinnedModalStyles.headerTitle}>Pinned messages</Text>
            <Text style={pinnedModalStyles.headerCount}>{messages.length}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              style={pinnedModalStyles.closeBtn}
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={pinnedModalStyles.list}
            contentContainerStyle={pinnedModalStyles.listContent}
            showsVerticalScrollIndicator
          >
            {ordered.map((msg) => (
              <View
                key={String(msg._id ?? msg.id)}
                style={pinnedModalStyles.row}
              >
                <TouchableOpacity
                  style={pinnedModalStyles.rowMain}
                  activeOpacity={0.7}
                  onPress={() => onJump(msg)}
                >
                  <Text style={pinnedModalStyles.rowSender} numberOfLines={1}>
                    {senderLabel(msg)}
                    <Text style={pinnedModalStyles.rowTime}>
                      {"  ·  "}
                      {formatMessageTime(msg.createdAt)}
                    </Text>
                  </Text>
                  <Text style={pinnedModalStyles.rowText} numberOfLines={2}>
                    {previewOf(msg)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={pinnedModalStyles.unpinBtn}
                  activeOpacity={0.7}
                  onPress={() => onUnpin(String(msg._id ?? msg.id))}
                >
                  <Ionicons name="pin" size={15} color="#EF4444" />
                  <Text style={pinnedModalStyles.unpinText}>Unpin</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const pinnedModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    maxHeight: "78%",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: rf(15),
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
  },
  headerCount: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#00DEAB",
    backgroundColor: "#E6FBF5",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
    marginRight: 6,
  },
  closeBtn: {
    padding: 2,
  },
  list: {
    maxHeight: 460,
  },
  listContent: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  rowMain: {
    flex: 1,
    paddingRight: 8,
  },
  rowSender: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 2,
  },
  rowTime: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },
  rowText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#4B5563",
    lineHeight: 18,
  },
  unpinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
  },
  unpinText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: "#EF4444",
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
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "85%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  ownBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#E7FCF7",
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: "#00DEAB",
    marginBottom: 2,
  },
  bubbleText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    lineHeight: 18,
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

// Inline list items: a message, or a static date divider that stays attached to
// the messages of its day while scrolling (WhatsApp-style).
type MessageListItem =
  | { type: "message"; message: ChatMessage; showTime: boolean }
  | { type: "divider"; label: string; key: string };

// Stable viewability config for the message list (must not change identity).
const CHAT_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1 };

export default function ConversationScreen() {
  const params = useLocalSearchParams<{
    roomId?: string;
    targetId?: string;
    name?: string;
    initials?: string;
    isChannel?: string;
    roomType?: string;
  }>();
  const name = params.name ?? "Chat";
  const initials = params.initials ?? "C";
  const isChannel = params.isChannel === "true";
  const roomId = params.roomId;
  const targetId = params.targetId;

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
    removeMember,
    updatePermission,
    fetchRoomPermissions,
    fetchRooms,
    getOrCreateRoom,
    roomPermissions,
    roomCreator,
    setSearchQuery,
    fetchPinnedMessages,
    setCurrentRoom,
    initSocket,
    markRead,
    muteRoom,
    markUnread,
    deleteRoom,
    hideRoom,
    leaveRoom,
    clearMessages,
    createPostType,
    deletePostType,
  } = useChat();
  const { typingUsers } = useChatPresence();
  const authState = useAuth();
  const currentUserId = authState?.state?.user?.id ?? 0;
  const currentUser = authState?.state?.user ?? null;
  const currentUserName = authState?.state?.user
    ? `${authState.state.user.first_name} ${authState.state.user.last_name}`.trim() ||
      `User #${currentUserId}`
    : `User #${currentUserId}`;

  // Register this open conversation with the navigation guard so re-taps on
  // the same chat row / notification / toast cannot stack a duplicate copy of
  // this screen. Cleared on unmount, allowing the room to be opened again.
  useEffect(() => {
    markConversationOpen(roomId);
    return () => markConversationClosed(roomId);
  }, [roomId]);

  // "New Chat" can open this screen with only a peer id (no room yet) so the
  // navigation is instant. Resolve/create the 1:1 room here and swap the id
  // into the route; the room-dependent effects then run as usual. The screen
  // is already visible (header from the route params) while this is in flight.
  useEffect(() => {
    if (roomId || !targetId) return;
    let cancelled = false;
    getOrCreateRoom({ type: "direct", targetId: Number(targetId) })
      .then((room) => {
        if (!cancelled && room?._id) {
          router.setParams({ roomId: room._id });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [roomId, targetId, getOrCreateRoom]);

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

  // "View Only" members may read but not use any message actions (react, reply,
  // pin, forward, edit, delete, copy) — the website hides them entirely.
  const canUseMessageActions = useMemo(() => {
    if (!isChannel) return true;
    if (!callerPermission) return true;
    return canPerformAction(callerPermission, "comment");
  }, [isChannel, callerPermission]);

  // Edit (and "delete for everyone") are limited to your OWN messages within
  // 1 hour (website §2.6). Delegates to the shared helper so the same rule is
  // applied by the API-layer delete guard in ChatContext.
  const isWithinEditWindow = useCallback(
    (msg: ChatMessage): boolean => isWithinMessageActionWindow(msg),
    [],
  );

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
  const composerRef = useRef<TextInput>(null);
  // Optimistic quoted-reply previews keyed by sent-message id, so the quote is
  // visible immediately even if the send response omits the parent reference.
  const localReplyPreviewRef = useRef<
    Map<string, { senderName: string; text: string }>
  >(new Map());
  // Persisted map of reply-message id → original (quoted) message id. The
  // backend returns `parent_id` as an object without an id, so this lets a
  // reply you sent keep pointing at its target even after reloading the chat.
  const [replyTargetIds, setReplyTargetIds] = useState<Record<string, string>>(
    {},
  );
  const persistReplyTargets = useCallback(
    (map: Record<string, string>, uid: number) => {
      if (!uid) return;
      AsyncStorage.setItem(
        `planit_reply_targets_${uid}`,
        JSON.stringify(map),
      ).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    let cancelled = false;
    const uid = currentUserId;
    (async () => {
      if (!uid) {
        if (!cancelled) setReplyTargetIds({});
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(`planit_reply_targets_${uid}`);
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const clean: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") clean[k] = v;
          }
          setReplyTargetIds(clean);
        }
      } catch {
        // ignore malformed cache
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);
  const [postTypeOpen, setPostTypeOpen] = useState(false);
  // Post type selected for the NEXT outgoing message (composer), and the post
  // type currently filtering the message timeline (header "Post Type" panel).
  const [selectedPostType, setSelectedPostType] = useState<string | null>(null);
  const [filterPostType, setFilterPostType] = useState<string | null>(null);
  const [postTypeCreateOpen, setPostTypeCreateOpen] = useState(false);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  // Users selected in AddPeopleModal (pre-fills the invite modal's email field
  // and backs the "add as member directly" logic once permissions are chosen).
  const [pendingInviteUsers, setPendingInviteUsers] = useState<
    Array<{ id: string; name: string; email?: string }>
  >([]);
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [deleteModalMsg, setDeleteModalMsg] = useState<ChatMessage | null>(
    null,
  );
  // Member whose permission is being edited from the "Chat members" panel,
  // plus the screen position of the tapped edit icon to anchor the popover.
  const [permissionSheetMember, setPermissionSheetMember] = useState<{
    id: number;
    name: string;
    permission: ChannelPermission;
    anchor: { x: number; y: number };
  } | null>(null);

  // Member targeted by the custom "Remove member" confirmation modal.
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // ── @-mention picker ───────────────────────────────────────────────────
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<number[]>([]);
  // Attachment composer: holds the picked files until the user taps Send.
  // `id` forces a fresh mount (and a clean caption/edit state) per selection.
  const [composer, setComposer] = useState<{
    id: string;
    files: ComposerFile[];
  } | null>(null);

  // Send Attachment files helper. `caption` (the composer's text) becomes the
  // message text; without one we fall back to the attachment marker text.
  const sendAttachments = useCallback(
    async (
      files: { uri: string; name: string; type: string }[],
      caption?: string,
    ) => {
      if (!roomId || files.length === 0) return;
      setSending(true);
      try {
        // `sendMessage` adds an optimistic bubble up-front, so the attachment
        // appears immediately with the pending loader on the ticks and flips to
        // the sent ticks on success — exactly like a text message. There is no
        // separate upload progress bar any more.
        const trimmed = caption?.trim() ?? "";
        await sendMessage({
          room_id: roomId,
          text: trimmed
            ? trimmed
            : files.length === 1
              ? `📎 ${files[0].name}`
              : `📎 ${files.length} attachments`,
          ...(selectedPostType ? { postType: selectedPostType } : {}),
          attachments: files,
        });
        setSelectedPostType(null);
      } catch (err) {
        console.log("[Attachment] Send error:", err);
        showError("Upload Error", "Failed to upload attachments.");
      } finally {
        setSending(false);
      }
    },
    [roomId, sendMessage, selectedPostType],
  );

  // The composer's Send: close it and upload the (possibly edited) files.
  const handleComposerSend = useCallback(
    (files: ComposerFile[], caption: string) => {
      setComposer(null);
      sendAttachments(
        files.map((f) => ({ uri: f.uri, name: f.name, type: f.type })),
        caption,
      );
    },
    [sendAttachments],
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
        const kind: "image" | "video" =
          asset.type === "video" || asset.type === "pairedVideo"
            ? "video"
            : "image";
        const fileName =
          asset.fileName ||
          `camera_${Date.now()}.${kind === "video" ? "mp4" : "jpg"}`;
        const fileType =
          asset.mimeType ||
          (kind === "video" ? "video/mp4" : "image/jpeg");
        // Show the preview composer instead of sending immediately.
        setComposer({
          id: `composer-${Date.now()}`,
          files: [
            {
              uri: asset.uri,
              name: fileName,
              type: fileType,
              kind,
              width: asset.width,
              height: asset.height,
              size: asset.fileSize,
            },
          ],
        });
      }
    } catch (err) {
      console.log("[Attachment] Camera error:", err);
      showError("Error", "Could not capture image from camera.");
    }
  }, [roomId]);

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
        const files: ComposerFile[] = result.assets.map((asset, idx) => {
          const kind: "image" | "video" =
            asset.type === "video" || asset.type === "pairedVideo"
              ? "video"
              : "image";
          return {
            uri: asset.uri,
            name:
              asset.fileName ||
              `photo_${Date.now()}_${idx}.${kind === "video" ? "mp4" : "jpg"}`,
            type:
              asset.mimeType ||
              (kind === "video" ? "video/mp4" : "image/jpeg"),
            kind,
            width: asset.width,
            height: asset.height,
            size: asset.fileSize,
          };
        });
        // Show the preview composer instead of sending immediately.
        setComposer({ id: `composer-${Date.now()}`, files });
      }
    } catch (err) {
      console.log("[Attachment] Gallery error:", err);
      showError("Error", "Could not pick image from gallery.");
    }
  }, [roomId]);

  const handlePickDocument = useCallback(async () => {
    if (!roomId) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const files: ComposerFile[] = result.assets.map((doc, idx) => ({
          uri: doc.uri,
          name: doc.name || `doc_${Date.now()}_${idx}`,
          type: doc.mimeType || "application/octet-stream",
          size: doc.size,
          kind: "document",
        }));
        // Show the document composer instead of sending immediately.
        setComposer({ id: `composer-${Date.now()}`, files });
      }
    } catch (err) {
      console.log("[Attachment] Document error:", err);
      showError("Error", "Could not pick document.");
    }
  }, [roomId]);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  // Three-dot conversation menu (mute / mark unread / delete chat), shown as a
  // small popover anchored to the header button.
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [deleteChatConfirmOpen, setDeleteChatConfirmOpen] = useState(false);
  const [leaveChannelConfirmOpen, setLeaveChannelConfirmOpen] = useState(false);
  const [roomMenuAnchor, setRoomMenuAnchor] = useState<RoomMenuAnchor | null>(
    null,
  );
  const roomMenuBtnRef = useRef<View>(null);
  const openRoomMenu = useCallback(() => {
    const node = roomMenuBtnRef.current;
    const openAtFallback = () => {
      const { width: sw } = Dimensions.get("window");
      setRoomMenuAnchor({ x: sw - 56, y: 56, width: 40, height: 40 });
      setRoomMenuOpen(true);
    };
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, width, height) => {
        setRoomMenuAnchor({ x, y, width, height });
        setRoomMenuOpen(true);
      });
    } else {
      openAtFallback();
    }
  }, []);

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
  // Latest recording length, readable from the send callback without making it
  // depend on every recorder-state tick.
  const recorderDurationRef = useRef(0);
  useEffect(() => {
    recorderDurationRef.current = recorderState.durationMillis;
  }, [recorderState.durationMillis]);

  const [dateFilterStart, setDateFilterStart] = useState<Date | null>(null);
  const [dateFilterEnd, setDateFilterEnd] = useState<Date | null>(null);

  // Scroll-to-bottom FAB — the list is inverted, so offset 0 is the
  // newest message; show the button (and count new incoming messages) once the
  // user has scrolled away from it, without yanking them back down.
  // The state is scoped to a room id so switching rooms derives a clean slate
  // (no reset effect / cascading render needed).
  const AT_BOTTOM_THRESHOLD = 60;
  const [scrollUi, setScrollUi] = useState<{
    roomId?: string;
    show: boolean;
    count: number;
  }>({ roomId, show: false, count: 0 });
  const showScrollToBottom = scrollUi.roomId === roomId && scrollUi.show;
  const newMessageCount = scrollUi.roomId === roomId ? scrollUi.count : 0;
  const atBottomRef = useRef(true);
  const newestMessageIdRef = useRef<string | null>(null);
  const trackedRoomRef = useRef(roomId);
  const lastShowButtonRef = useRef(false);

  // ── Temporary top date label (scrolling only) ──────────────────────────
  // A floating label showing the date of the messages currently in view. It is
  // shown while the user scrolls up (toward older messages) and hidden shortly
  // after scrolling stops — the static inline dividers are never touched.
  //
  // It is additionally gated on static-divider visibility: while a date divider
  // is still on screen it already labels its own section, so the floating label
  // is suppressed. This prevents showing "Yesterday" while the permanent
  // "Today" separator is still visible. The gate uses real viewability from the
  // list's onViewableItemsChanged — not a delay or hardcoded offset.
  const [scrollDateLabel, setScrollDateLabel] = useState<string | null>(null);
  const topVisibleDateRef = useRef<string | null>(null);
  const visibleDividerRef = useRef(false);
  const scrollDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollYRef = useRef(0);

  const hideScrollDateLabel = useCallback(() => {
    if (scrollDateTimerRef.current) {
      clearTimeout(scrollDateTimerRef.current);
      scrollDateTimerRef.current = null;
    }
    setScrollDateLabel(null);
  }, []);

  useEffect(
    () => () => {
      if (scrollDateTimerRef.current) clearTimeout(scrollDateTimerRef.current);
    },
    [],
  );

  const handleMessagesScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;

      // Floating date label: display while scrolling up (older messages), then
      // hide ~0.9s after the last scroll event. Never float a date while its
      // own static separator is still visible — the inline divider already
      // labels that section, so a newer floating label would contradict it.
      const scrollingUp = y > lastScrollYRef.current + 1;
      lastScrollYRef.current = y;
      if (scrollingUp) {
        const label = visibleDividerRef.current
          ? null
          : topVisibleDateRef.current;
        setScrollDateLabel((prev) => (prev === label ? prev : label));
      }
      if (scrollDateTimerRef.current) clearTimeout(scrollDateTimerRef.current);
      scrollDateTimerRef.current = setTimeout(() => {
        scrollDateTimerRef.current = null;
        setScrollDateLabel(null);
      }, 900);

      const atBottom = y <= AT_BOTTOM_THRESHOLD;
      atBottomRef.current = atBottom;
      const nextShow = !atBottom;
      // Only set state when the button visibility actually flips — avoids a
      // state update on every scroll frame.
      if (nextShow === lastShowButtonRef.current) return;
      lastShowButtonRef.current = nextShow;
      setScrollUi((prev) => {
        if (prev.roomId !== roomId) return { roomId, show: nextShow, count: 0 };
        return { ...prev, show: nextShow, count: nextShow ? prev.count : 0 };
      });
    },
    [roomId],
  );
  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
    atBottomRef.current = true;
    lastShowButtonRef.current = false;
    setScrollUi({ roomId, show: false, count: 0 });
    // Dismiss the floating date label immediately rather than leaving it to
    // its scroll-driven 900ms auto-hide timer — jumping straight to the
    // bottom via this button isn't a scroll-up gesture, so that timer never
    // gets refreshed and the last (now stale) date lingers on screen while
    // the list animates back down to today's messages.
    if (scrollDateTimerRef.current) {
      clearTimeout(scrollDateTimerRef.current);
      scrollDateTimerRef.current = null;
    }
    setScrollDateLabel(null);
  }, [roomId]);

  // Auto-scroll when the user is already at the bottom; otherwise count the
  // newly-arrived incoming messages so the scroll-down button can badge them.
  useEffect(() => {
    const msgs = state.messages;
    const newest = msgs[msgs.length - 1];
    const newestId = newest ? String(newest._id ?? newest.id) : null;

    // Switching rooms: start tracking fresh from the newest loaded message.
    if (trackedRoomRef.current !== roomId) {
      trackedRoomRef.current = roomId;
      newestMessageIdRef.current = null;
      atBottomRef.current = true;
      lastShowButtonRef.current = false;
      localReplyPreviewRef.current.clear();
    }

    if (newestMessageIdRef.current === null) {
      newestMessageIdRef.current = newestId;
      atBottomRef.current = true;
      return;
    }
    if (!newestId || newestId === newestMessageIdRef.current) return;

    const prevId = newestMessageIdRef.current;
    const prevIdx = msgs.findIndex(
      (m) => String(m._id ?? m.id) === prevId,
    );
    const arrived = prevIdx >= 0 ? msgs.slice(prevIdx + 1) : [newest];
    newestMessageIdRef.current = newestId;

    if (atBottomRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
      setScrollUi((prev) =>
        prev.roomId === roomId ? { ...prev, count: 0 } : prev,
      );
    } else {
      const incoming = arrived.filter(
        (m) => String(m.sender_id) !== String(currentUserId),
      ).length;
      if (incoming > 0) {
        setScrollUi((prev) =>
          prev.roomId === roomId
            ? { ...prev, show: true, count: prev.count + incoming }
            : { roomId, show: true, count: incoming },
        );
      }
    }
  }, [state.messages, currentUserId, roomId]);

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
    // Capture the length BEFORE stopping (the recorder state resets on stop)
    // so it can be tagged on the message for a WhatsApp-style duration.
    const recordedSeconds = Math.max(
      1,
      Math.round(recorderDurationRef.current / 1000),
    );
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
      const name = buildVoiceNoteFileName(
        recordedSeconds,
        isWeb ? "webm" : "m4a",
      );
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

      // The optimistic bubble appears immediately with the pending spinner on
      // the ticks and flips to the sent ticks on success — same as text.
      // ChatContext always uploads attachments over XHR internally.
      await sendMessage({
        room_id: roomId,
        text: buildVoiceNoteText(recordedSeconds),
        attachments: [{ uri, name, type }],
      });
    } catch (err) {
      console.log("[Audio] Send voice note error:", err);
      showError("Error", "Failed to send voice note");
    } finally {
      setSending(false);
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

  // ── Pinned messages ─────────────────────────────────────────────────
  // Multiple messages can be pinned. They stay in their chronological place
  // in the timeline; the "Pinned" filter card opens a modal listing them all.
  const pinnedMessages = state.pinnedMessages;
  const [pinnedModalOpen, setPinnedModalOpen] = useState(false);
  // Jump-to-message request: while set, the effect below paginates until the
  // message is loaded, then scrolls to and briefly highlights it.
  const [pendingJumpId, setPendingJumpId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const jumpAttemptsRef = useRef(0);
  const jumpHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Scroll to (and briefly highlight) a message by id — used by the Pinned
  // list and by tapping a quoted reply. It clears any active search/filters
  // and paginates older pages until the target is loaded.
  const handleJumpToMessageId = useCallback((messageId: string) => {
    if (!messageId) return;
    setPinnedModalOpen(false);
    setSearch("");
    setActiveFilter(null);
    setDateFilterStart(null);
    setDateFilterEnd(null);
    jumpAttemptsRef.current = 0;
    setPendingJumpId(messageId);
  }, []);

  const handleJumpToMessage = useCallback(
    (msg: ChatMessage) => {
      handleJumpToMessageId(String(msg._id ?? msg.id));
    },
    [handleJumpToMessageId],
  );

  // Highlight the jumped-to message once, for a sustained WhatsApp-style
  // moment, then clear it. Re-invoking for the same message while it is already
  // lit simply extends the highlight (no second flash), so the behavior is
  // identical in 1:1 chats and channels.
  const blinkMessage = useCallback((messageId: string) => {
    if (!messageId) return;
    if (jumpHighlightTimerRef.current) {
      clearTimeout(jumpHighlightTimerRef.current);
      jumpHighlightTimerRef.current = null;
    }
    setHighlightedMessageId(messageId);
    jumpHighlightTimerRef.current = setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === messageId ? null : current,
      );
      jumpHighlightTimerRef.current = null;
    }, JUMP_HIGHLIGHT_MS);
  }, []);

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
        .then(() => {
          socketService.joinChatRoom(roomId);
          // Chained onto the same connect promise (not a separate effect)
          // so this doesn't race the socket's own async connection — firing
          // it independently silently dropped the read receipt whenever the
          // socket wasn't connected yet (cold start, deep link/push-opened
          // conversation), since every socketService emit* no-ops if
          // `!socket?.connected` and nothing here ever retried it.
          if (currentUserId) {
            socketService.emitMessagesRead(roomId, currentUserId);
          }
        })
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
    currentUserId,
    fetchMessages,
    fetchPostTypes,
    fetchRoomPermissions,
    fetchPinnedMessages,
  ]);

  // Mark the room read only while it is genuinely on-screen and foregrounded
  // (B3): on returning focus to this chat, and when the app comes back to the
  // foreground with this chat still open. Covers messages that arrived while
  // the app was backgrounded. `markRead` short-circuits already-read rooms.
  useFocusEffect(
    useCallback(() => {
      if (!roomId || !currentUserId) return;
      const markReadAndAck = () => {
        markRead(roomId).catch(() => {});
        // Chain on connect so a resume before the socket is up (cold start,
        // reconnect) doesn't silently drop the read acknowledgement.
        socketService
          .connectSocket()
          .then(() => socketService.emitMessagesRead(roomId, currentUserId))
          .catch(() => {});
      };
      // Re-run on refocus (navigating back to this screen).
      markReadAndAck();
      const subscription = AppState.addEventListener("change", (nextState) => {
        if (nextState === "active") markReadAndAck();
      });
      return () => subscription.remove();
    }, [roomId, currentUserId, markRead]),
  );

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
    const replyTarget = replyTo;
    setMessage("");
    setMentionedUserIds([]);
    setMentionActive(false);
    setMentionQuery("");
    setSending(true);
    setReplyTo(null);

    try {
      console.log("[Conv] Sending message:", { roomId, text });
      const sent = await sendMessage({
        room_id: roomId,
        text,
        ...(mentions.length > 0 ? { mentions } : {}),
        ...(selectedPostType ? { postType: selectedPostType } : {}),
        // Reply target must be the Mongo ObjectId (`_id`), never the numeric
        // `id` — the backend 500s on a numeric reply reference.
        parent_id: replyTarget?._id,
      });
      // The post type is applied per message; reset it after a successful send.
      setSelectedPostType(null);
      // Cache the quoted preview against the sent message id so it renders
      // even if the response doesn't echo `parent_id`.
      if (replyTarget && sent) {
        const targetMember = state.rooms
          .find((r) => r._id === roomId || r.id.toString() === roomId)
          ?.members?.find((m) => m.id === replyTarget.sender_id);
        const preview = {
          senderName: isOwnMessage(replyTarget, currentUserId)
            ? "You"
            : replyTarget.sender_name ||
              (targetMember
                ? `${targetMember.first_name} ${targetMember.last_name}`
                : ""),
          text: getReplyPreviewText(replyTarget),
        };
        if (sent._id) localReplyPreviewRef.current.set(String(sent._id), preview);
        if (sent.id != null)
          localReplyPreviewRef.current.set(String(sent.id), preview);
        // Persist the quoted target id so this reply stays tappable later.
        const targetId = replyTarget._id;
        if (targetId) {
          setReplyTargetIds((prev) => {
            const next = { ...prev };
            if (sent._id) next[String(sent._id)] = String(targetId);
            if (sent.id != null) next[String(sent.id)] = String(targetId);
            persistReplyTargets(next, currentUserId);
            return next;
          });
        }
      }
      console.log("[Conv] Message sent successfully");
      setTimeout(() => {
        scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);
    } catch (err) {
      console.log("[Conv] Send message error:", err);
      setMessage(text);
      setMentionedUserIds(mentions);
      setReplyTo(replyTarget);
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
    state.rooms,
    selectedPostType,
    persistReplyTargets,
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
    (users: { id: string; name: string; email?: string }[]) => {
      if (!roomId || users.length === 0) return;
      // Step 1 complete: users selected in AddPeopleModal. Defer the invite
      // until the user picks a permission in InviteToChannelModal (matches
      // the channel-create flow in chat.tsx).
      setAddPeopleOpen(false);
      setPendingInviteUsers(users);
      setTimeout(() => setInviteModalVisible(true), 300);
    },
    [roomId],
  );

  // Step 2: confirm invitations + the chosen permission for the current room.
  const handleInviteUsersConfirm = useCallback(
    async (emails: string[], permission: ChannelPermission) => {
      if (!roomId) return;

      // Final email list comes from the modal's Email Address field, which was
      // pre-filled with the selected members' emails (and is editable).
      const finalEmails = Array.from(
        new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
      );
      const emailSet = new Set(finalEmails);

      // Map known member emails → user ids so email invitations include the
      // selected member's userId (matches the POST /chat/invite contract).
      const userIdByEmail = new Map<string, number>();
      for (const user of pendingInviteUsers) {
        const memberEmail = (user.email ?? "").trim().toLowerCase();
        if (memberEmail) {
          userIdByEmail.set(memberEmail, parseInt(user.id, 10));
        }
      }

      let emailSent = 0;
      let directAdded = 0;
      let failed = 0;

      // Selected members NOT covered by the final email list are added directly
      // as members with the chosen permission instead — avoids double invites.
      for (const user of pendingInviteUsers) {
        const userId = parseInt(user.id, 10);
        if (isNaN(userId)) continue;
        const userEmail = (user.email ?? "").trim().toLowerCase();
        if (userEmail && emailSet.has(userEmail)) continue;
        try {
          await addMember(roomId, userId);
          await updatePermission(roomId, userId, permission).catch(() => {});
          directAdded++;
        } catch {
          failed++;
        }
      }

      // Send exactly one invitation per final email address.
      for (const email of finalEmails) {
        try {
          await chatService.inviteUser({
            roomId,
            email,
            userId: userIdByEmail.get(email),
            permission,
          });
          emailSent++;
        } catch {
          failed++;
        }
      }

      fetchRoomPermissions(roomId).catch(() => {});
      setInviteModalVisible(false);
      setPendingInviteUsers([]);

      const parts: string[] = [];
      if (emailSent > 0) parts.push(`${emailSent} invite(s) sent`);
      if (directAdded > 0) parts.push(`${directAdded} member(s) added`);
      if (failed > 0) parts.push(`${failed} failed`);
      if (parts.length > 0) showSuccess("Members Added", parts.join(", "));
    },
    [
      roomId,
      pendingInviteUsers,
      addMember,
      updatePermission,
      fetchRoomPermissions,
    ],
  );

  const handleGenerateInviteLink = useCallback(
    async (
      permission: ChannelPermission,
      forAllUsers: boolean,
    ): Promise<string | null> => {
      if (!roomId) return null;
      try {
        const allowedUserIds = forAllUsers
          ? []
          : pendingInviteUsers
              .map((u) => parseInt(u.id, 10))
              .filter((id) => !isNaN(id));
        const res = await chatService.generateLink({
          roomId,
          permission,
          allowedUserIds,
        });
        return (res as any)?.data?.inviteLink ?? (res as any)?.inviteLink ?? null;
      } catch (err) {
        console.error("[Conversation] generateLink error:", err);
        return null;
      }
    },
    [roomId, pendingInviteUsers],
  );

  const handleUpdateChannelMemberPermission = useCallback(
    async (memberId: number, permission: ChannelPermission) => {
      if (!roomId) return;
      // Use the ChatContext action (it also patches local room permissions).
      await updatePermission(roomId, memberId, permission);
    },
    [roomId, updatePermission],
  );

  // Apply a permission chosen from the member permission sheet.
  const handleSelectMemberPermission = useCallback(
    async (permission: ChannelPermission) => {
      const member = permissionSheetMember;
      setPermissionSheetMember(null);
      if (!member || !roomId) return;
      try {
        await handleUpdateChannelMemberPermission(member.id, permission);
        fetchRoomPermissions(roomId).catch(() => {});
        showSuccess("Permission updated", `${member.name}: ${permission}`);
      } catch {
        showError("Error", "Could not update permission");
      }
    },
    [
      permissionSheetMember,
      roomId,
      handleUpdateChannelMemberPermission,
      fetchRoomPermissions,
    ],
  );

  // Remove a member from the channel (owner / managers only). Opens the custom
  // confirmation modal; the actual removal happens in `confirmRemoveMember`.
  const handleRemoveChannelMember = useCallback(
    (memberId: number, name: string) => {
      if (!roomId) return;
      setRemoveMemberTarget({ id: memberId, name });
    },
    [roomId],
  );

  const confirmRemoveMember = async () => {
    const target = removeMemberTarget;
    if (!roomId || !target) return;
    setRemoveMemberTarget(null);
    try {
      await removeMember(roomId, target.id);
      showSuccess("Removed", `${target.name} was removed from the channel`);
    } catch {
      showError("Error", "Could not remove member");
    }
  };

  // Create a channel post type (Full edit / Edit only — website §2.3).
  const handleCreatePostType = useCallback(
    async (name: string, color: string, icon: string) => {
      if (!roomId || !canManagePostTypes) return;
      await createPostType(roomId, name, color, icon);
      showSuccess("Post type created", name);
    },
    [roomId, canManagePostTypes, createPostType],
  );

  // Delete a channel post type (Full edit / Edit only).
  const handleDeletePostType = useCallback(
    (name: string) => {
      if (!roomId || !canManagePostTypes) return;
      Alert.alert(
        "Delete post type",
        `Delete "${name}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deletePostType(roomId, name);
                if (filterPostType === name) setFilterPostType(null);
                if (selectedPostType === name) setSelectedPostType(null);
                showSuccess("Post type deleted", name);
              } catch {
                showError("Error", "Could not delete post type");
              }
            },
          },
        ],
      );
    },
    [
      roomId,
      canManagePostTypes,
      deletePostType,
      filterPostType,
      selectedPostType,
    ],
  );

  const handleEmojiReact = useCallback(
    async (msg: ChatMessage, emoji: string) => {
      if (!canReact) return;
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
    [toggleReaction, currentUserId, canReact],
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
      if (!canUseMessageActions) return;
      const isOwn = isOwnMessage(msg, currentUserId);
      const withinWindow = isWithinEditWindow(msg);
      Alert.alert("Message Options", "", [
        {
          text: "Copy Text",
          onPress: () => {
            Clipboard.setStringAsync(msg.text);
          },
        },
        ...(isOwn && withinWindow
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
            togglePin(msg._id, roomId).catch(() => {});
          },
        },
        // Delete is always offered for your OWN messages (within the window it
        // allows "for everyone", after it only "for me"); never for others'.
        ...(isOwn
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
    [
      currentUserId,
      canUseMessageActions,
      isWithinEditWindow,
      togglePin,
      roomId,
    ],
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
    if (!currentRoom) return;
    setCurrentRoom(currentRoom);
    // Read/seen synchronization for notification-opened chats. Tapping a chat
    // notification navigates straight here, bypassing the chat list's row-tap
    // `markRead` (chat.tsx) — the only caller of the REST read endpoint. The
    // socket `messagesRead` event emitted below updates message ticks but NOT
    // the room's `unreadCount`, which is what the chat list renders. Applying
    // the same `markRead` action clears both the server read state and the
    // local room unread badge while this room is the active one. Read rooms
    // short-circuit, so the normal row-tap flow is unaffected.
    if (isRoomUnread(currentRoom)) {
      markRead(currentRoom._id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoom?._id, currentRoom?.id, setCurrentRoom]);

  // ── Notification / deep-link entry initialization ─────────────────────────
  // The conversation screen can be the FIRST chat screen to mount — an OS push
  // tap, an in-app notification or a cold-start deep link opens it directly
  // without the Chat tab ever mounting. The normal flow registers the shared
  // chat socket listeners (receiveChatMessage → append + last_message preview)
  // and loads the room list from the Chat tab. Without that initialization,
  // `state.currentRoom` stays null (so the ADD_MESSAGE guard silently drops
  // every new message) and the chat-list preview never advances past whatever
  // stale snapshot was loaded. Mirror the normal flow here. `initSocket` is
  // idempotent, so this is a no-op when the Chat tab already did it.
  useEffect(() => {
    if (!currentUserId) return;
    initSocket(currentUserId).catch(() => {});
  }, [currentUserId, initSocket]);

  // Ensure this room exists in the shared room store so `currentRoom` resolves
  // and `setCurrentRoom` runs (the ADD_MESSAGE guard requires an active room).
  // The Chat tab loads rooms on mount; a notification-opened chat can arrive
  // before any room list exists.
  useEffect(() => {
    if (!roomId || currentRoom) return;
    fetchRooms({ silent: true }).catch(() => {});
  }, [roomId, currentRoom, fetchRooms]);

  // Pull the latest room membership when a channel conversation opens, so a
  // member who already left/was removed elsewhere disappears here even if no
  // socket event reached this client.
  useEffect(() => {
    if (isChannel) {
      fetchRooms({ silent: true }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChannel, roomId]);

  // Refresh again whenever the "Chat members" panel is opened.
  useEffect(() => {
    if (isChannel && activeFilter === "chat_member") {
      fetchRooms({ silent: true }).catch(() => {});
    }
  }, [isChannel, activeFilter, fetchRooms]);

  // Channel creator (from room permissions) or fallback to the room payload.
  const roomOwnerId = roomCreator ?? currentRoom?.created_by ?? null;
  const isRoomOwner =
    roomOwnerId !== null && currentUserId === roomOwnerId;
  // Channels may only be deleted by their creator. 1:1 chats require the
  // `chat-delete` permission (website Sidebar §1.18.5).
  const canDeleteChat = isChannel
    ? isRoomOwner
    : canDeleteDirectChat(currentUser);
  // The channel creator always manages members; other members need the
  // permission-management right.
  const canModerateMembers =
    isChannel && (isRoomOwner || canManageMembers);
  // Any channel member may leave; 1:1 chats are hidden/deleted instead.
  const canLeaveChannel = isChannel && !isRoomOwner;
  // Clearing history is limited to the creator / Full edit (owner is Full edit).
  const canClearHistory = isChannel && (isRoomOwner || canManageMembers);

  useEffect(() => {
    return () => {
      setCurrentRoom(null);
    };
  }, [setCurrentRoom]);

  // Toggle push notifications for this room via the server `is_muted` flag
  // (POST /chat/mute-room). Muted rooms skip push + in-app toasts.
  const handleToggleMute = async () => {
    setRoomMenuOpen(false);
    if (!roomId) return;
    try {
      const muted = await muteRoom(roomId);
      if (muted) {
        showInfo("Notifications muted", "You won't get notified for this conversation");
      } else {
        showInfo("Notifications on", "You'll get notified for this conversation");
      }
    } catch {
      showError("Error", "Could not update notification settings");
    }
  };

  // Mark the conversation unread and return to the list so the badge is
  // immediately visible (WhatsApp behaviour). No message is touched.
  const handleMarkUnread = async () => {
    if (!roomId) return;
    setRoomMenuOpen(false);
    try {
      await markUnread(roomId);
      router.back();
    } catch {
      showError("Error", "Could not mark chat as unread");
    }
  };

  // Delete the conversation. Channels: creator only, removes it for everyone.
  // 1:1 chats: removes it for this user only (reappears on a new reply).
  const handleDeleteChat = () => {
    if (!roomId || !canDeleteChat) return;
    setRoomMenuOpen(false);
    setDeleteChatConfirmOpen(true);
  };

  const confirmDeleteChat = async () => {
    if (!roomId) return;
    setDeleteChatConfirmOpen(false);
    try {
      if (isChannel) {
        await deleteRoom(roomId);
      } else {
        await hideRoom(roomId);
      }
      router.back();
    } catch {
      showError("Error", "Could not delete chat");
    }
  };

  // Leave a channel. Any member may leave (website §2.4 self-remove). The room
  // is removed for this user; the creator must delete it instead.
  const handleLeaveChannel = () => {
    if (!roomId || !canLeaveChannel) return;
    setRoomMenuOpen(false);
    setLeaveChannelConfirmOpen(true);
  };

  const confirmLeaveChannel = async () => {
    if (!roomId) return;
    setLeaveChannelConfirmOpen(false);
    try {
      await leaveRoom(roomId);
      router.back();
    } catch {
      showError("Error", "Could not leave channel");
    }
  };

  // Clear the channel's message history for everyone. Creator / Full edit only.
  const handleClearHistory = () => {
    if (!roomId || !canClearHistory) return;
    setRoomMenuOpen(false);
    Alert.alert(
      "Clear chat history",
      "Clear all messages in this channel for everyone? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearMessages(roomId);
              showSuccess("Chat history cleared");
            } catch {
              showError("Error", "Could not clear chat history");
            }
          },
        },
      ],
    );
  };

  // ── @-mention candidates (derived from the room's member list) ─────────
  const roomMembers = useMemo(
    () => (currentRoom?.members ?? []).filter((m) => m.id !== currentUserId),
    [currentRoom, currentUserId],
  );

  // Channel owner (creator) shown in InviteToChannelModal's "Who has access".
  const inviteModalMembers = useMemo<ChannelMember[]>(
    () =>
      (currentRoom?.members ?? []).map((m) => ({
        id: m.id,
        name: `${m.first_name || ""} ${m.last_name || ""}`.trim() || `User #${m.id}`,
        isOwner: m.id === (roomCreator ?? currentRoom?.created_by),
      })),
    [currentRoom, roomCreator],
  );

  // "Chat members" panel source. Driven by the room's actual member list (the
  // authoritative source); each member's permission is joined by userId. A
  // stale permission entry for someone who already left is ignored because they
  // are no longer in `currentRoom.members` — so a departed member can never be
  // displayed, counted, or given edit/remove actions.
  const memberPanelList = useMemo<
    {
      id: number;
      name: string;
      image?: string;
      permission: ChannelPermission;
      isOwner: boolean;
      isSelf: boolean;
    }[]
  >(() => {
    const permMap = new Map<number, string>();
    for (const p of state.roomPermissions) {
      permMap.set(Number(p.userId), p.permission);
    }
    return (currentRoom?.members ?? []).map((m) => ({
      id: m.id,
      name:
        `${m.first_name || ""} ${m.last_name || ""}`.trim() || `User #${m.id}`,
      image: m.image,
      permission: (permMap.get(Number(m.id)) ?? "Comment") as ChannelPermission,
      isOwner: roomOwnerId !== null && m.id === roomOwnerId,
      isSelf: m.id === currentUserId,
    }));
  }, [currentRoom, state.roomPermissions, roomOwnerId, currentUserId]);

  // People who can be added to this channel. With no query, the default list is
  // built from every user we already know across rooms (backend search needs
  // ≥2 chars); once the user types, the API search results are used instead.
  // Always excludes the current user and members already in this room.
  const inviteCandidates = useMemo(() => {
    const existing = new Set(
      (currentRoom?.members ?? []).map((m) => String(m.id)),
    );
    const map = new Map<
      string,
      { id: string; name: string; email?: string }
    >();
    const push = (id: string, name: string, email?: string) => {
      const key = String(id);
      if (!key || key === String(currentUserId)) return;
      if (existing.has(key)) return;
      if (!name.trim()) return;
      if (!map.has(key)) map.set(key, { id: key, name: name.trim(), email });
    };

    if (state.searchQuery.trim().length >= 2) {
      for (const u of state.searchResults ?? []) {
        push(
          String(u.id),
          u.full_name || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
          u.email,
        );
      }
    } else {
      for (const room of state.rooms ?? []) {
        for (const m of room.members ?? []) {
          push(
            String(m.id),
            `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
            m.email,
          );
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [
    currentRoom?.members,
    currentUserId,
    state.searchQuery,
    state.searchResults,
    state.rooms,
  ]);

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

  // Full-screen image viewer (swipe through a message's images).
  const [viewerImages, setViewerImages] = useState<MessageAttachment[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const openImageViewer = useCallback(
    (images: MessageAttachment[], index: number) => {
      if (!images || images.length === 0) return;
      setViewerImages(images);
      setViewerIndex(Math.max(0, Math.min(index, images.length - 1)));
      setViewerVisible(true);
    },
    [],
  );

  const closeImageViewer = useCallback(() => setViewerVisible(false), []);

  // In-app video viewer (play a video attachment without opening a URL). The
  // filename is kept alongside the URL so the viewer can offer "save to device".
  const [videoViewer, setVideoViewer] = useState<{
    url: string;
    name?: string;
  } | null>(null);
  const openVideoViewer = useCallback((url: string, name?: string) => {
    if (url) setVideoViewer({ url, name });
  }, []);
  const closeVideoViewer = useCallback(() => setVideoViewer(null), []);

  const handleLongPress = useCallback(
    (msg: ChatMessage, e?: GestureResponderEvent) => {
      // View Only members get no message actions (website §2.6).
      if (!canUseMessageActions) return;
      triggerHaptic("medium");
      const y = e?.nativeEvent?.pageY ?? Dimensions.get("window").height / 2;
      setSelectedMsgForModal({ message: msg, targetY: y });
    },
    [canUseMessageActions],
  );

  // Save every attachment on a message to the device (photo, video, document,
  // audio). Each one goes through the authenticated secure-file download and
  // the OS share/save sheet — so a multi-attachment message prompts once per
  // file, letting the user choose where each is stored.
  const handleDownloadMessage = useCallback(async (msg: ChatMessage) => {
    const attachments = msg.attachments ?? [];
    if (attachments.length === 0) return;
    try {
      for (const att of attachments) {
        await downloadChatAttachment(att.url, decodeAttachmentName(att.name));
      }
    } catch {
      showError("Error", "Could not download attachment");
    }
  }, []);

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

  // text → message id, only for texts that are unique in the loaded history.
  // Used to recover the quoted target when the backend's `parent_id` payload
  // carries no id.
  const uniqueTextToMessageId = useMemo(() => {
    const counts = new Map<string, number>();
    const first = new Map<string, string>();
    for (const m of state.messages) {
      const t = m.text;
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
      if (!first.has(t)) first.set(t, String(m._id));
    }
    for (const [t, c] of counts) {
      if (c > 1) first.delete(t);
    }
    return first;
  }, [state.messages]);

  const renderItem = useCallback(
    ({ item, index }: { item: MessageListItem; index: number }) => {
      if (item.type === "divider") {
        return <DateDivider label={item.label} />;
      }

      const message = item.message;

      // Resolve the quoted reply preview. The backend may embed the parent as
      // an object (`{ sender_name, text }`) or reference it by ObjectId, and
      // may expose it as `parent_id` or `reply_to`.
      const parentRef = (message.parent_id ??
        (message as { reply_to?: unknown }).reply_to) as
        | string
        | { sender_name?: string; text?: string; attachments?: unknown[] }
        | null;

      // Resolve the quoted target id, in order of reliability:
      //   1. an explicit id in the payload (string, or an id field on the object)
      //   2. the id persisted when this reply was sent
      //   3. a unique loaded message with the same text
      const keyA = String(message._id ?? "");
      const keyB = message.id != null ? String(message.id) : "";
      const persistedTargetId =
        (keyA && replyTargetIds[keyA]) ||
        (keyB && replyTargetIds[keyB]) ||
        undefined;
      const explicitParentId =
        typeof parentRef === "string"
          ? parentRef
          : parentRef && typeof parentRef === "object"
            ? extractParentId(parentRef)
            : undefined;

      let repliedPreview: {
        senderName: string;
        text: string;
        targetId?: string;
      } | null = null;
      if (parentRef && typeof parentRef === "object") {
        const p = parentRef as {
          sender_name?: string;
          text?: string;
          attachments?: { url?: string | null; name?: string | null; type?: string | null }[];
        };
        const previewText = getReplyPreviewText(p);
        repliedPreview = {
          senderName: p.sender_name || "Message",
          text: previewText,
          targetId:
            explicitParentId ||
            persistedTargetId ||
            (previewText ? uniqueTextToMessageId.get(previewText) : undefined),
        };
      } else if (typeof parentRef === "string") {
        const found = messageById.get(parentRef);
        if (found) {
          const member = currentRoom?.members?.find(
            (m) => m.id === found.sender_id,
          );
          repliedPreview = {
            senderName: isOwnMessage(found, currentUserId)
              ? "You"
              : found.sender_name ||
                (member ? `${member.first_name} ${member.last_name}` : ""),
            text: getReplyPreviewText(found),
            targetId: parentRef,
          };
        } else {
          // Not loaded yet — still tappable so we can paginate to it.
          repliedPreview = { senderName: "Message", text: "", targetId: parentRef };
        }
      }

      // Fall back to an optimistic preview captured when the reply was sent.
      if (!repliedPreview) {
        const cached =
          localReplyPreviewRef.current.get(keyA) ??
          localReplyPreviewRef.current.get(keyB) ??
          null;
        if (cached) {
          repliedPreview = {
            ...cached,
            targetId:
              persistedTargetId ||
              (cached.text ? uniqueTextToMessageId.get(cached.text) : undefined),
          };
        }
      }

      return (
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: index === 0 ? 6 : 10,
          }}
        >
          <SwipeToReply
            enabled={canUseMessageActions}
            onReply={() => {
              setReplyTo(message);
              setTimeout(() => composerRef.current?.focus(), 60);
            }}
          >
            <MessageBubble
              message={message}
              currentUserId={currentUserId}
              members={currentRoom?.members}
              showSenderName={isChannel}
              repliedPreview={repliedPreview}
              highlighted={highlightedMessageId === (message._id as string)}
              showTimestamp={item.showTime}
              onLongPress={handleLongPress}
              onReactionPress={handleReactEmoji}
              onOpenImage={openImageViewer}
              onOpenVideo={openVideoViewer}
              onPressReply={handleJumpToMessageId}
              postTypes={postTypes}
            />
          </SwipeToReply>
        </View>
      );
    },
    [
      currentUserId,
      currentRoom?.members,
      isChannel,
      messageById,
      uniqueTextToMessageId,
      replyTargetIds,
      highlightedMessageId,
      handleLongPress,
      handleReactEmoji,
      canUseMessageActions,
      openImageViewer,
      openVideoViewer,
      handleJumpToMessageId,
      postTypes,
    ],
  );

  // Filtered messages (chronological) after search + date filters.
  const filteredMessages = useMemo(() => {
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

    // Post-type filter from the header "Post Type" panel.
    if (filterPostType) {
      filtered = filtered.filter(
        (m) => getMessagePostType(m) === filterPostType,
      );
    }
    return filtered;
  }, [
    state.messages,
    search,
    dateFilterStart,
    dateFilterEnd,
    filterPostType,
  ]);

  // Build the list items with a static date divider before the first message of
  // each day (chronological), then reverse for the inverted list. Deliberately
  // NOT based on scroll position — dividers stay attached to their messages.
  const listItems = useMemo<MessageListItem[]>(() => {
    const items: MessageListItem[] = [];
    let lastDateKey: string | null = null;
    let prevTs: number | null = null;
    let prevSenderId: number | null = null;
    for (const m of filteredMessages) {
      const d = m.createdAt ? new Date(m.createdAt) : null;
      const valid = !!d && !isNaN(d.getTime());
      const dateKey = valid
        ? `${d!.getFullYear()}-${d!.getMonth()}-${d!.getDate()}`
        : "date-unknown";
      if (dateKey !== lastDateKey) {
        items.push({
          type: "divider",
          label: formatDateDivider(valid ? d : null),
          key: `divider-${dateKey}-${m._id ?? m.id ?? items.length}`,
        });
        lastDateKey = dateKey;
        // A new day always starts a new timestamp group.
        prevTs = null;
        prevSenderId = null;
      }
      const ts = valid ? d!.getTime() : null;
      // WhatsApp-style grouping: only the first message of a sender's
      // consecutive group carries the timestamp + avatar. A new group starts:
      //  - on a new day,
      //  - when the sender changes (e.g. the other person replies right after a
      //    burst, or you reply right after receiving one), so their first
      //    message always shows their initial/time,
      //  - or when more than 1 minute passed since the previous message.
      const senderChanged =
        prevSenderId === null || String(m.sender_id) !== String(prevSenderId);
      const showTime =
        prevTs === null || ts === null || senderChanged || ts - prevTs > 60000;
      items.push({ type: "message", message: m, showTime });
      prevTs = ts;
      prevSenderId = m.sender_id;
    }
    return items.reverse();
  }, [filteredMessages]);

  // Resolve a pending "jump to pinned message" request: scroll if already
  // loaded, otherwise keep paginating older messages until it appears (with a
  // safety cap so a missing message can't loop forever).
  useEffect(() => {
    if (!pendingJumpId) return;
    const index = listItems.findIndex(
      (it) =>
        it.type === "message" && String(it.message._id) === pendingJumpId,
    );
    if (index >= 0) {
      const targetId = pendingJumpId;
      requestAnimationFrame(() => {
        try {
          scrollRef.current?.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.5,
          });
        } catch {
          // onScrollToIndexFailed retries once the row is measured.
        }
        setPendingJumpId(null);
        blinkMessage(targetId);
      });
      return;
    }
    if (
      roomId &&
      state.hasMore &&
      !state.messagesLoading &&
      jumpAttemptsRef.current < 40
    ) {
      jumpAttemptsRef.current += 1;
      fetchMessages(roomId, state.messagePage + 1).catch(() => {});
    } else {
      requestAnimationFrame(() => {
        setPendingJumpId(null);
        showInfo(
          "Message unavailable",
          "It may have been deleted or is too old",
        );
      });
    }
  }, [
    pendingJumpId,
    listItems,
    state.hasMore,
    state.messagesLoading,
    state.messagePage,
    roomId,
    fetchMessages,
    blinkMessage,
  ]);

  // Clear any pending jump-highlight timer when leaving the screen.
  useEffect(() => {
    return () => {
      if (jumpHighlightTimerRef.current) {
        clearTimeout(jumpHighlightTimerRef.current);
      }
    };
  }, []);

  // Track the date of the topmost visible list item so the temporary scrolling
  // label can show the date of the messages currently being viewed. This never
  // affects the static inline dividers.
  const onViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: { index: number | null; item: MessageListItem }[];
    }) => {
      let topIndex = -1;
      let topLabel: string | null = null;
      let dividerVisible = false;
      for (const v of viewableItems) {
        if (v.index == null || !v.item) continue;
        if (v.item.type === "divider") {
          // A static separator that is still (even partially) on screen labels
          // its own section — the floating label must not override it.
          dividerVisible = true;
          continue;
        }
        const label = formatDateDivider(v.item.message.createdAt ?? null);
        // Skip items with no resolvable date (missing/invalid createdAt)
        // instead of letting them win on index alone — otherwise, once the
        // topmost visible item happens to be one of these, the label here
        // never updates again (stuck on whatever it last was), no matter how
        // far up the user keeps scrolling into older history.
        if (!label) continue;
        if (v.index > topIndex) {
          topIndex = v.index;
          topLabel = label;
        }
      }
      if (topLabel) topVisibleDateRef.current = topLabel;
      visibleDividerRef.current = dividerVisible;
      // The instant a separator scrolls back into view, drop the floating label
      // so the two can never display conflicting dates.
      if (dividerVisible) hideScrollDateLabel();
    },
    [hideScrollDateLabel],
  );

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
                  {/* Presence status (Active/Online/Offline) is intentionally
                      not shown in Chat. Channels still show their member count. */}
                  {isChannel && (
                    <Text style={styles.headerStatus}>
                      {`${memberPanelList.length} member${memberPanelList.length !== 1 ? "s" : ""}`}
                    </Text>
                  )}
                </View>
              </View>

              <TouchableOpacity
                hitSlop={8}
                style={styles.headerSearchBtn}
                onPress={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }}
              >
                <Ionicons name="search-outline" size={20} color="#1D1D1D" />
              </TouchableOpacity>

              <TouchableOpacity
                ref={roomMenuBtnRef}
                hitSlop={8}
                style={styles.headerIconBtn}
                onPress={openRoomMenu}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={20}
                  color="#1D1D1D"
                />
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
                {search.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearch("")}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
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
                activeFilter === "date" && styles.filterChipActive,
              ]}
              activeOpacity={0.75}
              onPress={() => toggleFilter("date")}
            >
              <Ionicons
                name="calendar-outline"
                size={11}
                color={activeFilter === "date" ? "#fff" : "#6B7280"}
              />
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === "date" && styles.filterChipTextActive,
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

            {/* Pinned card — only when this chat has at least one pinned
                message. Opens a modal; it does not filter the timeline. */}
            {pinnedMessages.length > 0 && (
              <TouchableOpacity
                style={styles.filterChip}
                activeOpacity={0.75}
                onPress={() => setPinnedModalOpen(true)}
              >
                <Ionicons name="pin" size={11} color="#6B7280" />
                <Text style={styles.filterChipText}>
                  Pinned{pinnedMessages.length > 1 ? ` ${pinnedMessages.length}` : ""}
                </Text>
              </TouchableOpacity>
            )}

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
                    (activeFilter === "post_type" || !!filterPostType) &&
                      styles.filterChipActive,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => toggleFilter("post_type")}
                >
                  <Ionicons
                    name="apps-outline"
                    size={11}
                    color={
                      activeFilter === "post_type" || !!filterPostType
                        ? "#fff"
                        : "#6B7280"
                    }
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      (activeFilter === "post_type" || !!filterPostType) &&
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
            <AttachmentsPanel
              messages={state.messages}
              onOpenImage={openImageViewer}
              onOpenVideo={openVideoViewer}
            />
          </View>
        )}
        {!searchOpen && activeFilter === "post_type" && isChannel && (
          <View style={styles.panelWrapper}>
            <View style={styles.postTypeListPanel}>
              {postTypes.map((pt: { name: string; color: string; icon?: string }) => {
                const isActive = filterPostType === pt.name;
                return (
                  <TouchableOpacity
                    key={pt.name}
                    style={[
                      styles.postTypeListRow,
                      { backgroundColor: pt.color + "15" },
                      isActive && {
                        borderWidth: 1.5,
                        borderColor: pt.color,
                      },
                    ]}
                    activeOpacity={0.75}
                    onPress={() =>
                      setFilterPostType((prev) =>
                        prev === pt.name ? null : pt.name,
                      )
                    }
                  >
                    <Ionicons
                      name={resolvePostTypeIcon(pt.icon)}
                      size={14}
                      color={pt.color}
                    />
                    <Text
                      style={[styles.postTypeListLabel, { color: pt.color }]}
                      numberOfLines={1}
                    >
                      {pt.name}
                    </Text>
                    {isActive && (
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color={pt.color}
                        style={{ marginLeft: "auto" }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
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
              {memberPanelList.map((member) => {
                const fullName = member.name;
                const isSelf = member.isSelf;
                const isOwner = member.isOwner;
                // Only the channel owner (or a manager) can remove members or
                // change their permission — and never for themselves / the owner.
                const showActions = canModerateMembers && !isSelf && !isOwner;
                return (
                  <View key={member.id} style={styles.memberRow}>
                    <Avatar
                      name={fullName}
                      imagePath={member.image}
                      size={32}
                      borderRadius={16}
                      fontSize={12}
                      fontFamily="SF_Pro_Semibold"
                      style={styles.memberAvatar}
                    />
                    <Text style={styles.memberName} numberOfLines={1}>
                      {fullName}
                    </Text>
                    <Text style={styles.memberPermissionText}>
                      {isOwner ? "Owner" : member.permission}
                    </Text>
                    {showActions && (
                      <View style={styles.memberActions}>
                        <TouchableOpacity
                          style={styles.memberActionBtn}
                          activeOpacity={0.7}
                          accessibilityLabel={`Edit ${fullName} permissions`}
                          onPress={(e) =>
                            setPermissionSheetMember({
                              id: member.id,
                              name: fullName,
                              permission: member.permission,
                              anchor: {
                                x: e.nativeEvent.pageX,
                                y: e.nativeEvent.pageY,
                              },
                            })
                          }
                        >
                          <Ionicons
                            name="create-outline"
                            size={18}
                            color="#374151"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.memberActionBtn}
                          activeOpacity={0.7}
                          accessibilityLabel={`Remove ${fullName} from channel`}
                          onPress={() =>
                            handleRemoveChannelMember(member.id, fullName)
                          }
                        >
                          <Ionicons
                            name="log-out-outline"
                            size={18}
                            color="#EF4444"
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
              {memberPanelList.length === 0 && (
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

              {/* Add people to this existing channel (owner / managers only).
                  Opens the same AddPeople → permission + invite-link flow used
                  when the channel was created. */}
              {canModerateMembers && (
                <TouchableOpacity
                  style={styles.memberAddRow}
                  activeOpacity={0.75}
                  onPress={() => setAddPeopleOpen(true)}
                >
                  <View style={styles.memberAddIcon}>
                    <Ionicons
                      name="person-add-outline"
                      size={15}
                      color="#00DEAB"
                    />
                  </View>
                  <Text style={styles.memberAddText}>Add people</Text>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Pinned messages are no longer surfaced at the top — they stay in
            the timeline and are listed via the "Pinned" filter card. */}

        {/* ── Scrollable content ── */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={styles.flex}>
          <FlatList
            ref={scrollRef}
            style={styles.scroll}
            inverted={true}
            data={listItems}
            keyExtractor={(item: MessageListItem, idx: number) =>
              item.type === "divider"
                ? item.key
                : String(item.message._id ?? item.message.id ?? `msg-${idx}`)
            }
            renderItem={renderItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            onScrollToIndexFailed={(info: {
              index: number;
              averageItemLength: number;
            }) => {
              // The target row isn't measured yet (variable heights) — retry
              // shortly so jumping from Pinned lands reliably.
              setTimeout(() => {
                try {
                  scrollRef.current?.scrollToIndex({
                    index: info.index,
                    animated: true,
                    viewPosition: 0.5,
                  });
                } catch {
                  // give up quietly; the user can scroll manually
                }
              }, 300);
            }}
            windowSize={11}
            maxToRenderPerBatch={15}
            updateCellsBatchingPeriod={30}
            initialNumToRender={25}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListHeaderComponent={
              search.trim() ? (
                <View style={styles.searchResultBadge}>
                  <Text style={styles.searchResultText}>
                    {filteredMessages.length} result
                    {filteredMessages.length !== 1 ? "s" : ""} found
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              <>
                {state.messagesLoading && state.messages.length > 0 && (
                  <View style={{ padding: 16, alignItems: "center" }}>
                    <ActivityIndicator size="small" color="#00DEAB" />
                  </View>
                )}
                {!state.hasMore && (
                  <View style={styles.workspaceContainer}>
                    <View style={styles.iconStack}>
                      {isChannel ? (
                        <Icons.ChannelTabIcon width={28} height={28} />
                      ) : (
                        <MainChatIcon style={{ width: 28, height: 28 }} />
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
              ) : search.trim() && filteredMessages.length === 0 ? (
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
                filteredMessages.length === 0 ? (
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
              ) : filteredMessages.length === 0 ? (
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
            onScroll={handleMessagesScroll}
            onScrollBeginDrag={() => Keyboard.dismiss()}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={CHAT_VIEWABILITY_CONFIG}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          />

          {/* Temporary top date label — visible only while scrolling up. */}
          {scrollDateLabel && (
            <View pointerEvents="none" style={styles.scrollDateWrap}>
              <View style={ddStyles.pill}>
                <Text style={ddStyles.text}>{scrollDateLabel}</Text>
              </View>
            </View>
          )}

          {showScrollToBottom && (
            <TouchableOpacity
              style={(styles as any).scrollToBottomBtn}
              activeOpacity={0.85}
              onPress={scrollToBottom}
            >
              <Ionicons name="chevron-down" size={16} color="#1D1D1D" />
              {newMessageCount > 0 && (
                <View style={styles.scrollToBottomBadge}>
                  <Text style={styles.scrollToBottomBadgeText}>
                    {newMessageCount > 99 ? "99+" : newMessageCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          </View>

          {/* ── Reply Preview ── */}
          {replyTo && (
            <View style={styles.replyPreview}>
              <View style={styles.replyPreviewBar} />
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replyPreviewName} numberOfLines={1}>
                  Replying to {replyTo.sender_name}
                </Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {getReplyPreviewText(replyTo)}
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
                        ref={composerRef}
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
                                numberOfLines={1}
                                style={[
                                  styles.postTypeToggleText,
                                  postTypeOpen &&
                                    styles.postTypeToggleTextActive,
                                ]}
                              >
                                {selectedPostType ?? "Post Type"}
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
                        <Ionicons
                          name={editingMsg ? "checkmark" : "paper-plane"}
                          size={16}
                          color="#fff"
                        />
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
                        {canManagePostTypes && (
                          <TouchableOpacity
                            style={[
                              styles.postTypeChip,
                              { backgroundColor: "#F3F4F6" },
                            ]}
                            activeOpacity={0.4}
                            onPress={() => setPostTypeCreateOpen(true)}
                          >
                            <Ionicons
                              name="add"
                              size={14}
                              color="#374151"
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={[
                                styles.postTypeChipText,
                                { color: "#374151" },
                              ]}
                            >
                              New
                            </Text>
                          </TouchableOpacity>
                        )}
                        {postTypes.map(
                          (pt: { name: string; color: string; icon?: string }) => {
                            const isSelected = selectedPostType === pt.name;
                            return (
                              <TouchableOpacity
                                key={pt.name}
                                style={[
                                  styles.postTypeChip,
                                  {
                                    backgroundColor: isSelected
                                      ? pt.color
                                      : pt.color + "15",
                                  },
                                ]}
                                activeOpacity={0.4}
                                onPress={() =>
                                  setSelectedPostType((prev) =>
                                    prev === pt.name ? null : pt.name,
                                  )
                                }
                                onLongPress={
                                  canManagePostTypes
                                    ? () => handleDeletePostType(pt.name)
                                    : undefined
                                }
                              >
                                <Ionicons
                                  name={resolvePostTypeIcon(pt.icon)}
                                  size={14}
                                  color={isSelected ? "#fff" : pt.color}
                                  style={{ marginRight: 4 }}
                                />
                                <Text
                                  style={[
                                    styles.postTypeChipText,
                                    { color: isSelected ? "#fff" : pt.color },
                                  ]}
                                >
                                  {pt.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          },
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
        users={inviteCandidates}
        isChannelMode={true}
        onClose={() => setAddPeopleOpen(false)}
        onSearch={(query) => setSearchQuery(query)}
        onInviteUsers={handleAddPeopleInvite}
      />

      {/* "Add people" in a channel/project conversation follows the same
          flow as the channel-create flow: select users in AddPeopleModal,
          then set permissions + send invites here. */}
      <InviteToChannelModal
        visible={inviteModalVisible}
        roomId={roomId ?? ""}
        members={inviteModalMembers}
        currentUserId={currentUserId}
        roomCreator={roomCreator}
        callerPermission={callerPermission}
        initialEmails={pendingInviteUsers
          .map((u) => u.email)
          .filter((e): e is string => !!e)}
        onClose={() => {
          setInviteModalVisible(false);
          setPendingInviteUsers([]);
        }}
        onInvite={handleInviteUsersConfirm}
        onGenerateLink={handleGenerateInviteLink}
        onUpdatePermission={handleUpdateChannelMemberPermission}
      />

      {/* ── WhatsApp Style Long-Press Message Modal ── */}
      <WhatsAppMessageModal
        visible={!!selectedMsgForModal}
        message={selectedMsgForModal?.message ?? null}
        targetY={selectedMsgForModal?.targetY}
        currentUserId={currentUserId}
        withinEditWindow={
          selectedMsgForModal?.message
            ? isWithinEditWindow(selectedMsgForModal.message)
            : false
        }
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
          const msg = selectedMsgForModal?.message;
          // Only real text messages can be copied (not voice notes / markers).
          if (
            msg?.text &&
            !isVoiceNoteText(msg.text) &&
            !msg.text.startsWith("📎 ")
          ) {
            Clipboard.setStringAsync(msg.text);
            showInfo("Copied", "Message text copied to clipboard");
          }
        }}
        onForward={() => {
          if (selectedMsgForModal?.message) {
            setForwardMsg(selectedMsgForModal.message);
            setForwardOpen(true);
          }
        }}
        onDownload={() => {
          if (selectedMsgForModal?.message) {
            handleDownloadMessage(selectedMsgForModal.message);
          }
        }}
        onPin={() => {
          if (selectedMsgForModal?.message) {
            togglePin(selectedMsgForModal.message._id, roomId).catch(() => {});
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
        withinEditWindow={
          deleteModalMsg ? isWithinEditWindow(deleteModalMsg) : false
        }
        onClose={() => setDeleteModalMsg(null)}
        onConfirmDelete={(deleteFor) => {
          if (!deleteModalMsg) return;
          // Safety net (mirrors the API guard in ChatContext): only your own
          // messages are deletable, and "everyone" only within the 1h window.
          if (!isOwnMessage(deleteModalMsg, currentUserId)) {
            showError("Error", "You can only delete your own messages");
            return;
          }
          const effectiveDeleteFor =
            deleteFor === "everyone" && !isWithinEditWindow(deleteModalMsg)
              ? "me"
              : deleteFor;
          const mId = deleteModalMsg._id;
          deleteMessage(mId, effectiveDeleteFor)
            .then(() => {
              showSuccess(
                effectiveDeleteFor === "everyone"
                  ? "Message deleted for everyone"
                  : "Message deleted for you",
              );
            })
            .catch((e) => {
              showError(
                "Error",
                e instanceof Error && e.message
                  ? e.message
                  : "Failed to delete message",
              );
            });
        }}
      />

      {/* ── Full-screen image viewer ── */}
      <ImageViewerModal
        visible={viewerVisible}
        images={viewerImages}
        index={viewerIndex}
        onClose={closeImageViewer}
        onChangeIndex={setViewerIndex}
      />

      {/* ── Full-screen in-app video player ── */}
      <VideoViewerModal
        visible={!!videoViewer}
        url={videoViewer?.url ?? null}
        name={videoViewer?.name}
        onClose={closeVideoViewer}
      />

      {/* ── WhatsApp-style attachment preview / composer (send on demand) ── */}
      {composer ? (
        <MediaComposerModal
          key={composer.id}
          files={composer.files}
          onSend={handleComposerSend}
          onCancel={() => setComposer(null)}
        />
      ) : null}

      {/* ── Member permission sheet (Chat members panel) ── */}
      <MemberPermissionSheet
        visible={!!permissionSheetMember}
        memberName={permissionSheetMember?.name}
        current={permissionSheetMember?.permission}
        anchor={permissionSheetMember?.anchor ?? null}
        onSelect={handleSelectMemberPermission}
        onClose={() => setPermissionSheetMember(null)}
      />

      {/* ── Create post type (Full edit / Edit) ── */}
      <PostTypeCreateModal
        visible={postTypeCreateOpen}
        onClose={() => setPostTypeCreateOpen(false)}
        onCreate={handleCreatePostType}
      />

      {/* ── Conversation Menu popover (header three-dot) ── */}
      <RoomMenuPopover
        visible={roomMenuOpen}
        anchor={roomMenuAnchor}
        isMuted={!!currentRoom?.is_muted}
        canDelete={canDeleteChat}
        canLeave={canLeaveChannel}
        canClear={canClearHistory}
        isChannel={isChannel}
        onClose={() => setRoomMenuOpen(false)}
        onToggleMute={handleToggleMute}
        onMarkUnread={handleMarkUnread}
        onDelete={handleDeleteChat}
        onLeave={handleLeaveChannel}
        onClear={handleClearHistory}
      />

      {/* ── Delete chat confirmation (custom) ── */}
      <DeleteChatModal
        visible={deleteChatConfirmOpen}
        isChannel={isChannel}
        onClose={() => setDeleteChatConfirmOpen(false)}
        onConfirm={confirmDeleteChat}
      />

      {/* ── Leave channel confirmation (custom) ── */}
      <DeleteChatModal
        visible={leaveChannelConfirmOpen}
        title="Leave channel?"
        message={`You'll be removed from "${
          currentRoom?.name ?? "this channel"
        }". You will need a new invite to rejoin.`}
        confirmLabel="Leave"
        onClose={() => setLeaveChannelConfirmOpen(false)}
        onConfirm={confirmLeaveChannel}
      />

      {/* ── Remove member confirmation (custom) ── */}
      <DeleteChatModal
        visible={!!removeMemberTarget}
        title="Remove member?"
        message={
          removeMemberTarget
            ? `Remove ${removeMemberTarget.name} from this channel? This can't be undone.`
            : ""
        }
        confirmLabel="Remove"
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={confirmRemoveMember}
      />

      {/* ── Pinned messages modal (opened from the Pinned filter card) ── */}
      <PinnedMessagesModal
        visible={pinnedModalOpen && pinnedMessages.length > 0}
        messages={pinnedMessages}
        currentUserId={currentUserId}
        members={currentRoom?.members}
        onClose={() => setPinnedModalOpen(false)}
        onJump={handleJumpToMessage}
        onUnpin={(messageId) => {
          togglePin(messageId, roomId).catch(() => {});
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
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    zIndex: 20,
  },
  scrollToBottomBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  scrollToBottomBadgeText: {
    color: "#fff",
    fontSize: rf(8.5),
    fontFamily: "SF_Pro_Semibold",
  },
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
  headerIconBtn: { marginLeft: 14 },
  headerSearchBtn: { marginLeft: 14 },
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
    fontSize: rf(9.5),
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
  // Inverted list: paddingTop renders at the visual bottom (above the composer)
  // and paddingBottom at the visual top.
  scrollContent: { paddingTop: 8, paddingBottom: 12 },

  // ── Empty State ──
  workspaceContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  iconStack: { marginBottom: 8 },
  workspaceTitle: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
    marginBottom: 4,
    textAlign: "center",
  },
  workspaceDescription: {
    fontSize: rf(9),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 13,
  },

  // ── Messages ──
  messagesContainer: {
    paddingHorizontal: 16,
    gap: 20,
    paddingTop: 8,
  },
  messageWrapper: { width: "100%" },
  // Blink frame applied to the bubble itself (not the whole row) when jumping
  // to a message from the Pinned list or a quoted reply.
  bubbleHighlight: {
    backgroundColor: "rgba(0, 222, 171, 0.35)",
  },
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
    gap: 8,
  },
  // Keeps grouped messages (no avatar) aligned under the group's first bubble.
  avatarSpacer: {
    width: 25,
  },
  incomingContent: {
    flex: 1,
    alignItems: "flex-start",
  },
  senderMeta: {
    fontSize: rf(9),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
    marginBottom: 2,
    textAlign: "left",
  },
  incomingBubble: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    borderTopLeftRadius: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: "90%",
    overflow: "hidden",
  },

  outgoingRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    gap: 8,
  },
  outgoingContent: {
    flex: 1,
    alignItems: "flex-end",
  },
  senderMetaOutgoing: {
    fontSize: rf(9),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
    marginBottom: 2,
    textAlign: "right",
  },
  outgoingBubble: {
    backgroundColor: "#E7FCF7",
    borderRadius: 12,
    borderTopRightRadius: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: "90%",
    overflow: "hidden",
  },

  bubbleText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_PRIMARY,
    lineHeight: 16,
  },
  linkText: {
    color: "#0A84FF",
    textDecorationLine: "underline",
  },
  forwardedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 3,
  },
  forwardedText: {
    fontSize: rf(10),
    fontFamily: "SF_Pro_Regular",
    fontStyle: "italic",
    color: "#6B7280",
  },
  quotedPreview: {
    borderLeftWidth: 3,
    borderLeftColor: "#00DEAB",
    backgroundColor: "rgba(0,222,171,0.08)",
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginBottom: 4,
    overflow: "hidden",
  },
  quotedSender: {
    fontSize: rf(10.5),
    fontFamily: "SF_Pro_Semibold",
    color: "#00A67E",
  },
  quotedText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    flexShrink: 1,
  },
  timeMeta: {
    fontSize: rf(8),
    fontFamily: "SF_Pro_Medium",
    color: TEXT_SECONDARY,
  },
  // Temporary floating date label shown while scrolling up (hidden on stop).
  scrollDateWrap: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 30,
  },

  // ── Pinned messages ──
  bubblePinnedIncoming: {
    backgroundColor: "#CCF3E6",
  },
  bubblePinnedOutgoing: {
    backgroundColor: "#D2F6EA",
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  addPeopleChannelText: {
    color: "#fff",
    fontFamily: "SF_Pro_Medium",
    fontSize: rf(9),
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
  // Small label shown inside a message bubble that carries a post type.
  postTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 4,
  },
  postTypeBadgeText: {
    fontSize: rf(10),
    fontFamily: "SF_Pro_Semibold",
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
  memberPermissionText: {
    fontSize: rf(11),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
    marginRight: 4,
  },
  memberActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  memberActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  memberAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    marginTop: 2,
  },
  memberAddIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAddText: {
    flex: 1,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
    color: "#00A67E",
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
  attGridWrap: {
    width: ATT_GRID_WIDTH,
    marginBottom: 2,
  },
  attGridRow: {
    flexDirection: "row",
    gap: ATT_GRID_GAP,
  },
  attGridCol: {
    gap: ATT_GRID_GAP,
  },
  attGridMore: {
    position: "absolute",
    top: 0,
    left: 0,
    width: ATT_CELL,
    height: ATT_CELL,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  attGridMoreText: {
    color: "#fff",
    fontSize: rf(20),
    fontFamily: "SF_Pro_Semibold",
  },
  // Full-screen image viewer
  viewerRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },
  viewerClose: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 24,
    right: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerDownload: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 24,
    left: 18,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerCounter: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 30,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  viewerCounterText: {
    color: "#fff",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
  },
  docAttachmentContainer: {
    marginBottom: 4,
    gap: 4,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    width: DOC_CARD_WIDTH,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 4,
  },
  docMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  docDownloadBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  docIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: rf(12.5),
    fontFamily: "SF_Pro_Medium",
    color: TEXT_PRIMARY,
  },
  docMeta: {
    marginTop: 2,
    fontSize: rf(10),
    fontFamily: "SF_Pro_Regular",
    color: TEXT_SECONDARY,
  },

  // ── Video attachments ──
  videoAttachmentContainer: {
    marginBottom: 4,
    gap: 4,
  },
  videoCard: {
    width: 220,
    height: 140,
    borderRadius: 10,
    backgroundColor: "#111827",
    overflow: "hidden",
  },
  videoCardBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  videoCardPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoCardText: {
    color: "#fff",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    maxWidth: "100%",
  },
  videoViewerRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
    justifyContent: "center",
  },
  videoViewerClose: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 24,
    right: 18,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoViewerDownload: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 24,
    left: 18,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoViewerPlayer: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
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
