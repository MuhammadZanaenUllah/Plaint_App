import { rf } from "@/utils/responsive";
import AddPeopleModal from "@/components/AddPeopleModal";
import Avatar from "@/components/Avatar";
import CreateChannelModal from "@/components/CreateChannelModal";
import CreateProjectModal from "@/components/CreateProjectModal";
import ProjectDetailModal from "@/components/ProjectDetailModal";
import InviteToChannelModal, { type ChannelPermission, type ChannelMember } from "@/components/InviteToChannelModal";
import Icons from "@/constants/icons";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useProjects } from "@/hooks/useProjects";
import { useSearch } from "@/context/SearchContext";
import { useTasks } from "@/hooks/useTasks";
import { Project } from "@/types/project.types";
import { Room } from "@/types/chat.types";
import {
    filterReadRooms,
    filterRoomsByType,
    filterUnreadRooms,
    formatChatListTime,
    getRoomAvatar,
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
import { canCreateChannel, canCreateProject, canViewChat, canViewProjects } from "@/utils/permissions";
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
    const { state: projectState, fetchProjects } = useProjects();
    const { searchText } = useSearch();
    const { state: taskState } = useTasks();
    const currentUserId = authState?.state?.user?.id ?? 0;
    const currentUser = authState?.state?.user ?? null;

    // Module-level permissions (from login `user_permissions`). These drive
    // which tabs/rooms are visible and which create actions are offered.
    const perms = useMemo(
        () => ({
            hasChatRead: canViewChat(currentUser),
            hasProjectRead: canViewProjects(currentUser),
            canCreateChannels: canCreateChannel(currentUser),
            canCreateProjects: canCreateProject(currentUser),
        }),
        [currentUser]
    );

    // Only rooms the user is permitted to see:
    // - 1:1 DMs + channels require `chat-list`
    // - project group chats require `project-list`
    // (Project child channels are `type:"channel"` and still require chat-list.)
    const visibleRooms = useMemo(() => {
        const rooms = state.rooms ?? [];
        return rooms.filter((r) => {
            if (r.type === "project") return perms.hasProjectRead;
            return perms.hasChatRead;
        });
    }, [state.rooms, perms]);

    // Hide the Channels/Projects chips entirely when the user lacks the
    // corresponding read permission (they'd render empty otherwise).
    const visibleChips = useMemo(
        () =>
            CHIP_DATA.filter((chip) => {
                if (chip.id === "channels") return perms.hasChatRead;
                if (chip.id === "projects") return perms.hasProjectRead;
                return true;
            }),
        [perms]
    );

    const [addPeopleOpen, setAddPeopleOpen] = useState(false);
    const [addPeopleQuery, setAddPeopleQuery] = useState("");
    const [createChannelOpen, setCreateChannelOpen] = useState(false);
    const [createProjectOpen, setCreateProjectOpen] = useState(false);
    const [isChannelMode, setIsChannelMode] = useState(false);
    const [activeChip, setActiveChip] = useState("all");
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [selectedChannelKey, setSelectedChannelKey] = useState<string | null>(null);
    const [newChannelName, setNewChannelName] = useState("");
    // Track which project we're adding a channel to (null = standalone channel)
    const [projectContext, setProjectContext] = useState<Room | null>(null);
    // Track expanded projects in the Projects chip view
    const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
    // Track selected project for ProjectDetailModal
    const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<Project | null>(null);

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
        for (const room of visibleRooms) {
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
    }, [visibleRooms, taskState?.taskOwners, currentUserId]);

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
        const rooms = visibleRooms;
        const directRooms = rooms.filter((r) => r.type === "direct");
        const hasUnread = (rms: Room[]) => rms.some((r) => r.unreadCount > 0 || r.force_unread);
        return {
            all: hasUnread(directRooms),
            unread: hasUnread(directRooms),
            read: false,
            channels: hasUnread(rooms.filter((r) => r.type === "channel")),
            // projects: hasUnread(rooms.filter((r) => r.type === "project")),
        };
    }, [visibleRooms]);

    // Categorize rooms based on active chip
    const displayRooms = useMemo(() => {
        const rooms = visibleRooms;
        // All, Unread, Read → show only direct (inbox) messages, not channels/projects
        const directRooms = rooms.filter((r) => r.type === "direct");

        let base: Room[];
        switch (activeChip) {
            case "channels":
                base = filterRoomsByType(rooms, "channel");
                break;
            case "projects":
                base = filterRoomsByType(rooms, "project");
                break;
            case "unread":
                base = filterUnreadRooms(directRooms);
                break;
            case "read":
                base = filterReadRooms(directRooms);
                break;
            case "all":
            default:
                base = directRooms;
                break;
        }

        // Text search from the header search bar — matches the room name, the
        // other member's name/email for DMs, and the last message preview.
        const query = searchText.trim().toLowerCase();
        if (!query) return base;
        return base.filter((room) => {
            const displayName = getRoomDisplayName(room, currentUserId).toLowerCase();
            const otherMember = room.type === "direct"
                ? room.members.find((m) => m.id !== currentUserId)
                : null;
            const memberName = otherMember
                ? `${otherMember.first_name} ${otherMember.last_name}`.toLowerCase()
                : "";
            const memberEmail = otherMember?.email?.toLowerCase() ?? "";
            const preview = room.last_message?.text?.toLowerCase() ?? "";
            return (
                displayName.includes(query) ||
                memberName.includes(query) ||
                memberEmail.includes(query) ||
                preview.includes(query)
            );
        });
    }, [visibleRooms, activeChip, searchText, currentUserId]);

    // Group channels by their parent project for the Projects view
    const projectChannelMap = useMemo(() => {
        const map = new Map<number, Room[]>();
        for (const room of visibleRooms) {
            if (room.type === "channel" && room.parent_id) {
                const existing = map.get(room.parent_id) ?? [];
                existing.push(room);
                map.set(room.parent_id, existing);
            }
        }
        return map;
    }, [visibleRooms]);

    // Enrich project rows with status / due date from GET /projects (matched by
    // room display name — the project's group-chat room shares its name).
    const projectMetaByName = useMemo(() => {
        const map = new Map<string, Project>();
        for (const p of projectState.projects ?? []) {
            map.set(p.name, p);
        }
        return map;
    }, [projectState.projects]);

    // Keep the Projects chip's status/due-date enrichment fresh whenever it is
    // being viewed (silent — no full-screen loading state).
    useEffect(() => {
        if (activeChip === "projects" && perms.hasProjectRead) {
            fetchProjects({ silent: true }).catch(() => { });
        }
    }, [activeChip, perms.hasProjectRead, fetchProjects]);

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
            if (!perms.canCreateChannels) {
                showError(
                    "Permission Denied",
                    "You don't have permission to create channels."
                );
                return;
            }
            setProjectContext(project);
            setCreateChannelOpen(true);
        },
        [perms.canCreateChannels]
    );

    // Handler invoked after a project is successfully created. The project's
    // group-chat room is auto-created server-side — refresh rooms immediately
    // and let the `project_update` socket merge (ChatContext) back it up.
    const handleProjectCreated = useCallback(
        async (project: Project) => {
            setCreateProjectOpen(false);
            fetchRooms().catch(() => { });
            fetchProjects({ silent: true }).catch(() => { });
            showSuccess("Project Created", `"${project.name}" is ready.`);
        },
        [fetchRooms, fetchProjects]
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
                        {visibleChips.map((chip, index) => {
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
                                    const meta = projectMetaByName.get(displayName);
                                    const metaSnippet = `${childChannels.length} ${childChannels.length === 1 ? "channel" : "channels"}`;
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
                                                    <Avatar
                                                        name={displayName}
                                                        imagePath={getRoomAvatar(project, currentUserId)}
                                                        size={34}
                                                        borderRadius={5}
                                                        fontSize={13.5}
                                                        fontFamily="SF_Pro_Medium"
                                                    />
                                                    {unread && (
                                                        <View style={styles.onlineIndicator} />
                                                    )}
                                                </View>
                                                <View style={styles.chatInfo}>
                                                    <Text style={styles.chatName} numberOfLines={1}>
                                                        {displayName}
                                                    </Text>
                                                    <Text style={styles.chatSnippet} numberOfLines={1}>
                                                        {metaSnippet}
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
                                                                const proj = meta ?? {
                                                                    id: project.id,
                                                                    name: displayName,
                                                                    status: "Planning",
                                                                };
                                                                setSelectedProjectForDetail(proj);
                                                            }}
                                                        >
                                                            <Ionicons name="folder-outline" size={18} color="#00DEAB" />
                                                        </TouchableOpacity>
                                                        {perms.canCreateChannels && (
                                                            <TouchableOpacity
                                                                activeOpacity={0.7}
                                                                style={{ padding: 4 }}
                                                                onPress={(e) => {
                                                                    e.stopPropagation();
                                                                    handleProjectAddChannel(project);
                                                                }}
                                                            >
                                                                <Ionicons name="add-circle-sharp" size={18} color="#1D1D1D" />
                                                            </TouchableOpacity>
                                                        )}
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
                                                                size={18}
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
                                                                    { paddingLeft: 38, backgroundColor: "#fff" },
                                                                    isChannelActive && styles.chatRowSelected,
                                                                ]}
                                                                activeOpacity={0.7}
                                                                onPress={() => handleRoomPress(channel)}
                                                            >
                                                                <View style={styles.avatarContainer}>
                                                                    <Avatar
                                                                        name={channelName}
                                                                        imagePath={getRoomAvatar(channel, currentUserId)}
                                                                        size={28}
                                                                        borderRadius={5}
                                                                        fontSize={11.5}
                                                                        fontFamily="SF_Pro_Medium"
                                                                    />
                                                                    {channelUnread && (
                                                                        <View style={styles.onlineIndicator} />
                                                                    )}
                                                                </View>
                                                                <View style={styles.channelInfo}>
                                                                    <Text style={styles.channelName} numberOfLines={1}>
                                                                        {channelName}
                                                                    </Text>
                                                                    <Text style={styles.channelSnippet} numberOfLines={1}>
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
                                                <Avatar
                                                    name={displayName}
                                                    imagePath={getRoomAvatar(room, currentUserId)}
                                                    size={34}
                                                    borderRadius={5}
                                                    fontSize={13.5}
                                                    fontFamily="SF_Pro_Medium"
                                                />
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
                    ) : searchText.trim() !== "" ? (
                        <View style={styles.workspaceContainer}>
                            <View style={styles.iconStack}>
                                <Ionicons name="search-outline" size={48} color="#00DEAB" />
                            </View>
                            <Text style={styles.workspaceTitle}>No Results</Text>
                            <Text style={styles.workspaceDescription}>
                                No chats or channels match{"\n"}
                                "{searchText.trim()}"
                            </Text>
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
                            {perms.canCreateChannels ? (
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
                            ) : (
                                <Text style={styles.workspaceDescription}>
                                    You don't have permission to create channels.
                                </Text>
                            )}
                        </View>
                    ) : activeChip === "projects" ? (
                        <View style={styles.workspaceContainer}>
                            <View style={styles.iconStack}>
                                <Ionicons name="folder-outline" size={48} color="#00DEAB" />
                            </View>
                            <Text style={styles.workspaceTitle}>Create a project</Text>
                            <Text style={styles.workspaceDescription}>
                                Organize channels, conversations,{"\n"}and deliverables around a shared goal.
                            </Text>
                            {perms.canCreateProjects ? (
                                <TouchableOpacity
                                    style={styles.addPeopleButton}
                                    activeOpacity={0.85}
                                    onPress={() => setCreateProjectOpen(true)}
                                >
                                    <Text style={styles.addPeopleText}>+ Create Project</Text>
                                </TouchableOpacity>
                            ) : (
                                <Text style={styles.workspaceDescription}>
                                    You don't have permission to create projects.
                                </Text>
                            )}
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
                            {perms.hasChatRead ? (
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
                            ) : (
                                <Text style={styles.workspaceDescription}>
                                    You don't have permission to view chats.
                                </Text>
                            )}
                        </View>
                    )}
                </ScrollView>

                {/* FAB — hidden when the active view offers no permitted action */}
                {displayRooms.length > 0 &&
                    (activeChip === "projects"
                        ? perms.canCreateProjects
                        : activeChip === "channels"
                            ? perms.canCreateChannels
                            : perms.hasChatRead) && (
                        <TouchableOpacity
                            style={styles.fab}
                            activeOpacity={0.8}
                            onPress={() => {
                                if (activeChip === "projects") {
                                    setCreateProjectOpen(true);
                                } else if (activeChip === "channels") {
                                    setProjectContext(null);
                                    setCreateChannelOpen(true);
                                } else {
                                    setIsChannelMode(false);
                                    setAddPeopleOpen(true);
                                }
                            }}
                        >
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

            {/* ── CreateProjectModal ── */}
            <CreateProjectModal
                visible={createProjectOpen}
                onClose={() => setCreateProjectOpen(false)}
                onCreated={handleProjectCreated}
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

            {/* ── ProjectDetailModal ── */}
            <ProjectDetailModal
                visible={!!selectedProjectForDetail}
                project={selectedProjectForDetail}
                onClose={() => setSelectedProjectForDetail(null)}
                onProjectUpdated={() => {
                    fetchProjects({ silent: true }).catch(() => {});
                    fetchRooms().catch(() => {});
                }}
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
        marginBottom: 14,
    },
    chipButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F4F4F4",
        borderRadius: 6,
        paddingHorizontal: 11,
        paddingVertical: 7,
        position: "relative",
    },
    chipButtonActive: {
        backgroundColor: "#1D1D1D",
    },
    chipText: {
        fontSize: rf(11.5),
        fontFamily: "SF_Pro_Medium",
        color: "#1D1D1D",
    },
    chipTextActive: {
        color: "#fff",
        fontFamily: "SF_Pro_Semibold",
    },
    verticalDivider: {
        width: 1.5,
        height: 28,
        backgroundColor: "#F4F4F4",
        marginLeft: 6,
        marginRight: 2,
    },
    unreadDot: {
        position: "absolute",
        top: -1,
        right: -3,
        width: 7,
        height: 7,
        borderRadius: 3.5,
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
        paddingVertical: 10,
    },
    chatRowSelected: {
        backgroundColor: "#F4F4F4",
        marginHorizontal: 3,
    },
    avatarContainer: {
        position: "relative",
        marginRight: 11,
    },
    avatarBox: {
        width: 34,
        height: 34,
        borderRadius: 5,
        backgroundColor: "#00DEAB",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarText: {
        color: "#fff",
        fontSize: rf(13.5),
        fontFamily: "SF_Pro_Medium",
    },
    onlineIndicator: {
        position: "absolute",
        top: -2,
        right: -2,
        width: 9,
        height: 9,
        borderRadius: 4.5,
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
        fontSize: rf(13.5),
        fontFamily: "SF_Pro_Semibold",
        color: "#1D1D1D",
    },
    chatSnippet: {
        fontSize: rf(12),
        fontFamily: "SF_Pro_Regular",
        color: "#4B5563",
    },
    chatMeta: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        minWidth: 72,
    },
    chatTime: {
        fontSize: rf(10.5),
        fontFamily: "SF_Pro_Regular",
        color: "#9CA3AF",
    },
    unreadBubble: {
        backgroundColor: "#1D1D1D",
        borderRadius: 12,
        paddingHorizontal: 5,
        paddingVertical: 3,
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
    },
    unreadBubbleText: {
        color: "#0DDFAB",
        fontSize: rf(9.5),
        fontFamily: "SF_Pro_Semibold",
    },

    // ── Empty state ──
    workspaceContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 80,
        paddingHorizontal: 24,
    },
    iconStack: {
        position: "relative",
        marginBottom: 14,
    },
    workspaceTitle: {
        fontSize: rf(18),
        fontFamily: "SF_Pro_Semibold",
        color: "#1D1D1D",
        marginBottom: 6,
        textAlign: "center",
    },
    workspaceDescription: {
        fontSize: rf(12),
        fontFamily: "SF_Pro_Regular",
        color: "#4B5563",
        textAlign: "center",
        lineHeight: 18,
        marginBottom: 20,
    },
    addPeopleButton: {
        flexDirection: "row",
        justifyContent: "center",
        minWidth: 180,
        alignItems: "center",
        backgroundColor: "#00DEAB",
        borderRadius: 8,
        paddingVertical: 10,
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
        fontSize: rf(13),
        fontFamily: "SF_Pro_Semibold",
    },

    // ── FAB ──
    fab: {
        position: "absolute",
        bottom: 92,
        right: 20,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: "#00DEAB",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 6,
        zIndex: 99,
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
        paddingVertical: 8,
        backgroundColor: "#fff",
    },
    channelRowActive: {
        backgroundColor: "#F4F4F4",
        marginHorizontal: 3,
        borderRadius: 6,
    },
    channelName: {
        fontSize: rf(12.5),
        fontFamily: "SF_Pro_Medium",
        color: "#1D1D1D",
    },
    subAvatarContainer: {
        position: "relative",
        marginRight: 10,
    },
    subAvatarBox: {
        width: 28,
        height: 28,
        borderRadius: 5,
        backgroundColor: "#00DEAB",
        alignItems: "center",
        justifyContent: "center",
    },
    subAvatarText: {
        color: "#fff",
        fontSize: rf(11.5),
        fontFamily: "SF_Pro_Medium",
    },
    channelInfo: {
        flex: 1,
        justifyContent: "center",
        gap: 1.5,
    },
    channelSnippet: {
        fontSize: rf(11.5),
        fontFamily: "SF_Pro_Regular",
        color: "#4B5563",
    },
});
