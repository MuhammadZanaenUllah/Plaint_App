import AddPeopleModal from "@/components/AddPeopleModal";
import CreateChannelModal from "@/components/CreateChannelModal";
import InviteToChannelModal, { type ChannelPermission, type ChannelMember } from "@/components/InviteToChannelModal";
import Icons from "@/constants/icons";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useTasks } from "@/hooks/useTasks";
import { Room } from "@/types/chat.types";
import {
    filterReadRooms,
    filterRoomsByType,
    filterUnreadRooms,
    formatChatListTime,
    getRoomDisplayName,
    getRoomInitials,
    isRoomUnread,
} from "@/utils/chatHelpers";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { showSuccess, showError } from "@/utils/toast";
import * as chatService from "@/services/api/chat.service";
const { ChatIcon: MainChatIcon, ChannelTabIcon } = Icons;

// ─── Chip Config ──────────────────────────────────────────────────────────────

const CHIP_DATA = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "read", label: "Read" },
    { id: "channels", label: "Channels" },
    { id: "projects", label: "Projects" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
    const {
        state, fetchRooms, getOrCreateRoom, markRead,
        setSearchQuery, initSocket, cleanupChatListeners,
        roomCreator, roomPermissions,
    } = useChat();
    const authState = useAuth();
    const { state: taskState } = useTasks();
    const currentUserId = authState?.state?.user?.id ?? 0;

    const [addPeopleOpen, setAddPeopleOpen] = useState(false);
    const [addPeopleQuery, setAddPeopleQuery] = useState("");
    const [createChannelOpen, setCreateChannelOpen] = useState(false);
    const [isChannelMode, setIsChannelMode] = useState(false);
    const [activeChip, setActiveChip] = useState("all");
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [selectedChannelKey, setSelectedChannelKey] = useState<string | null>(null);
    const [newChannelName, setNewChannelName] = useState("");
    // Track which project we're adding a channel to (null = standalone channel)
    const [projectContext, setProjectContext] = useState<Room | null>(null);
    // Track expanded projects in the Projects chip view
    const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());

    // ── InviteToChannelModal state ─────────────────────────────────────────────
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    // Room that was just created (for the invite modal to use)
    const createdRoomRef = useRef<Room | null>(null);
    // Pending users selected from AddPeopleModal (to pre-fill invite modal)
    const [pendingInviteUsers, setPendingInviteUsers] = useState<Array<{ id: string; name: string; email?: string }>>([]); 

    // Fetch rooms on mount
    useEffect(() => {
        fetchRooms();
    }, [fetchRooms]);

    // Initialize socket when user is available
    useEffect(() => {
        if (currentUserId) {
            initSocket(currentUserId);
        }
        return () => {
            cleanupChatListeners();
        };
    }, [currentUserId, initSocket, cleanupChatListeners]);

    // Reset search query when modal closes
    useEffect(() => {
        if (!addPeopleOpen) {
            setAddPeopleQuery("");
        }
    }, [addPeopleOpen]);

    // Build a default list of all company members from existing room members + task owners.
    // The backend requires ≥2 chars to search, so we use local data as the default list.
    const defaultMemberList = useMemo(() => {
        const memberMap = new Map<string, { id: string; name: string; email?: string }>();
        // From all rooms' members
        for (const room of state.rooms ?? []) {
            for (const m of room.members ?? []) {
                if (m.id === currentUserId) continue;
                const key = String(m.id);
                if (!memberMap.has(key)) {
                    const name = `${m.first_name || ""} ${m.last_name || ""}`.trim() || `User #${m.id}`;
                    memberMap.set(key, { id: key, name });
                }
            }
        }
        // From task owners
        for (const owner of (taskState?.taskOwners ?? []) as any[]) {
            if (!owner?.id) continue;
            if (owner.id === currentUserId) continue;
            const key = String(owner.id);
            if (!memberMap.has(key)) {
                const name = `${owner.first_name || ""} ${owner.last_name || ""}`.trim() || `User #${owner.id}`;
                memberMap.set(key, { id: key, name, email: owner.email });
            }
        }
        return Array.from(memberMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [state.rooms, taskState?.taskOwners, currentUserId]);

    // Build the user list shown in AddPeopleModal:
    // - When query has ≥2 chars: use API search results (populated by setSearchQuery)
    // - Otherwise: use defaultMemberList built from rooms + task owners
    const addPeopleUsers = useMemo(() => {
        if (addPeopleQuery.trim().length >= 2 && state.searchResults.length > 0) {
            return state.searchResults.map((u) => ({
                id: String(u.id),
                name: u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || `User #${u.id}`,
                email: u.email,
            }));
        }
        return defaultMemberList;
    }, [addPeopleQuery, state.searchResults, defaultMemberList]);

    // Compute unread counts per chip
    const chipUnread = useMemo(() => {
        const rooms = state.rooms;
        const directRooms = rooms.filter((r) => r.type === "direct");
        const hasUnread = (rms: Room[]) => rms.some((r) => r.unreadCount > 0 || r.force_unread);
        return {
            all: hasUnread(directRooms),
            unread: hasUnread(directRooms),
            read: false,
            channels: hasUnread(rooms.filter((r) => r.type === "channel")),
            projects: hasUnread(rooms.filter((r) => r.type === "project")),
        };
    }, [state.rooms]);

    // Categorize rooms based on active chip
    const displayRooms = useMemo(() => {
        const rooms = state.rooms;
        // All, Unread, Read → show only direct (inbox) messages, not channels/projects
        const directRooms = rooms.filter((r) => r.type === "direct");

        switch (activeChip) {
            case "channels":
                return filterRoomsByType(rooms, "channel");
            case "projects":
                return filterRoomsByType(rooms, "project");
            case "unread":
                return filterUnreadRooms(directRooms);
            case "read":
                return filterReadRooms(directRooms);
            case "all":
            default:
                return directRooms;
        }
    }, [state.rooms, activeChip]);

    // Group channels by their parent project for the Projects view
    const projectChannelMap = useMemo(() => {
        const map = new Map<number, Room[]>();
        for (const room of state.rooms) {
            if (room.type === "channel" && room.parent_id) {
                const existing = map.get(room.parent_id) ?? [];
                existing.push(room);
                map.set(room.parent_id, existing);
            }
        }
        return map;
    }, [state.rooms]);

    const toggleProjectExpand = useCallback((projectId: number) => {
        setExpandedProjects((prev) => {
            const next = new Set(prev);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });
    }, []);

    const handleRoomPress = useCallback(
        async (room: Room) => {
            console.log("[Chat] Room pressed:", { id: room.id, _id: room._id, type: room.type, name: room.name });
            setSelectedChatId(room.id.toString());
            if (isRoomUnread(room)) {
                markRead(room._id).catch(() => { });
            }
            router.push({
                pathname: "/conversation",
                params: {
                    roomId: room._id,
                    name: getRoomDisplayName(room, currentUserId),
                    initials: getRoomInitials(room, currentUserId),
                    isChannel: String(room.type === "channel"),
                    roomType: room.type,
                },
            });
        },
        [currentUserId, markRead]
    );

    const handleAddPeopleSelect = useCallback(
        async (user: { id: string; name: string; email?: string }) => {
            setAddPeopleOpen(false);
            try {
                const room = await getOrCreateRoom({
                    type: "direct",
                    targetId: parseInt(user.id, 10),
                });
                router.push({
                    pathname: "/conversation",
                    params: {
                        roomId: room._id,
                        name: getRoomDisplayName(room, currentUserId),
                        initials: getRoomInitials(room, currentUserId),
                        isChannel: "false",
                        roomType: "direct",
                    },
                });
            } catch {
                // Fallback: navigate with user info
                router.push({
                    pathname: "/conversation",
                    params: {
                        name: user.name,
                        initials: user.name.charAt(0).toUpperCase(),
                    },
                });
            }
        },
        [getOrCreateRoom, currentUserId]
    );

    const handleChannelCreate = useCallback(
        async (name: string) => {
            console.log("[Chat] Creating channel:", name);
            setCreateChannelOpen(false);
            setNewChannelName(name);
            setIsChannelMode(true);
            setTimeout(() => setAddPeopleOpen(true), 300);
        },
        []
    );

    const handleInviteUsers = useCallback(
        async (users: Array<{ id: string; name: string; email?: string }>) => {
            console.log("[Chat] handleInviteUsers called:", { channelName: newChannelName, userCount: users.length, projectContext: projectContext?.name });
            setAddPeopleOpen(false);
            setIsChannelMode(false);
            if (newChannelName) {
                try {
                    // Build create room request — if projectContext is set, link as child channel
                    const createRoomReq: { type: "channel"; name: string; parent_id?: number } = {
                        type: "channel",
                        name: newChannelName,
                    };
                    if (projectContext) {
                        createRoomReq.parent_id = projectContext.id;
                    }

                    const room = await getOrCreateRoom(createRoomReq);
                    console.log("[Chat] Channel created:", room.id, room.name);

                    // ── Store the created room and selected users, show InviteToChannelModal ──
                    // NOTE: No invitations are sent here — they are deferred until the
                    // user confirms permissions via "Invite & Generate Link".
                    createdRoomRef.current = room as unknown as Room;
                    setPendingInviteUsers(users);
                    fetchRooms();
                    setTimeout(() => setInviteModalVisible(true), 300);

                    setNewChannelName("");
                    setProjectContext(null);
                } catch (err) {
                    console.log("[Chat] Channel creation error:", err);
                    showError("Error", "Failed to create channel. Please try again.");
                    setNewChannelName("");
                    setProjectContext(null);
                }
            }
        },
        [newChannelName, projectContext, getOrCreateRoom, fetchRooms]
    );

    // ── InviteToChannelModal handlers ──────────────────────────────────────────

    const handleChannelInvite = useCallback(
        async (emails: string[], permission: ChannelPermission) => {
            const room = createdRoomRef.current;
            if (!room) return;

            // Final email list comes from the modal's Email Address field, which
            // was pre-filled with the selected members' emails (and is editable).
            // Normalize + dedupe so we never send the same invitation twice.
            const finalEmails = Array.from(
                new Set(
                    emails
                        .map((e) => e.trim().toLowerCase())
                        .filter(Boolean)
                )
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

            // Selected members who are NOT covered by the final email list (no
            // email address, or their address was removed from the field) are
            // added directly as members with the chosen permission instead —
            // this avoids duplicate invitations for the same person.
            for (const user of pendingInviteUsers) {
                const userId = parseInt(user.id, 10);
                if (isNaN(userId)) continue;
                const userEmail = (user.email ?? "").trim().toLowerCase();
                if (userEmail && emailSet.has(userEmail)) continue;
                try {
                    await chatService.addMember(room._id, userId);
                    await chatService.updatePermission({ roomId: room._id, userId, permission }).catch(() => {});
                    directAdded++;
                } catch {
                    failed++;
                }
            }

            // Send exactly one invitation per final email address.
            for (const email of finalEmails) {
                try {
                    await chatService.inviteUser({
                        roomId: room._id,
                        email,
                        userId: userIdByEmail.get(email),
                        permission,
                    });
                    emailSent++;
                } catch {
                    failed++;
                }
            }

            fetchRooms();

            const parts: string[] = [];
            if (emailSent > 0) parts.push(`${emailSent} invite(s) sent`);
            if (directAdded > 0) parts.push(`${directAdded} member(s) added`);
            if (failed > 0) parts.push(`${failed} failed`);
            if (parts.length > 0) showSuccess("Channel Ready", `"${room.name}": ${parts.join(", ")}.`);

            // Navigate to the new channel
            router.push({
                pathname: "/conversation",
                params: {
                    roomId: room._id,
                    name: room.name,
                    initials: room.name.charAt(0).toUpperCase(),
                    isChannel: "true",
                    roomType: "channel",
                },
            });
        },
        [pendingInviteUsers, fetchRooms]
    );

    const handleGenerateChannelLink = useCallback(
        async (permission: ChannelPermission, forAllUsers: boolean): Promise<string | null> => {
            const room = createdRoomRef.current;
            if (!room) return null;
            try {
                const allowedUserIds = forAllUsers
                    ? []
                    : pendingInviteUsers
                        .map((u) => parseInt(u.id, 10))
                        .filter((id) => !isNaN(id));
                const res = await chatService.generateLink({
                    roomId: room._id,
                    permission,
                    allowedUserIds,
                });
                return (res as any)?.data?.inviteLink ?? (res as any)?.inviteLink ?? null;
            } catch (err) {
                console.error("[Chat] generateLink error:", err);
                return null;
            }
        },
        [pendingInviteUsers]
    );

    const handleUpdateChannelPermission = useCallback(
        async (memberId: number, permission: ChannelPermission) => {
            const room = createdRoomRef.current;
            if (!room) return;
            await chatService.updatePermission({ roomId: room._id, userId: memberId, permission });
        },
        []
    );

    // Derive the current user's permission for the invite modal
    const callerPermission = useMemo<ChannelPermission | undefined>(() => {
        const found = (roomPermissions ?? []).find((p) => p.userId === currentUserId);
        return found?.permission as ChannelPermission | undefined;
    }, [roomPermissions, currentUserId]);

    // Build current room members for the InviteToChannelModal "Who has access" list
    const currentChannelMembers = useMemo<ChannelMember[]>(() => {
        const room = createdRoomRef.current;
        if (!room) return [];
        return (room.members ?? []).map((m: any) => ({
            id: m.id,
            name: `${m.first_name || ""} ${m.last_name || ""}`.trim() || `User #${m.id}`,
            isOwner: m.id === currentUserId,
        }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inviteModalVisible, currentUserId]);

    // Handler for creating a channel under a specific project
    const handleProjectAddChannel = useCallback(
        (project: Room) => {
            setProjectContext(project);
            setCreateChannelOpen(true);
        },
        []
    );

    if (state.loading && state.rooms.length === 0) {
        return (
            <View style={styles.root}>
                <View style={styles.safe}>
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                        <ActivityIndicator size="large" color="#00DEAB" />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <View style={styles.safe}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Category Chips ── */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipsContainer}
                    >
                        {CHIP_DATA.map((chip, index) => {
                            const isActive = activeChip === chip.id;
                            const showDot = chipUnread[chip.id as keyof typeof chipUnread] ?? false;
                            return (
                                <View
                                    key={chip.id}
                                    style={{ flexDirection: "row", alignItems: "center" }}
                                >
                                    <TouchableOpacity
                                        style={[
                                            styles.chipButton,
                                            isActive && styles.chipButtonActive,
                                        ]}
                                        onPress={() => setActiveChip(chip.id)}
                                    >
                                        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                                            {chip.label}
                                        </Text>
                                        {showDot && (
                                            <View style={[styles.unreadDot, isActive && styles.unreadDotActive]} />
                                        )}
                                    </TouchableOpacity>
                                    {index === 2 && (
                                        <View style={styles.verticalDivider} />
                                    )}
                                </View>
                            );
                        })}
                    </ScrollView>

                    {displayRooms.length > 0 ? (
                        <View style={styles.chatListContainer}>
                            {activeChip === "projects" ? (
                                /* ── Projects view with expandable child channels ── */
                                displayRooms.map((project: Room) => {
                                    const displayName = getRoomDisplayName(project, currentUserId);
                                    const initials = getRoomInitials(project, currentUserId);
                                    const unread = isRoomUnread(project);
                                    const isExpanded = expandedProjects.has(project.id);
                                    const childChannels = projectChannelMap.get(project.id) ?? [];
                                    const lastPreview = `${childChannels.length} ${childChannels.length === 1 ? "channel" : "channels"}`;
                                    const projectTime = project.last_message?.createdAt
                                        ? formatChatListTime(project.last_message.createdAt)
                                        : (project as any).time ?? "";

                                    return (
                                        <View key={project.id}>
                                            {/* Project row */}
                                            <TouchableOpacity
                                                style={[
                                                    styles.chatRow,
                                                    (isExpanded || selectedChatId === project.id.toString()) && { backgroundColor: "#F3F4F6" },
                                                ]}
                                                activeOpacity={0.7}
                                                onPress={() => toggleProjectExpand(project.id)}
                                                onLongPress={() => toggleProjectExpand(project.id)}
                                            >
                                                <View style={styles.avatarContainer}>
                                                    <View style={styles.avatarBox}>
                                                        <Text style={styles.avatarText}>{initials}</Text>
                                                    </View>
                                                    {unread && (
                                                        <View style={styles.onlineIndicator} />
                                                    )}
                                                </View>
                                                <View style={styles.chatInfo}>
                                                    <Text style={styles.chatName} numberOfLines={1}>
                                                        {displayName}
                                                    </Text>
                                                    <Text style={styles.chatSnippet} numberOfLines={1}>
                                                        {lastPreview}
                                                    </Text>
                                                </View>
                                                <View style={styles.chatMeta}>
                                                    {unread && project.unreadCount > 0 && (
                                                        <View style={styles.unreadBubble}>
                                                            <Text style={styles.unreadBubbleText}>
                                                                +{project.unreadCount}
                                                            </Text>
                                                        </View>
                                                    )}
                                                    {projectTime !== "" && (
                                                        <Text style={styles.chatTime}>{projectTime}</Text>
                                                    )}
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 4 }}>
                                                        <TouchableOpacity
                                                            activeOpacity={0.7}
                                                            style={{ padding: 4 }}
                                                            onPress={(e) => {
                                                                e.stopPropagation();
                                                                handleProjectAddChannel(project);
                                                            }}
                                                        >
                                                            <Ionicons name="add-circle-sharp" size={22} color="#1D1D1D" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            activeOpacity={0.7}
                                                            style={{ padding: 4 }}
                                                            onPress={(e) => {
                                                                e.stopPropagation();
                                                                toggleProjectExpand(project.id);
                                                            }}
                                                        >
                                                            <Ionicons
                                                                name={isExpanded ? "chevron-up" : "chevron-down"}
                                                                size={20}
                                                                color="#1D1D1D"
                                                            />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>

                                            {isExpanded && (
                                                <View style={styles.channelsContainer}>
                                                    {childChannels.map((channel: Room) => {
                                                        const isChannelActive = selectedChatId === channel.id.toString();
                                                        const channelName = getRoomDisplayName(channel, currentUserId);
                                                        const channelInitials = getRoomInitials(channel, currentUserId);
                                                        const channelUnread = isRoomUnread(channel);
                                                        const channelPreview = channel.last_message
                                                            ? (channel.last_message.attachments && channel.last_message.attachments.length > 0
                                                                ? `📎 ${channel.last_message.attachments.length} attachment${channel.last_message.attachments.length > 1 ? "s" : ""}`
                                                                : channel.last_message.text || "No messages yet")
                                                            : "No messages yet";
                                                        const channelTime = channel.last_message?.createdAt
                                                            ? formatChatListTime(channel.last_message.createdAt)
                                                            : "";

                                                        return (
                                                            <TouchableOpacity
                                                                key={channel.id}
                                                                style={[
                                                                    styles.chatRow,
                                                                    { paddingLeft: 40, backgroundColor: "#fff" },
                                                                    isChannelActive && styles.chatRowSelected,
                                                                ]}
                                                                activeOpacity={0.7}
                                                                onPress={() => handleRoomPress(channel)}
                                                            >
                                                                <View style={styles.avatarContainer}>
                                                                    <View style={[styles.avatarBox, { width: 32, height: 32 }]}>
                                                                        <Text style={[styles.avatarText, { fontSize: 13 }]}>{channelInitials}</Text>
                                                                    </View>
                                                                    {channelUnread && (
                                                                        <View style={styles.onlineIndicator} />
                                                                    )}
                                                                </View>
                                                                <View style={styles.chatInfo}>
                                                                    <Text style={styles.chatName} numberOfLines={1}>
                                                                        {channelName}
                                                                    </Text>
                                                                    <Text style={styles.chatSnippet} numberOfLines={1}>
                                                                        {channelPreview}
                                                                    </Text>
                                                                </View>
                                                                <View style={styles.chatMeta}>
                                                                    {channelUnread && channel.unreadCount > 0 && (
                                                                        <View style={styles.unreadBubble}>
                                                                            <Text style={styles.unreadBubbleText}>
                                                                                +{channel.unreadCount}
                                                                            </Text>
                                                                        </View>
                                                                    )}
                                                                    {channelTime !== "" && (
                                                                        <Text style={styles.chatTime}>{channelTime}</Text>
                                                                    )}
                                                                </View>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                    {/* <TouchableOpacity
                                                        style={[styles.channelRow, { paddingLeft: 40 }]}
                                                        activeOpacity={0.7}
                                                        onPress={() => handleProjectAddChannel(project)}
                                                    >
                                                        <View style={[styles.avatarBox, { width: 32, height: 32, backgroundColor: "#E6FBF5" }]}>
                                                            <Ionicons name="add" size={18} color="#00DEAB" />
                                                        </View>
                                                        <Text style={[styles.chatSnippet, { marginLeft: 14, color: "#00DEAB", fontFamily: "SF_Pro_Semibold" }]}>
                                                            Add Channel
                                                        </Text>
                                                    </TouchableOpacity> */}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })
                            ) : (
                                displayRooms.map((room: Room) => {
                                    const displayName = getRoomDisplayName(room, currentUserId);
                                    const initials = getRoomInitials(room, currentUserId);
                                    const unread = isRoomUnread(room);
                                    const lastPreview = room.last_message
                                        ? (room.last_message.attachments && room.last_message.attachments.length > 0
                                            ? `📎 ${room.last_message.attachments.length} attachment${room.last_message.attachments.length > 1 ? "s" : ""}`
                                            : room.last_message.text || "No messages yet")
                                        : "No messages yet";

                                    return (
                                        <TouchableOpacity
                                            key={room.id}
                                            style={[
                                                styles.chatRow,
                                                selectedChatId === room.id.toString() && styles.chatRowSelected,
                                            ]}
                                            activeOpacity={0.7}
                                            onPress={() => handleRoomPress(room)}
                                        >
                                            <View style={styles.avatarContainer}>
                                                <View style={styles.avatarBox}>
                                                    <Text style={styles.avatarText}>{initials}</Text>
                                                </View>
                                                {unread && (
                                                    <View style={styles.onlineIndicator} />
                                                )}
                                            </View>
                                            <View style={styles.chatInfo}>
                                                <Text style={styles.chatName} numberOfLines={1}>
                                                    {displayName}
                                                </Text>
                                                <Text style={styles.chatSnippet} numberOfLines={1}>
                                                    {lastPreview}
                                                </Text>
                                            </View>
                                            <View style={styles.chatMeta}>
                                                {unread && room.unreadCount > 0 && (
                                                    <View style={styles.unreadBubble}>
                                                        <Text style={styles.unreadBubbleText}>
                                                            +{room.unreadCount}
                                                        </Text>
                                                    </View>
                                                )}
                                                <Text style={styles.chatTime}>
                                                    {room.last_message?.createdAt
                                                        ? formatChatListTime(room.last_message.createdAt)
                                                        : room.my_visible_from
                                                            ? formatChatListTime(room.my_visible_from)
                                                            : ""}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </View>
                    ) : activeChip === "unread" ? (
                        <View style={styles.workspaceContainer}>
                            <View style={styles.iconStack}>
                                <Ionicons name="chatbubble-ellipses-outline" size={48} color="#00DEAB" />
                            </View>
                            <Text style={styles.workspaceTitle}>No Unread Message</Text>
                        </View>
                    ) : activeChip === "channels" ? (
                        <View style={styles.workspaceContainer}>
                            <View style={styles.iconStack}>
                                <ChannelTabIcon width={60} height={60} />
                            </View>
                            <Text style={styles.workspaceTitle}>Create a channel</Text>
                            <Text style={styles.workspaceDescription}>
                                Group keep your team's conversations{"\n"}organized by topic.
                            </Text>
                            <TouchableOpacity
                                style={styles.addPeopleButton}
                                activeOpacity={0.85}
                                onPress={() => {
                                    setProjectContext(null);
                                    setCreateChannelOpen(true);
                                }}
                            >
                                <Text style={styles.addPeopleText}>+ Create Channel</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.workspaceContainer}>
                            <View style={styles.iconStack}>
                                <MainChatIcon />
                            </View>
                            <Text style={styles.workspaceTitle}>Private workspace</Text>
                            <Text style={styles.workspaceDescription}>
                                A place just for you to capture ideas, draft messages,
                                and keep everything organized for later.
                            </Text>
                            <TouchableOpacity
                                style={styles.addPeopleButton}
                                activeOpacity={0.85}
                                onPress={() => {
                                    setIsChannelMode(false);
                                    setAddPeopleOpen(true);
                                }}
                            >
                                <Ionicons
                                    name="person-add"
                                    size={16}
                                    color="#fff"
                                    style={styles.buttonIcon}
                                />
                                <Text style={styles.addPeopleText}>Add People</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>

                {/* FAB */}
                {displayRooms.length > 0 && activeChip !== "projects" && (
                    <TouchableOpacity
                        style={styles.fab}
                        activeOpacity={0.8}
                        onPress={() => {
                            if (activeChip === "channels" || activeChip === "projects") {
                                setProjectContext(null);
                                setCreateChannelOpen(true);
                            } else {
                                setIsChannelMode(false);
                                setAddPeopleOpen(true);
                            }
                        }}
                    >
                        {/* <MaterialCommunityIcons 
                            name={activeChip === "channels" ? "account-multiple-plus" : "message-plus"} 
                            size={24} 
                            color="#000" 
                        /> */}
                        {activeChip === "channels" || activeChip === "projects" ? <Icons.ChannelBtn /> : <Icons.IndoxBtn />}

                    </TouchableOpacity>
                )}
            </View>

            <AddPeopleModal
                visible={addPeopleOpen}
                users={addPeopleUsers}
                isChannelMode={isChannelMode}
                onClose={() => {
                    setAddPeopleOpen(false);
                    setIsChannelMode(false);
                }}
                onSearch={(query) => {
                    setAddPeopleQuery(query);
                    // Only hit the API when the user has typed 2+ chars
                    if (query.trim().length >= 2) {
                        setSearchQuery(query);
                    }
                }}
                onSelectUser={handleAddPeopleSelect}
                onInviteUsers={handleInviteUsers}
            />

            <CreateChannelModal
                visible={createChannelOpen}
                onClose={() => {
                    setCreateChannelOpen(false);
                    setProjectContext(null);
                }}
                onNext={handleChannelCreate}
                title={projectContext ? `Add Channel to "${projectContext.name}"` : "Create Channel"}
            />

            {/* ── InviteToChannelModal ── */}
            <InviteToChannelModal
                visible={inviteModalVisible}
                roomId={createdRoomRef.current?._id ?? ""}
                members={currentChannelMembers}
                currentUserId={currentUserId}
                roomCreator={roomCreator}
                callerPermission={callerPermission}
                initialEmails={pendingInviteUsers
                    .map((u) => u.email)
                    .filter((e): e is string => !!e)}
                onClose={() => {
                    setInviteModalVisible(false);
                    createdRoomRef.current = null;
                    setPendingInviteUsers([]);
                }}
                onInvite={handleChannelInvite}
                onGenerateLink={handleGenerateChannelLink}
                onUpdatePermission={handleUpdateChannelPermission}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "#fff",
    },
    safe: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 8,
        paddingBottom: 80,
    },

    // ── Chips ──
    chipsContainer: {
        paddingHorizontal: 16,
        gap: 5,
        marginBottom: 16,
    },
    chipButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F4F4F4",
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        position: "relative",
    },
    chipButtonActive: {
        backgroundColor: "#1D1D1D",
    },
    chipText: {
        fontSize: 12,
        fontFamily: "SF_Pro_Semibold",
        color: "#1D1D1D",
    },
    chipTextActive: {
        color: "#fff",
    },
    verticalDivider: {
        width: 1.5,
        height: 33,
        backgroundColor: "#F4F4F4",
        marginLeft: 7,
        marginRight: 3,
    },
    unreadDot: {
        position: "absolute",
        top: -1,
        right: -3,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#00DEAB",
        borderWidth: 1.5,
        borderColor: "#fff",
    },
    unreadDotActive: {
        borderColor: "#1D1D1D",
    },

    // ── Chat List ──
    chatListContainer: {
        flex: 1,
    },
    chatRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    chatRowSelected: {
        backgroundColor: "#F4F4F4",
        marginHorizontal: 3,
    },
    avatarContainer: {
        position: "relative",
        marginRight: 12,
    },
    avatarBox: {
        width: 36,
        height: 36,
        borderRadius: 5,
        backgroundColor: "#00DEAB",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarText: {
        color: "#fff",
        fontSize: 15,
        fontFamily: "SF_Pro_Medium",
    },
    onlineIndicator: {
        position: "absolute",
        top: -2,
        right: -2,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#00DEAB",
        borderWidth: 1.5,
        borderColor: "#fff",
    },
    chatInfo: {
        flex: 1,
        justifyContent: "center",
        gap: 2,
    },
    chatName: {
        fontSize: 15,
        fontFamily: "SF_Pro_Semibold",
        color: "#1D1D1D",
    },
    chatSnippet: {
        fontSize: 13,
        fontFamily: "SF_Pro_Regular",
        color: "#4B5563",
    },
    chatMeta: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 10,
        minWidth: 80,
    },
    chatTime: {
        fontSize: 11,
        fontFamily: "SF_Pro_Medium",
        color: "#9CA3AF",
    },
    unreadBubble: {
        backgroundColor: "#1D1D1D",
        borderRadius: 15,
        paddingHorizontal: 6,
        paddingVertical: 6,
        alignItems: "center",
        justifyContent: "center",
    },
    unreadBubbleText: {
        color: "#0DDFAB",
        fontSize: 10,
        fontFamily: "SF_Pro_Semibold",
    },

    // ── Empty state ──
    workspaceContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 100,
        paddingHorizontal: 24,
    },
    iconStack: {
        position: "relative",
        marginBottom: 16,
    },
    workspaceTitle: {
        fontSize: 22,
        fontFamily: "SF_Pro_Regular",
        color: "#1D1D1D",
        marginBottom: 8,
        textAlign: "center",
    },
    workspaceDescription: {
        fontSize: 12,
        fontFamily: "SF_Pro_Regular",
        color: "#4B5563",
        textAlign: "center",
        lineHeight: 20,
        marginBottom: 24,
    },
    addPeopleButton: {
        flexDirection: "row",
        justifyContent: "center",
        minWidth: 200,
        alignItems: "center",
        backgroundColor: "#00DEAB",
        borderRadius: 8,
        paddingVertical: 12,
        shadowColor: "#00DEAB",
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    buttonIcon: {
        marginRight: 8,
    },
    addPeopleText: {
        color: "#fff",
        fontSize: 14,
        fontFamily: "SF_Pro_Semibold",
    },

    // ── FAB ──
    fab: {
        position: "absolute",
        bottom: 100,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: "#00DEAB",
        alignItems: "center",
        justifyContent: "center",
        // shadowColor: "#00DEAB",
        // shadowOpacity: 0.3,
        // shadowRadius: 8,
        // shadowOffset: { width: 0, height: 4 },
        // elevation: 6,
    },
    channelsContainer: {
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#F4F4F4",
    },
    channelRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 16,
        paddingRight: 16,
        paddingVertical: 10,
        backgroundColor: "#fff",
    },
    channelRowActive: {
        backgroundColor: "#F4F4F4",
        marginHorizontal: 3,
        borderRadius: 6,
    },
    channelName: {
        fontSize: 15,
        fontFamily: "SF_Pro_Semibold",
        color: "#1D1D1D",
    },
    subAvatarContainer: {
        position: "relative",
        marginRight: 12,
    },
    subAvatarBox: {
        width: 36,
        height: 36,
        borderRadius: 5,
        backgroundColor: "#00DEAB",
        alignItems: "center",
        justifyContent: "center",
    },
    subAvatarText: {
        color: "#fff",
        fontSize: 15,
        fontFamily: "SF_Pro_Medium",
    },
    channelInfo: {
        flex: 1,
        justifyContent: "center",
        gap: 2,
    },
    channelSnippet: {
        fontSize: 13,
        fontFamily: "SF_Pro_Regular",
        color: "#4B5563",
    },
});
