/**
 * InviteToChannelModal.tsx
 *
 * Full "Invite to Channel" flow matching the mockup:
 *
 * - Email address input (comma-separated or single)
 * - Permission/access badge dropdown (defaults to "Comment")
 * - Invite button
 * - Generate link section: "All Users" | "Selected Users Only"
 * - Copyable invite-link box
 * - "Who has access" list showing current members and their permission level
 *
 * Permission options (from the mockup):
 *   Full edit | Edit | Comment (default) | View Only
 *
 * APIs used:
 *   POST /chat/invite            → inviteUser(roomId, email, userId?, permission)
 *   POST /chat/generate-link     → generateLink(roomId, permission, allowedUserIds?)
 *   POST /chat/update-permission → updatePermission(roomId, userId, permission)
 *   GET  /chat/room-permissions/:roomId → getRoomPermissions(roomId)
 */

import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { showSuccess, showError, showInfo } from "@/utils/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChannelPermission = "Full edit" | "Edit" | "Comment" | "View Only";

const PERMISSION_OPTIONS: {
  value: ChannelPermission;
  label: string;
  description: string;
}[] = [
  {
    value: "Full edit",
    label: "Full edit",
    description:
      "Can add people, create post types, send messages, and manage the channel.",
  },
  {
    value: "Edit",
    label: "Edit",
    description:
      "Can create post types and send messages. Can't add people to the channel.",
  },
  {
    value: "Comment",
    label: "Comment",
    description:
      "Can send messages using existing post types. Can't create new post types or add people.",
  },
  {
    value: "View Only",
    label: "View Only",
    description:
      "Read only. Can view messages but cannot send or interact.",
  },
];

export interface ChannelMember {
  id: number;
  name: string;
  initials?: string;
  permission?: ChannelPermission | string;
  isOwner?: boolean;
}

export interface InviteToChannelModalProps {
  visible: boolean;
  roomId: string;
  /** Existing channel members (to show in "Who has access") */
  members: ChannelMember[];
  /** Current user's id — used to derive "Owner" label */
  currentUserId: number;
  onClose: () => void;
  /** Called when the invite button is pressed */
  onInvite: (
    emails: string[],
    permission: ChannelPermission
  ) => Promise<void>;
  /** Called when "Generate Link" needs to create/refresh the link */
  onGenerateLink: (
    permission: ChannelPermission,
    forAllUsers: boolean
  ) => Promise<string | null>;
  /** Called when a member's permission is changed from "Who has access" */
  onUpdatePermission?: (
    memberId: number,
    permission: ChannelPermission
  ) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitial(name: string) {
  return (name ?? "?").trim().charAt(0).toUpperCase();
}

function avatarColor(name: string): string {
  const COLORS = ["#00DEAB", "#1ED9A5", "#12C298", "#0BC5A8", "#05B89B"];
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

// ─── Permission Dropdown Popover ──────────────────────────────────────────────

interface PermissionDropdownProps {
  value: ChannelPermission;
  onChange: (p: ChannelPermission) => void;
  /** compact = used inline in the email row */
  compact?: boolean;
}

function PermissionDropdown({
  value,
  onChange,
  compact = false,
}: PermissionDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ position: "relative", zIndex: 100 }}>
      <TouchableOpacity
        style={[perm.badge, compact && perm.badgeCompact]}
        activeOpacity={0.8}
        onPress={() => setOpen((v) => !v)}
      >
        <Text style={[perm.badgeText, compact && perm.badgeTextCompact]}>
          {value}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={compact ? 12 : 14}
          color="#fff"
          style={{ marginLeft: 3 }}
        />
      </TouchableOpacity>

      {open && (
        <View style={perm.menu}>
          {PERMISSION_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={perm.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={perm.menuItemTitle}>{opt.label}</Text>
                  {opt.value === value && (
                    <Ionicons name="checkmark" size={14} color="#00DEAB" />
                  )}
                </View>
                <Text style={perm.menuItemDesc}>{opt.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const perm = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1D1D1D",
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  badgeCompact: {
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "SF_Pro_Semibold",
  },
  badgeTextCompact: {
    fontSize: 13,
  },
  menu: {
    position: "absolute",
    top: 38,
    right: 0,
    width: 260,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    zIndex: 200,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuItemTitle: {
    fontSize: 14,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  menuItemDesc: {
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 17,
  },
});

// ─── Link Type Toggle ─────────────────────────────────────────────────────────

interface LinkTypeToggleProps {
  forAll: boolean;
  onChange: (v: boolean) => void;
}

function LinkTypeToggle({ forAll, onChange }: LinkTypeToggleProps) {
  return (
    <View style={lt.container}>
      <TouchableOpacity
        style={[lt.card, forAll && lt.cardActive]}
        activeOpacity={0.7}
        onPress={() => onChange(true)}
      >
        <View style={[lt.radio, forAll && lt.radioActive]}>
          {forAll && <View style={lt.radioDot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[lt.label, forAll && lt.labelActive]}>All Users</Text>
          <Text style={lt.sub}>Anyone with this link can join</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[lt.card, !forAll && lt.cardActive]}
        activeOpacity={0.7}
        onPress={() => onChange(false)}
      >
        <View style={[lt.radio, !forAll && lt.radioActive]}>
          {!forAll && <View style={lt.radioDot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[lt.label, !forAll && lt.labelActive]}>
            Selected Users Only
          </Text>
          <Text style={lt.sub}>Only chosen users can use this link</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const lt = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  cardActive: {
    borderColor: "#00DEAB",
    backgroundColor: "#F0FDF9",
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  radioActive: {
    borderColor: "#00DEAB",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00DEAB",
  },
  label: {
    fontSize: 13,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  labelActive: {
    color: "#00DEAB",
  },
  sub: {
    fontSize: 11,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 16,
  },
});

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function InviteToChannelModal({
  visible,
  roomId,
  members,
  currentUserId,
  onClose,
  onInvite,
  onGenerateLink,
  onUpdatePermission,
}: InviteToChannelModalProps) {
  const [emailInput, setEmailInput] = useState("");
  const [permission, setPermission] = useState<ChannelPermission>("Comment");
  const [forAllUsers, setForAllUsers] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [memberPerms, setMemberPerms] =
    useState<Record<number, ChannelPermission>>({});

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setEmailInput("");
      setPermission("Comment");
      setForAllUsers(true);
      setInviteLink(null);
    }
  }, [visible]);

  // Generate link when link-type changes
  const handleGenerateLink = useCallback(async () => {
    setGeneratingLink(true);
    try {
      const link = await onGenerateLink(permission, forAllUsers);
      setInviteLink(link);
    } catch {
      showError("Link Error", "Could not generate invite link.");
    } finally {
      setGeneratingLink(false);
    }
  }, [permission, forAllUsers, onGenerateLink]);

  useEffect(() => {
    if (visible) {
      handleGenerateLink();
    }
  }, [visible, forAllUsers, handleGenerateLink]);

  const handleInvite = async () => {
    const trimmed = emailInput.trim();
    if (!trimmed) {
      showInfo("Validation", "Please enter at least one email address.");
      return;
    }
    const emails = trimmed
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;

    setInviting(true);
    try {
      await onInvite(emails, permission);
      setEmailInput("");
      showSuccess("Invite Sent", `Invitation sent to ${emails.length} user(s).`);
    } catch {
      showError("Invite Error", "Failed to send invitation. Please try again.");
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await Clipboard.setStringAsync(inviteLink);
      showSuccess("Copied", "Invite link copied to clipboard.");
    } catch {
      showInfo("Copy", "Could not copy link.");
    }
  };

  const handleMemberPermChange = async (
    memberId: number,
    newPerm: ChannelPermission
  ) => {
    if (!onUpdatePermission) return;
    try {
      await onUpdatePermission(memberId, newPerm);
      setMemberPerms((prev) => ({ ...prev, [memberId]: newPerm }));
    } catch {
      showError("Update Error", "Could not update permission.");
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
      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
        <View style={modal.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}
          >
            <View style={modal.sheet}>
              {/* Header */}
              <View style={modal.header}>
                <Text style={modal.title}>Invite to Channel</Text>
                <TouchableOpacity
                  style={modal.closeBtn}
                  onPress={onClose}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* ── Email + Permission row ── */}
                <View style={modal.emailRow}>
                  <View style={modal.emailInputWrap}>
                    <Text style={modal.floatLabel}>Email Address</Text>
                    <TextInput
                      style={modal.emailInput}
                      value={emailInput}
                      onChangeText={setEmailInput}
                      placeholder="email@example.com"
                      placeholderTextColor="#C4C4C4"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                    />
                  </View>
                  <PermissionDropdown
                    value={permission}
                    onChange={setPermission}
                    compact
                  />
                  <TouchableOpacity
                    style={[modal.inviteBtn, inviting && { opacity: 0.7 }]}
                    activeOpacity={0.85}
                    onPress={handleInvite}
                    disabled={inviting}
                  >
                    {inviting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={modal.inviteBtnText}>Invite</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* ── Generate Link For ── */}
                <Text style={modal.sectionLabel}>GENERATE LINK FOR</Text>
                <LinkTypeToggle forAll={forAllUsers} onChange={setForAllUsers} />

                {/* ── Invite Link ── */}
                <View style={modal.linkRow}>
                  {generatingLink ? (
                    <ActivityIndicator color="#00DEAB" style={{ marginRight: 10 }} />
                  ) : null}
                  <Text
                    style={modal.linkText}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {inviteLink ?? "Generating…"}
                  </Text>
                  <TouchableOpacity
                    style={modal.copyBtn}
                    onPress={handleCopyLink}
                    activeOpacity={0.7}
                    disabled={!inviteLink}
                  >
                    <Text style={modal.copyBtnText}>Copy</Text>
                  </TouchableOpacity>
                </View>

                {/* ── Who Has Access ── */}
                <Text style={[modal.sectionLabel, { marginTop: 20 }]}>
                  Who has access
                </Text>
                {members.map((member) => {
                  const isOwner =
                    member.isOwner || member.id === currentUserId;
                  const currentPerm =
                    memberPerms[member.id] ??
                    (member.permission as ChannelPermission) ??
                    "Comment";
                  const initial = member.initials ?? getInitial(member.name);
                  const bg = avatarColor(member.name);

                  return (
                    <View key={member.id} style={modal.memberRow}>
                      <View style={[modal.memberAvatar, { backgroundColor: bg }]}>
                        <Text style={modal.memberInitial}>{initial}</Text>
                      </View>
                      <Text style={modal.memberName} numberOfLines={1}>
                        {member.name}
                      </Text>
                      {isOwner ? (
                        <Text style={modal.ownerTag}>Owner</Text>
                      ) : onUpdatePermission ? (
                        <PermissionDropdown
                          value={currentPerm as ChannelPermission}
                          onChange={(p) => handleMemberPermChange(member.id, p)}
                          compact
                        />
                      ) : (
                        <Text style={modal.permTag}>{currentPerm}</Text>
                      )}
                    </View>
                  );
                })}

                {/* Bottom padding */}
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "100%",
    maxHeight: "90%",
    paddingTop: 22,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  // Email row
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  emailInputWrap: {
    flex: 1,
    borderWidth: 1.3,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    position: "relative",
  },
  floatLabel: {
    position: "absolute",
    top: -8,
    left: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 3,
    fontSize: 11,
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
    zIndex: 1,
  },
  emailInput: {
    fontSize: 13,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    padding: 0,
    minHeight: 22,
  },
  inviteBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "SF_Pro_Semibold",
  },
  // Sections
  sectionLabel: {
    fontSize: 11,
    fontFamily: "SF_Pro_Semibold",
    color: "#9CA3AF",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  // Link row
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
    marginBottom: 4,
  },
  linkText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    marginRight: 8,
  },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  copyBtnText: {
    fontSize: 12,
    fontFamily: "SF_Pro_Semibold",
    color: "#374151",
  },
  // Members
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    gap: 12,
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  memberInitial: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "SF_Pro_Semibold",
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  ownerTag: {
    fontSize: 13,
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },
  permTag: {
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
});
