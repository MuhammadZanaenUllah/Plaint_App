import AddPeopleModal from "@/components/AddPeopleModal";
import CalendarPicker from "@/components/CalendarPicker";
import Icons from "@/constants/icons";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { ChatMessage, Room, RoomMember, ChatPermission } from "@/types/chat.types";
import {
    canPerformAction,
    filterMessagesByText,
    formatMessageTime,
    getMessageInitials,
    isOwnMessage,
    resolveFileUrl
} from "@/utils/chatHelpers";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import EmojiPicker from "rn-emoji-keyboard";
import { showInfo, showError } from "@/utils/toast";
import * as socketService from "@/services/socket/socketService";

let ExpoAudio: typeof import("expo-audio") | null = null;
try {
    ExpoAudio = require("expo-audio");
} catch (e) {
    console.log("[Audio] expo-audio native module not available:", e);
}

const { ChatIcon: MainChatIcon } = Icons;

// ─── Voice Note Player Component ─────────────────────────────────────────────

function VoiceNotePlayer({ audioUrl }: { audioUrl: string }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const playerRef = useRef<any>(null);
    const resolvedUrl = useMemo(() => resolveFileUrl(audioUrl), [audioUrl]);

    const handlePlayPause = async () => {
        if (!ExpoAudio) {
            showInfo("Audio Unavailable", "Voice playback is unavailable in this environment.");
            return;
        }
        if (!resolvedUrl) {
            showError("Audio Error", "Audio URL is missing.");
            return;
        }
        try {
            const AudioModule = (ExpoAudio as any).AudioModule;
            try {
                await AudioModule.setAudioModeAsync({
                    allowsRecording: false,
                    playsInSilentMode: true,
                });
            } catch { }

            if (playerRef.current) {
                if (isPlaying) {
                    playerRef.current.pause();
                    setIsPlaying(false);
                } else {
                    playerRef.current.play();
                    setIsPlaying(true);
                }
            } else {
                const newPlayer = ExpoAudio.createAudioPlayer(resolvedUrl);
                playerRef.current = newPlayer;
                newPlayer.play();
                setIsPlaying(true);
                if (newPlayer.addListener) {
                    newPlayer.addListener("playbackStatusUpdate", (status: any) => {
                        if (status) {
                            if (typeof status.currentTime === "number") {
                                setPosition(status.currentTime * 1000);
                            }
                            if (typeof status.duration === "number") {
                                setDuration(status.duration * 1000);
                            }
                            if (status.didJustFinish || status.playbackState === "ended") {
                                setIsPlaying(false);
                                setPosition(0);
                            }
                        }
                    });
                }
            }
        } catch (err) {
            console.log("[Audio] Failed to play voice note:", err);
            showError("Playback Error", "Could not play audio note.");
            setIsPlaying(false);
        }
    };

    useEffect(() => {
        return () => {
            if (playerRef.current) {
                try {
                    playerRef.current.pause();
                    playerRef.current.remove?.();
                } catch { }
                playerRef.current = null;
            }
        };
    }, []);

    const progress = duration > 0 ? (position / duration) * 100 : 0;
    const posSec = Math.floor(position / 1000);
    const durSec = Math.floor(duration / 1000);

    return (
        <View style={vnStyles.container}>
            <TouchableOpacity onPress={handlePlayPause} style={vnStyles.playBtn} activeOpacity={0.8}>
                <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#fff" />
            </TouchableOpacity>
            <View style={vnStyles.trackContainer}>
                <View style={vnStyles.trackBg}>
                    <View style={[vnStyles.trackFill, { width: `${progress}%` }]} />
                </View>
                <Text style={vnStyles.timeText}>
                    {duration > 0
                        ? `${Math.floor(posSec / 60)}:${(posSec % 60).toString().padStart(2, "0")} / ${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, "0")}`
                        : isPlaying ? "Playing..." : "Voice note"}
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
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={attModalStyles.overlay} onPress={onClose}>
                <Pressable style={attModalStyles.container} onPress={(e) => e.stopPropagation()}>
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
                            <View style={[attModalStyles.iconCircle, { backgroundColor: "#ECFDF5" }]}>
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
                            <View style={[attModalStyles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
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
                            <View style={[attModalStyles.iconCircle, { backgroundColor: "#F5F3FF" }]}>
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
        fontSize: 16,
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
        fontSize: 12,
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
    trackBg: {
        height: 4,
        backgroundColor: "#D1D5DB",
        borderRadius: 2,
        overflow: "hidden",
    },
    trackFill: {
        height: "100%",
        backgroundColor: "#00DEAB",
    },
    timeText: {
        fontSize: 10,
        color: "#6B7280",
        fontFamily: "SF_Pro_Regular",
    },
});

// ─── Date Panel ───────────────────────────────────────────────────────────────

const DATE_RANGES = ["Today", "Last 7 days", "Last 30 days", "Last 90 days"];

function DateFilterPanel({ onFilterChange }: { onFilterChange: (start: Date | null, end: Date | null) => void }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [startDate, setStartDate] = useState<Date | null>(today);
    const [endDate, setEndDate] = useState<Date | null>(today);
    const [selectedRange, setSelectedRange] = useState<string | null>("Today");
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
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
                        <Text style={[dp.rangeText, selectedRange === r && dp.rangeTextActive]}>{r}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <View style={dp.calWrap}>
                <CalendarPicker
                    startDate={startDate}
                    endDate={endDate}
                    onSelectStart={handleSelectStart}
                    onSelectEnd={handleSelectEnd}
                    onDone={() => { }}
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
        fontSize: 11.5,
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

function AttachmentsPanel({ messages }: { messages: ChatMessage[] }) {
    const [activeTab, setActiveTab] = useState("Images");

    const imageAttachments = messages.flatMap((m) =>
        (m.attachments || []).filter((a) => {
            const ext = (a.name || a.url || "").split(".").pop()?.toLowerCase();
            return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
        })
    );

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
                                t === "Images" ? "image-outline" :
                                    t === "Videos" ? "videocam-outline" :
                                        t === "Docs" ? "document-text-outline" :
                                            "link-outline"
                            }
                            size={13}
                            color={activeTab === t ? "#1D1D1D" : "#9CA3AF"}
                            style={{ marginRight: 4 }}
                        />
                        <Text style={[ap.tabText, activeTab === t && ap.tabTextActive]}>{t}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            {activeTab === "Images" && (
                imageAttachments.length > 0 ? (
                    <View style={ap.imageGrid}>
                        {imageAttachments.map((item, index) => (
                            <Image
                                key={index}
                                source={{ uri: item.url }}
                                style={ap.imageThumb}
                            />
                        ))}
                    </View>
                ) : (
                    <View style={ap.emptyTab}>
                        <Text style={ap.emptyTabText}>No images found</Text>
                    </View>
                )
            )}
            {activeTab !== "Images" && (
                <View style={ap.emptyTab}>
                    <Text style={ap.emptyTabText}>No {activeTab.toLowerCase()} found</Text>
                </View>
            )}
        </View>
    );
}

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
        borderBottomColor: "#1D1D1D",
    },
    tabText: {
        fontSize: 12,
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
        paddingHorizontal: 1,
        paddingTop: 2,
    },
    imageThumb: {
        width: "25%",
        aspectRatio: 1,
        backgroundColor: "#1a1a2e",
        borderColor: "#fff",
    },
    emptyTab: {
        padding: 24,
        alignItems: "center",
    },
    emptyTabText: {
        fontSize: 13,
        color: "#9CA3AF",
        fontFamily: "SF_Pro_Regular",
    },
});

// ─── Date Divider Component ───────────────────────────────────────────────────

function formatDateDivider(dateInput?: Date | string | null, isChannel?: boolean): string {
    if (!dateInput) {
        return isChannel ? "Today's Discussion" : "Today's Chat";
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
        return isChannel ? "Today's Discussion" : "Today's Chat";
    }
    const now = new Date();
    if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    ) {
        return isChannel ? "Today's Discussion" : "Today's Chat";
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (
        d.getFullYear() === yesterday.getFullYear() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getDate() === yesterday.getDate()
    ) {
        return "Yesterday";
    }

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
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
                <Ionicons name="chevron-down" size={13} color="#6B7280" style={{ marginLeft: 3 }} />
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
        fontSize: 12,
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
    const icons: Array<{ name: React.ComponentProps<typeof Ionicons>["name"]; handler?: () => void }> = isOwn
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
    onLongPress,
    onReactionPress,
}: {
    message: ChatMessage;
    currentUserId: number;
    members?: RoomMember[];
    showSenderName?: boolean;
    onLongPress?: (msg: ChatMessage) => void;
    onReactionPress?: (emoji: string) => void;
}) {
    const own = isOwnMessage(message, currentUserId);
    const senderMember = members?.find((m) => m.id === message.sender_id);
    const senderName = message.sender_name || (senderMember ? `${senderMember.first_name} ${senderMember.last_name}` : "");
    const initials = getMessageInitials(senderName);
    const time = formatMessageTime(message.createdAt);

    const likedByMe = new Set(
        (message.reactions ?? []).filter((r) => r.users.includes(currentUserId)).map((r) => r.emoji)
    );

    const audioAtt = message.attachments?.find((a) => {
        const str = (a.url || a.name || "").toLowerCase();
        return str.includes(".m4a") || str.includes(".mp3") || str.includes(".wav") || str.includes(".caf") || str.includes("audio");
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
        const isAudio = str.includes(".m4a") || str.includes(".mp3") || str.includes(".wav") || str.includes(".caf") || str.includes("audio");
        const isImage = str.includes(".jpg") || str.includes(".jpeg") || str.includes(".png") || str.includes(".webp") || str.includes(".gif") || str.includes(".heic") || (a.type || "").startsWith("image/");
        return !isAudio && !isImage;
    });

    if (!own) {
        return (
            <View style={styles.messageWrapper}>
                <View style={styles.incomingRow}>
                    <View style={styles.incomingContent}>
                        <Text style={styles.senderMeta}>
                            {showSenderName ? `${senderName} ` : null}
                            <Text style={styles.timeMeta}>{showSenderName ? `| ${time}` : time}</Text>
                        </Text>
                        <Pressable
                            onLongPress={() => onLongPress?.(message)}
                            delayLongPress={250}
                            style={[styles.incomingBubble, message.is_pinned && styles.bubblePinnedIncoming]}
                        >
                            {audioAtt ? (
                                <VoiceNotePlayer audioUrl={audioAtt.url} />
                            ) : null}
                            {imageAtts && imageAtts.length > 0 ? (
                                <View style={styles.imageAttachmentContainer}>
                                    {imageAtts.map((att, i) => (
                                        <Image
                                            key={i}
                                            source={{ uri: resolveFileUrl(att.url) }}
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
                                            <Ionicons name="document-text" size={18} color="#00DEAB" />
                                            <Text style={styles.docName} numberOfLines={1}>{doc.name || "Document"}</Text>
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                            {message.text && message.text !== "🎤 Voice message" && !message.text.startsWith("📎 ") ? (
                                <Text style={styles.bubbleText}>{message.text}</Text>
                            ) : message.text && message.text.startsWith("📎 ") && !imageAtts?.length && !docAtts?.length && !audioAtt ? (
                                <Text style={styles.bubbleText}>{message.text}</Text>
                            ) : null}
                        </Pressable>
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
                                        style={[styles.reactionBadge, likedByMe.has(r.emoji) && styles.reactionBadgeActive]}
                                        onPress={() => onReactionPress?.(r.emoji)}
                                    >
                                        <Text style={[styles.reactionText, likedByMe.has(r.emoji) && styles.reactionTextActive]}>
                                            {r.emoji} {r.users.length}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.messageWrapper}>
            <View style={styles.outgoingRow}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.outgoingContent}>
                    <Text style={styles.senderMetaOutgoing}>
                        {showSenderName ? `${senderName} ` : null}
                        <Text style={styles.timeMeta}>{showSenderName ? `| ${time}` : time}</Text>
                    </Text>
                    <Pressable
                        onLongPress={() => onLongPress?.(message)}
                        delayLongPress={250}
                        style={[styles.outgoingBubble, message.is_pinned && styles.bubblePinnedOutgoing]}
                    >
                        {audioAtt ? (
                            <VoiceNotePlayer audioUrl={audioAtt.url} />
                        ) : null}
                        {imageAtts && imageAtts.length > 0 ? (
                            <View style={styles.imageAttachmentContainer}>
                                {imageAtts.map((att, i) => (
                                    <Image
                                        key={i}
                                        source={{ uri: resolveFileUrl(att.url) }}
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
                                        <Ionicons name="document-text" size={18} color="#00DEAB" />
                                        <Text style={styles.docName} numberOfLines={1}>{doc.name || "Document"}</Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                        {message.text && message.text !== "🎤 Voice message" && !message.text.startsWith("📎 ") ? (
                            <Text style={styles.bubbleText}>{message.text}</Text>
                        ) : message.text && message.text.startsWith("📎 ") && !imageAtts?.length && !docAtts?.length && !audioAtt ? (
                            <Text style={styles.bubbleText}>{message.text}</Text>
                        ) : null}
                    </Pressable>
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
                                    style={[styles.reactionBadge, likedByMe.has(r.emoji) && styles.reactionBadgeActive]}
                                    onPress={() => onReactionPress?.(r.emoji)}
                                >
                                    <Text style={[styles.reactionText, likedByMe.has(r.emoji) && styles.reactionTextActive]}>
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
});

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function WhatsAppMessageModal({
    visible,
    message,
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
    if (!visible || !message) return null;

    const own = isOwnMessage(message, currentUserId);
    const canEditOthers = canPerformAction(callerPermission, "edit");
    const canDeleteOthers = canPerformAction(callerPermission, "delete");
    const allowEdit = own || canEditOthers;
    const allowDelete = own || canDeleteOthers;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={waModalStyles.overlay} onPress={onClose}>
                <Pressable style={waModalStyles.container} onPress={() => {}}>
                    {/* Quick Emojis Bar */}
                    <View style={waModalStyles.emojiBar}>
                        {QUICK_EMOJIS.map((emoji) => (
                            <TouchableOpacity
                                key={emoji}
                                style={waModalStyles.emojiItem}
                                activeOpacity={0.7}
                                onPress={() => {
                                    onReactionSelect(emoji);
                                    onClose();
                                }}
                            >
                                <Text style={waModalStyles.emojiText}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={waModalStyles.emojiItemPlus}
                            activeOpacity={0.7}
                            onPress={() => {
                                onClose();
                                onOpenEmojiPicker();
                            }}
                        >
                            <Ionicons name="add" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    {/* Preview Message Box */}
                    <View style={waModalStyles.previewBox}>
                        <Text style={waModalStyles.previewSender}>
                            {message.sender_name || "User"}
                        </Text>
                        <Text style={waModalStyles.previewText} numberOfLines={3}>
                            {message.text || "Attachment"}
                        </Text>
                    </View>

                    {/* Action Items List */}
                    <View style={waModalStyles.menuCard}>
                        <TouchableOpacity
                            style={waModalStyles.menuItem}
                            onPress={() => { onClose(); onReply(); }}
                        >
                            <Ionicons name="arrow-undo-outline" size={18} color="#1D1D1D" style={waModalStyles.menuIcon} />
                            <Text style={waModalStyles.menuText}>Reply</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={waModalStyles.menuItem}
                            onPress={() => { onClose(); onCopy(); }}
                        >
                            <Ionicons name="copy-outline" size={18} color="#1D1D1D" style={waModalStyles.menuIcon} />
                            <Text style={waModalStyles.menuText}>Copy Text</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={waModalStyles.menuItem}
                            onPress={() => { onClose(); onForward(); }}
                        >
                            <Ionicons name="arrow-redo-outline" size={18} color="#1D1D1D" style={waModalStyles.menuIcon} />
                            <Text style={waModalStyles.menuText}>Forward</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={waModalStyles.menuItem}
                            onPress={() => { onClose(); onPin(); }}
                        >
                            <Ionicons name="pin-outline" size={18} color="#1D1D1D" style={waModalStyles.menuIcon} />
                            <Text style={waModalStyles.menuText}>
                                {message.is_pinned ? "Unpin Message" : "Pin Message"}
                            </Text>
                        </TouchableOpacity>

                        {allowEdit && (
                            <TouchableOpacity
                                style={waModalStyles.menuItem}
                                onPress={() => { onClose(); onEdit(); }}
                            >
                                <Ionicons name="pencil-outline" size={18} color="#1D1D1D" style={waModalStyles.menuIcon} />
                                <Text style={waModalStyles.menuText}>Edit Message</Text>
                            </TouchableOpacity>
                        )}

                        {allowDelete && (
                            <TouchableOpacity
                                style={[waModalStyles.menuItem, waModalStyles.menuItemLast]}
                                onPress={() => { onClose(); onDelete(); }}
                            >
                                <Ionicons name="trash-outline" size={18} color="#EF4444" style={waModalStyles.menuIcon} />
                                <Text style={[waModalStyles.menuText, waModalStyles.menuTextDelete]}>Delete Message</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const waModalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
    },
    container: {
        width: "100%",
        maxWidth: 320,
        gap: 12,
    },
    emojiBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        paddingHorizontal: 12,
        paddingVertical: 8,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    emojiItem: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    emojiText: {
        fontSize: 20,
    },
    emojiItemPlus: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#F3F4F6",
        alignItems: "center",
        justifyContent: "center",
    },
    previewBox: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 12,
        borderLeftWidth: 4,
        borderLeftColor: "#00DEAB",
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },
    previewSender: {
        fontSize: 12,
        fontFamily: "SF_Pro_Semibold",
        color: "#00DEAB",
        marginBottom: 2,
    },
    previewText: {
        fontSize: 13,
        fontFamily: "SF_Pro_Regular",
        color: "#1F2937",
    },
    menuCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
    },
    menuItemLast: {
        borderBottomWidth: 0,
    },
    menuIcon: {
        marginRight: 14,
    },
    menuText: {
        fontSize: 14,
        fontFamily: "SF_Pro_Medium",
        color: "#1F2937",
    },
    menuTextDelete: {
        color: "#EF4444",
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
        typingUsers,
        fetchPinnedMessages,
    } = useChat();
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
            (p) => p.userId === currentUserId
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

    // Upload progress
    const [uploadProgress, setUploadProgress] = useState<{ percentage: number; fileName: string } | null>(null);
    const abortUploadRef = useRef<{ abort: () => void } | null>(null);

    // Send Attachment files helper
    const sendAttachments = useCallback(
        async (files: Array<{ uri: string; name: string; type: string }>) => {
            if (!roomId || files.length === 0) return;
            setSending(true);
            setUploadProgress({ percentage: 0, fileName: files[0].name });
            try {
                await sendMessage({
                    room_id: roomId,
                    text: files.length === 1 ? `📎 ${files[0].name}` : `📎 ${files.length} attachments`,
                    attachments: files,
                    onUploadProgress: (prog) => {
                        setUploadProgress({ percentage: prog.percentage, fileName: files[0].name });
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
        [roomId, sendMessage]
    );

    const handlePickCamera = useCallback(async () => {
        if (!roomId) return;
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (perm.status !== "granted") {
                showInfo("Permission Required", "Camera permission is required to capture photos.");
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ["images", "videos"],
                quality: 0.8,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                const fileName = asset.fileName || `camera_${Date.now()}.${asset.type === "video" ? "mp4" : "jpg"}`;
                const fileType = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
                await sendAttachments([{ uri: asset.uri, name: fileName, type: fileType }]);
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
                showInfo("Permission Required", "Media library permission is required.");
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
                    name: asset.fileName || `photo_${Date.now()}_${idx}.${asset.type === "video" ? "mp4" : "jpg"}`,
                    type: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg"),
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
    const [selectedMsgForModal, setSelectedMsgForModal] = useState<ChatMessage | null>(null);

    // Emoji picker
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [emojiPickerMsg, setEmojiPickerMsg] = useState<ChatMessage | null>(null);

    // Voice recorder state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingInstance, setRecordingInstance] = useState<any>(null);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [firstVisibleDate, setFirstVisibleDate] = useState<Date | null>(null);
    const [dateFilterStart, setDateFilterStart] = useState<Date | null>(null);
    const [dateFilterEnd, setDateFilterEnd] = useState<Date | null>(null);

    const startRecording = useCallback(async () => {
        if (!ExpoAudio) {
            showInfo("Audio Unavailable", "Audio recording requires expo-audio module.");
            return;
        }
        try {
            const AudioModule = (ExpoAudio as any).AudioModule;
            const permission = await AudioModule.requestRecordingPermissionsAsync();
            if (!permission.granted) {
                showInfo("Permission Required", "Microphone access is required to record voice notes.");
                return;
            }
            await AudioModule.setAudioModeAsync({
                allowsRecording: true,
                playsInSilentMode: true,
            });
            const RecordingPresets = (ExpoAudio as any).RecordingPresets;
            const recorder = new AudioModule.AudioRecorder(
                RecordingPresets?.HIGH_QUALITY ?? {
                    android: { extension: ".m4a", outputFormat: "mpeg4", audioEncoder: "aac", sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 },
                    ios: { extension: ".m4a", outputFormat: "mpeg4aac", audioQuality: "high", sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
                    web: {},
                }
            );
            await recorder.prepareToRecordAsync();
            recorder.record();
            setRecordingInstance(recorder);
            setIsRecording(true);
            setRecordingDuration(0);

            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration((prev) => prev + 1);
            }, 1000);
        } catch (err) {
            console.log("[Audio] Start recording error:", err);
            showError("Error", "Could not start audio recording");
        }
    }, []);

    const stopAndSendRecording = useCallback(async () => {
        if (!recordingInstance || !roomId) return;
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        setSending(true);
        try {
            let stopRes: any = null;
            if (typeof recordingInstance.stop === "function") {
                stopRes = await recordingInstance.stop();
            }
            if (ExpoAudio) {
                const AudioModule = (ExpoAudio as any).AudioModule;
                try {
                    await AudioModule.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
                } catch { }
            }

            // expo-audio stores the URI on the recorder after stop()
            let rawUri: string | null =
                stopRes?.uri ||
                stopRes?.url ||
                recordingInstance.uri ||
                recordingInstance.url ||
                recordingInstance._uri ||
                (typeof recordingInstance.getURI === "function" ? recordingInstance.getURI() : null) ||
                null;

            // Android URIs from expo-audio sometimes lack file:// prefix
            if (rawUri && typeof rawUri === "string" && !rawUri.startsWith("file://") && !rawUri.startsWith("http") && !rawUri.startsWith("content://")) {
                rawUri = `file://${rawUri}`;
            }

            setRecordingInstance(null);
            setIsRecording(false);
            setRecordingDuration(0);

            console.log("[Audio] Recorded voice note URI:", rawUri);

            if (rawUri && typeof rawUri === "string" && rawUri.length > 0) {
                const fileName = `voice_${Date.now()}.m4a`;
                await sendMessage({
                    room_id: roomId,
                    text: "🎤 Voice message",
                    attachments: [
                        {
                            uri: rawUri,
                            name: fileName,
                            type: "audio/m4a",
                        },
                    ],
                });
            } else {
                showError("Recording Error", "Could not obtain voice recording URI. Please try again.");
            }
        } catch (err) {
            console.log("[Audio] Send voice note error:", err);
            showError("Error", "Failed to send voice note");
        } finally {
            setSending(false);
        }
    }, [recordingInstance, roomId, sendMessage]);

    const cancelRecording = useCallback(async () => {
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        if (recordingInstance) {
            try {
                await recordingInstance.stop();
                if (ExpoAudio) {
                    const AudioModule = (ExpoAudio as any).AudioModule;
                    await AudioModule.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
                }
            } catch { }
        }
        setRecordingInstance(null);
        setIsRecording(false);
        setRecordingDuration(0);
    }, [recordingInstance]);

    const formatRecordingTimer = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    // Forward
    const [forwardOpen, setForwardOpen] = useState(false);
    const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
    const [forwarding, setForwarding] = useState(false);

    // Edit
    const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
    const [editText, setEditText] = useState("");
    const [editing, setEditing] = useState(false);
    const editInputRef = useRef<TextInput>(null);

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
            socketService.connectSocket()
                .then(() => socketService.joinChatRoom(roomId))
                .catch(() => { });
            if (isChannel) {
                fetchPostTypes(roomId).catch(() => { });
                fetchRoomPermissions(roomId).catch(() => { });
            }
            fetchPinnedMessages(roomId).catch(() => { });
        }
    }, [roomId, isChannel, fetchMessages, fetchPostTypes, fetchRoomPermissions, fetchPinnedMessages]);

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
            if (!roomId || !currentUserId || !canSendMessage) return;
            if (text.trim().length > 0) {
                socketService.startTypingWithTimeout(roomId, currentUserId, currentUserName);
            } else {
                socketService.emitStopTyping(roomId, currentUserId, currentUserName);
            }
        },
        [roomId, currentUserId, canSendMessage, currentUserName]
    );

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

        socketService.emitStopTyping(roomId, currentUserId, currentUserName);
        const text = message.trim();
        setMessage("");
        setSending(true);
        setReplyTo(null);

        try {
            console.log("[Conv] Sending message:", { roomId, text });
            await sendMessage({
                room_id: roomId,
                text,
                parent_id: replyTo?.id.toString(),
            });
            console.log("[Conv] Message sent successfully");
        } catch (err) {
            console.log("[Conv] Send message error:", err);
            setMessage(text);
        } finally {
            setSending(false);
        }
    }, [message, roomId, sending, replyTo, sendMessage, currentUserId, currentUserName]);

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
        [roomId, toggleReaction, canReact]
    );

    const handleReactEmoji = useCallback(
        async (msg: ChatMessage, emoji: string) => {
            if (!canReact) return;
            if (!roomId) return;
            const existingUserReaction = (msg.reactions ?? []).find(
                (r) => r.users && r.users.includes(currentUserId)
            );
            try {
                if (existingUserReaction && existingUserReaction.emoji !== emoji) {
                    await toggleReaction(msg._id, existingUserReaction.emoji);
                }
                await toggleReaction(msg._id, emoji);
            } catch {
                // Silent fail
            }
        },
        [roomId, toggleReaction, canReact, currentUserId]
    );

    const handleAddPeopleInvite = useCallback(
        async (users: Array<{ id: string; name: string }>) => {
            setAddPeopleOpen(false);
            if (!roomId) return;
            for (const user of users) {
                try {
                    await addMember(roomId, parseInt(user.id, 10));
                } catch {
                    // Continue with next user
                }
            }
        },
        [roomId, addMember]
    );

    const handleEmojiReact = useCallback(
        async (msg: ChatMessage, emoji: string) => {
            setEmojiPickerOpen(false);
            setEmojiPickerMsg(null);
            const existingUserReaction = (msg.reactions ?? []).find(
                (r) => r.users && r.users.includes(currentUserId)
            );
            try {
                if (existingUserReaction && existingUserReaction.emoji !== emoji) {
                    await toggleReaction(msg._id, existingUserReaction.emoji);
                }
                await toggleReaction(msg._id, emoji);
            } catch { }
        },
        [toggleReaction, currentUserId]
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
        [forwardMsg, sendMessage]
    );

    const handleEdit = useCallback(async () => {
        if (!editingMsg || !editText.trim()) return;
        setEditing(true);
        try {
            await editMessage({
                messageId: editingMsg._id,
                text: editText.trim(),
            });
            setEditingMsg(null);
            setEditText("");
        } catch {
            showError("Error", "Failed to edit message");
        } finally {
            setEditing(false);
        }
    }, [editingMsg, editText, editMessage]);

    const handleMore = useCallback(
        (msg: ChatMessage) => {
            const isOwn = isOwnMessage(msg, currentUserId);
            const canEditOthers = canPerformAction(callerPermission, "edit");
            const canDeleteOthers = canPerformAction(callerPermission, "delete");
            Alert.alert("Message Options", "", [
                { text: "Copy Text", onPress: () => { Clipboard.setStringAsync(msg.text); } },
                ...(isOwn || canEditOthers ? [{ text: "Edit", onPress: () => { setEditingMsg(msg); setEditText(msg.text); } }] : []),
                { text: msg.is_pinned ? "Unpin" : "Pin", onPress: () => { togglePin(msg._id).catch(() => { }); } },
                ...(isOwn || canDeleteOthers ? [{
                    text: "Delete", style: "destructive" as const, onPress: () => {
                        Alert.alert("Delete Message", "Delete this message for everyone?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => { deleteMessage(msg._id, "everyone").catch(() => { }); } },
                        ]);
                    }
                }] : []),
                { text: "Cancel", style: "cancel" },
            ]);
        },
        [currentUserId, callerPermission, togglePin, deleteMessage]
    );

    const handleDateFilterChange = useCallback((start: Date | null, end: Date | null) => {
        setDateFilterStart(start);
        setDateFilterEnd(end);
    }, []);

    // Derive current room from rooms list (setCurrentRoom is never called)
    const currentRoom = useMemo(
        () => state.rooms.find((r) => r._id === roomId || r.id.toString() === roomId),
        [state.rooms, roomId]
    );

    const handleLongPress = useCallback((msg: ChatMessage) => {
        setSelectedMsgForModal(msg);
    }, []);

    const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => (
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
                onLongPress={handleLongPress}
                onReactionPress={(emoji: string) => handleReactEmoji(item, emoji)}
            />
        </View>
    ), [currentUserId, currentRoom?.members, isChannel, handleLongPress, handleReactEmoji]);

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
    }, [roomId, state.hasMore, state.messagesLoading, state.messagePage, fetchMessages]);

    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

    const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        for (const v of viewableItems) {
            if (v.item?.createdAt) {
                setFirstVisibleDate(new Date(v.item.createdAt));
                return;
            }
        }
    }).current;

    const dynamicDateLabel = useMemo(() => {
        if (!firstVisibleDate || isNaN(firstVisibleDate.getTime())) {
            return isChannel ? "Today's Discussion" : "Today's Chat";
        }
        return formatDateDivider(firstVisibleDate, isChannel);
    }, [firstVisibleDate, isChannel]);

    return (
        <View style={styles.root}>
            <StatusBar style="dark" />
            <SafeAreaView style={styles.safe}>
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

                                <View style={styles.headerAvatar}>
                                    <Text style={styles.headerAvatarText}>{initials}</Text>
                                </View>

                                <View style={styles.headerInfo}>
                                    <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
                                    <Text style={styles.headerStatus}>
                                        {isChannel
                                            ? `${roomPermissions.length} member${roomPermissions.length !== 1 ? "s" : ""}`
                                            : "Active"}
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
                        <Pressable style={styles.searchRow} onPress={(e) => e.stopPropagation()}>
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
                                onPress={() => { setSearchOpen(false); setSearch(""); }}
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
                            style={[styles.filterChip, (activeFilter === "date" || dateFilterStart !== null) && styles.filterChipActive]}
                            activeOpacity={0.75}
                            onPress={() => toggleFilter("date")}
                        >
                            <Ionicons
                                name="calendar-outline"
                                size={11}
                                color={(activeFilter === "date" || dateFilterStart !== null) ? "#fff" : "#6B7280"}
                            />
                            <Text style={[styles.filterChipText, (activeFilter === "date" || dateFilterStart !== null) && styles.filterChipTextActive]}>
                                Date
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.filterChip, activeFilter === "attachments" && styles.filterChipActive]}
                            activeOpacity={0.75}
                            onPress={() => toggleFilter("attachments")}
                        >
                            <Ionicons
                                name="attach-outline"
                                size={11}
                                color={activeFilter === "attachments" ? "#fff" : "#6B7280"}
                            />
                            <Text style={[styles.filterChipText, activeFilter === "attachments" && styles.filterChipTextActive]}>
                                Attachments
                            </Text>
                        </TouchableOpacity>

                        {isChannel && (
                            <>
                                <TouchableOpacity
                                    style={[styles.filterChip, activeFilter === "chat_member" && styles.filterChipActive]}
                                    activeOpacity={0.75}
                                    onPress={() => toggleFilter("chat_member")}
                                >
                                    <Ionicons
                                        name="people-outline"
                                        size={11}
                                        color={activeFilter === "chat_member" ? "#fff" : "#6B7280"}
                                    />
                                    <Text style={[styles.filterChipText, activeFilter === "chat_member" && styles.filterChipTextActive]}>
                                        Chat Member
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.filterChip, activeFilter === "post_type" && styles.filterChipActive]}
                                    activeOpacity={0.75}
                                    onPress={() => toggleFilter("post_type")}
                                >
                                    <Ionicons
                                        name="apps-outline"
                                        size={11}
                                        color={activeFilter === "post_type" ? "#fff" : "#6B7280"}
                                    />
                                    <Text style={[styles.filterChipText, activeFilter === "post_type" && styles.filterChipTextActive]}>
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
                                    style={[styles.postTypeListRow, { backgroundColor: pt.color + "15" }]}
                                    activeOpacity={0.75}
                                >
                                    <Ionicons name="pricetag" size={14} color={pt.color} />
                                    <Text style={[styles.postTypeListLabel, { color: pt.color }]} numberOfLines={1}>{pt.name}</Text>
                                </TouchableOpacity>
                            ))}
                            {postTypes.length === 0 && (
                                <Text style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "SF_Pro_Regular", padding: 12 }}>
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
                                    (m) => m.id === perm.userId
                                );
                                const fullName = memberInfo
                                    ? `${memberInfo.first_name} ${memberInfo.last_name}`
                                    : `User #${perm.userId}`;
                                const initials = memberInfo
                                    ? (memberInfo.first_name?.charAt(0) ?? "") +
                                    (memberInfo.last_name?.charAt(0) ?? "")
                                    : String(perm.userId).charAt(0);
                                return (
                                    <View key={perm.userId} style={styles.memberRow}>
                                        <View style={styles.memberAvatar}>
                                            <Text style={styles.memberAvatarText}>
                                                {initials}
                                            </Text>
                                        </View>
                                        <Text style={styles.memberName} numberOfLines={1}>
                                            {fullName}
                                        </Text>
                                        <Text style={{ fontSize: 11, color: "#6B7280", fontFamily: "SF_Pro_Regular" }}>
                                            {perm.permission}
                                        </Text>
                                    </View>
                                );
                            })}
                            {state.roomPermissions.length === 0 && (
                                <Text style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "SF_Pro_Regular", padding: 12 }}>
                                    No members loaded
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {/* ── Fixed Date Divider (dynamic, updates on scroll) ── */}
                {!searchOpen && (
                    <DateDivider label={dynamicDateLabel} />
                )}

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
                                {activePinned.text || (activePinned.attachments?.length ? "Attachment" : "")}
                            </Text>
                        </View>
                    </Pressable>
                )}

                {/* ── Scrollable content ── */}
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
                >
                    <FlatList
                        ref={scrollRef}
                        style={styles.scroll}
                        inverted={true}
                        data={invertedMessages}
                        keyExtractor={(item: ChatMessage) => item._id}
                        renderItem={renderItem}
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.3}
                        windowSize={10}
                        maxToRenderPerBatch={10}
                        updateCellsBatchingPeriod={50}
                        removeClippedSubviews={true}
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
                                    <Text style={{ fontSize: 13, color: "#9CA3AF", fontFamily: "SF_Pro_Regular", marginTop: 8, textAlign: "center" }}>
                                        No messages matching "{search}"
                                    </Text>
                                </View>
                            ) : (dateFilterStart && dateFilterEnd) && state.messages.length > 0 && invertedMessages.length === 0 ? (
                                <View style={{ padding: 40, alignItems: "center" }}>
                                    <Ionicons name="calendar-outline" size={32} color="#D1D5DB" />
                                    <Text style={{ fontSize: 13, color: "#9CA3AF", fontFamily: "SF_Pro_Regular", marginTop: 8, textAlign: "center" }}>
                                        No messages found for this date range.
                                    </Text>
                                </View>
                            ) : invertedMessages.length === 0 ? (
                                <View style={{ padding: 40, alignItems: "center" }}>
                                    <Text style={{ fontSize: 13, color: "#9CA3AF", fontFamily: "SF_Pro_Regular", textAlign: "center" }}>
                                        No messages yet. Start the conversation!
                                    </Text>
                                </View>
                            ) : null
                        }
                        onViewableItemsChanged={onViewableItemsChangedRef}
                        viewabilityConfig={viewabilityConfig}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.scrollContent}
                    />

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
                            <TouchableOpacity activeOpacity={0.4} onPress={() => setReplyTo(null)} hitSlop={8}>
                                <Ionicons name="close" size={16} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ── Upload Progress ── */}
                    {uploadProgress && (
                        <View style={styles.uploadProgressContainer}>
                            <View style={styles.uploadProgressRow}>
                                <Ionicons name="cloud-upload-outline" size={14} color="#00DEAB" />
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
                                {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
                            </Text>
                        </View>
                    )}

                    {/* ── Bottom Input Bar ── */}
                    <View style={styles.inputBar}>
                        {canSendMessage ? (
                        <>
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
                                            <Ionicons name="happy-outline" size={18} color="#1D1D1D" />
                                            <Text style={styles.plusBadge}>+</Text>
                                        </TouchableOpacity>
                                        {isChannel && postTypes.length > 0 && canManagePostTypes && (
                                            <TouchableOpacity
                                                activeOpacity={0.4}
                                                style={[
                                                    styles.inputActionBtn,
                                                    styles.postTypeToggle,
                                                    postTypeOpen && styles.postTypeToggleActive,
                                                ]}
                                                onPress={() => setPostTypeOpen(!postTypeOpen)}
                                            >
                                                <Text style={[styles.postTypeToggleText, postTypeOpen && styles.postTypeToggleTextActive]}>Post Type</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    <TouchableOpacity
                                        style={[
                                            styles.sendBtn,
                                            (message.trim().length > 0 || sending) && styles.sendBtnActive,
                                        ]}
                                        activeOpacity={0.4}
                                        onPress={handleSend}
                                        disabled={sending || !message.trim()}
                                    >
                                        {sending ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <Ionicons name="paper-plane" size={16} color="#fff" />
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
                                        {postTypes.map((pt: { name: string; color: string }) => (
                                            <TouchableOpacity key={pt.name} style={[styles.postTypeChip, { backgroundColor: pt.color + "15" }]} activeOpacity={0.4}>
                                                <Ionicons name="pricetag" size={14} color={pt.color} style={{ marginRight: 4 }} />
                                                <Text style={[styles.postTypeChipText, { color: pt.color }]}>{pt.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                )}
                            </View>

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
                    name: u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim(),
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
                message={selectedMsgForModal}
                currentUserId={currentUserId}
                callerPermission={callerPermission}
                onClose={() => setSelectedMsgForModal(null)}
                onReactionSelect={(emoji) => {
                    if (selectedMsgForModal) {
                        handleReactEmoji(selectedMsgForModal, emoji);
                    }
                }}
                onOpenEmojiPicker={() => {
                    if (selectedMsgForModal) {
                        setEmojiPickerMsg(selectedMsgForModal);
                        setEmojiPickerOpen(true);
                    }
                }}
                onReply={() => {
                    if (selectedMsgForModal) setReplyTo(selectedMsgForModal);
                }}
                onCopy={() => {
                    if (selectedMsgForModal) {
                        Clipboard.setStringAsync(selectedMsgForModal.text);
                        showInfo("Copied", "Message text copied to clipboard");
                    }
                }}
                onForward={() => {
                    if (selectedMsgForModal) {
                        setForwardMsg(selectedMsgForModal);
                        setForwardOpen(true);
                    }
                }}
                onPin={() => {
                    if (selectedMsgForModal) {
                        togglePin(selectedMsgForModal._id).catch(() => {});
                    }
                }}
                onEdit={() => {
                    if (selectedMsgForModal) {
                        setEditingMsg(selectedMsgForModal);
                        setEditText(selectedMsgForModal.text);
                    }
                }}
                onDelete={() => {
                    if (selectedMsgForModal) {
                        const msg = selectedMsgForModal;
                        Alert.alert("Delete Message", "Delete this message for everyone?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => deleteMessage(msg._id, "everyone").catch(() => {}) },
                        ]);
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
            <Modal visible={forwardOpen} transparent animationType="slide" onRequestClose={() => setForwardOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setForwardOpen(false)}>
                    <View style={styles.forwardPickerContainer} onStartShouldSetResponder={() => true}>
                        <View style={styles.forwardHeader}>
                            <Text style={styles.forwardTitle}>Forward to</Text>
                            <TouchableOpacity onPress={() => setForwardOpen(false)}>
                                <Ionicons name="close" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                        {forwardMsg && (
                            <View style={styles.forwardPreview}>
                                <Text style={styles.forwardPreviewLabel}>Message:</Text>
                                <Text style={styles.forwardPreviewText} numberOfLines={2}>{forwardMsg.text}</Text>
                            </View>
                        )}
                        <FlatList
                            data={state.rooms}
                            keyExtractor={(item) => item._id}
                            renderItem={({ item: room }) => {
                                const otherMembers = room.members?.filter((m) => m.id !== currentUserId);
                                const displayName = room.name || otherMembers?.map((m) => `${m.first_name} ${m.last_name}`).join(", ") || "Chat";
                                return (
                                    <TouchableOpacity
                                        style={styles.forwardRoomRow}
                                        onPress={() => handleForward(room)}
                                        disabled={forwarding}
                                    >
                                        <View style={styles.forwardRoomAvatar}>
                                            <Text style={styles.forwardRoomAvatarText}>
                                                {displayName.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <Text style={styles.forwardRoomName} numberOfLines={1}>{displayName}</Text>
                                        {forwarding && <ActivityIndicator size="small" color="#00DEAB" />}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </Pressable>
            </Modal>

            {/* ── Edit Message Overlay ── */}
            <Modal visible={!!editingMsg} transparent animationType="fade" onRequestClose={() => { setEditingMsg(null); setEditText(""); }}>
                <Pressable style={styles.modalOverlay} onPress={() => { setEditingMsg(null); setEditText(""); }}>
                    <View style={styles.editContainer} onStartShouldSetResponder={() => true}>
                        <Text style={styles.editTitle}>Edit Message</Text>
                        <TextInput
                            ref={editInputRef}
                            style={styles.editInput}
                            value={editText}
                            onChangeText={setEditText}
                            multiline
                            autoFocus
                            placeholder="Edit your message..."
                            placeholderTextColor="#9CA3AF"
                        />
                        <View style={styles.editActions}>
                            <TouchableOpacity onPress={() => { setEditingMsg(null); setEditText(""); }} style={styles.editCancelBtn}>
                                <Text style={styles.editCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleEdit}
                                style={[styles.editSaveBtn, (!editText.trim() || editing) && styles.editSaveBtnDisabled]}
                                disabled={!editText.trim() || editing}
                            >
                                {editing ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.editSaveText}>Save</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥", "👏", "💯", "✅", "❌", "⭐", "💪", "🙏", "😊", "😎", "🤔", "👀", "💐"];

// ─── Styles ───────────────────────────────────────────────────────────────────

const TEAL = "#00DEAB";
const TEXT_PRIMARY = "#1D1D1D";
const TEXT_SECONDARY = "#6B7280";

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#fff" },
    safe: { flex: 1 },
    flex: { flex: 1 },

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
        fontSize: 14,
        fontFamily: "SF_Pro_Semibold",
    },
    headerInfo: { flex: 1 },
    headerName: {
        fontSize: 15,
        fontFamily: "SF_Pro_Medium",
        color: TEXT_PRIMARY,
    },
    headerStatus: {
        fontSize: 10,
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
        fontSize: 14,
        color: "#111827",
        fontFamily: "SF_Pro_Regular",
        padding: 0,
    },
    cancelBtn: { paddingHorizontal: 4 },
    cancelText: {
        fontSize: 14,
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
        fontSize: 11,
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
        fontSize: 20,
        fontFamily: "SF_Pro_Regular",
        color: TEXT_PRIMARY,
        marginBottom: 8,
        textAlign: "center",
    },
    workspaceDescription: {
        fontSize: 12,
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
        fontSize: 11,
        fontFamily: "SF_Pro_Medium",
        color: "#6B7280",
    },

    incomingRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        gap: 10,
    },
    incomingContent: {
        flex: 1,
        alignItems: "flex-end",
    },
    senderMeta: {
        fontSize: 11,
        fontFamily: "SF_Pro_Regular",
        color: TEXT_SECONDARY,
        marginBottom: 5,
        textAlign: "right",
    },
    incomingBubble: {
        backgroundColor: "#E6FAF5",
        borderRadius: 14,
        borderTopRightRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxWidth: "90%",
    },

    outgoingRow: {
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        gap: 10,
    },
    outgoingContent: {
        flex: 1,
        alignItems: "flex-start",
    },
    senderMetaOutgoing: {
        fontSize: 11,
        fontFamily: "SF_Pro_Regular",
        color: TEXT_SECONDARY,
        marginBottom: 5,
        textAlign: "left",
    },
    outgoingBubble: {
        backgroundColor: "#F3F4F6",
        borderRadius: 14,
        borderTopLeftRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxWidth: "90%",
    },

    bubbleText: {
        fontSize: 14,
        fontFamily: "SF_Pro_Regular",
        color: TEXT_PRIMARY,
        lineHeight: 20,
    },
    timeMeta: {
        fontSize: 11,
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
        fontSize: 10,
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
        fontSize: 11,
        fontFamily: "SF_Pro_Regular",
        color: "#00A67E",
        marginBottom: 1,
    },
    pinnedBannerText: {
        fontSize: 12,
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
        fontSize: 11,
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
        fontSize: 14,
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
        fontSize: 11,
        fontFamily: "SF_Pro_Semibold",
        color: TEXT_PRIMARY,
    },
    replyPreviewText: {
        fontSize: 11,
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
        fontSize: 11,
        fontFamily: "SF_Pro_Regular",
        color: TEXT_SECONDARY,
    },
    uploadProgressPercent: {
        fontSize: 11,
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
        paddingBottom: Platform.OS === "ios" ? 24 : 16,
        paddingHorizontal: 16,
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
        fontSize: 12,
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
        fontSize: 12,
        fontFamily: "SF_Pro_Regular",
        color: "#6B7280",
    },
    inputContainer: {
        borderWidth: 1,
        borderColor: "#E6E6E6",
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 6,
        backgroundColor: "#fff",
    },
    inputRow: {
        minHeight: 36,
        justifyContent: "flex-start",
    },
    textInput: {
        fontSize: 14,
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
        fontSize: 9,
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
        fontSize: 14,
        fontFamily: "SF_Pro_Semibold",
        color: "#EF4444",
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
        fontSize: 13,
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
        fontSize: 12,
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
        fontSize: 12,
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
        fontSize: 11.5,
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
        fontSize: 12,
        fontFamily: "SF_Pro_Semibold",
    },
    memberName: {
        flex: 1,
        fontSize: 13,
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
        fontSize: 15,
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
        fontSize: 26,
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
        fontSize: 16,
        fontFamily: "SF_Pro_Medium",
        color: TEXT_PRIMARY,
    },
    forwardPreview: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: "#F9FAFB",
    },
    forwardPreviewLabel: {
        fontSize: 11,
        fontFamily: "SF_Pro_Medium",
        color: TEXT_SECONDARY,
        marginBottom: 4,
    },
    forwardPreviewText: {
        fontSize: 13,
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
        fontSize: 14,
        fontFamily: "SF_Pro_Semibold",
    },
    forwardRoomName: {
        flex: 1,
        fontSize: 14,
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
        fontSize: 16,
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
        fontSize: 14,
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
        fontSize: 14,
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
        fontSize: 14,
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
        fontSize: 13,
        fontFamily: "SF_Pro_Regular",
        color: TEXT_PRIMARY,
    },
});
