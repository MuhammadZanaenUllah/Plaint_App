import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Reanimated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";
import SheetDragHandle from "./SheetDragHandle";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddPeopleUser {
  id: string;
  name: string;
  email?: string;
  /** Optional: pre-computed initials. Falls back to first letter of name. */
  initials?: string;
}

export interface AddPeopleModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Full list of users to search through */
  users: AddPeopleUser[];
  /** Called when the modal should be closed */
  onClose: () => void;
  /** Called whenever the search query changes */
  onSearch?: (query: string) => void;
  /** Called when a single user is tapped (for normal chat mode) */
  onSelectUser?: (user: AddPeopleUser) => void;
  /** Called when inviting multiple users (for channel mode) */
  onInviteUsers?: (users: AddPeopleUser[]) => void;
  /** True if we are in channel mode (showing checkboxes and Invite button) */
  isChannelMode?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string, override?: string): string {
  if (override) return override.charAt(0).toUpperCase();
  return name.trim().charAt(0).toUpperCase();
}

/** Deterministic avatar background color from name */
const AVATAR_COLORS = ["#00DEAB", "#1ED9A5", "#12C298", "#0BC5A8", "#05B89B"];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Floating Label Search Input ──────────────────────────────────────────────

interface FloatingSearchProps {
  value: string;
  onChangeText: (t: string) => void;
}

function FloatingSearchInput({ value, onChangeText }: FloatingSearchProps) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const animate = (to: number) =>
    Animated.timing(anim, {
      toValue: to,
      duration: 180,
      useNativeDriver: false,
    }).start();

  const handleFocus = () => {
    animate(1);
    setFocused(true);
  };
  const handleBlur = () => {
    if (!value) animate(0);
    setFocused(false);
  };

  const labelTop = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [13, -10],
  });
  const labelSize = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 11],
  });
  const activeColor = "#1D1D1D";
  const labelColor = focused || value ? activeColor : "#A0A0A0";
  const borderColor = focused ? "#1D1D1D" : "#D1D5DB";

  return (
    <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
      <View style={[searchStyles.wrapper, { borderColor }]}>
      {/* Floating label */}
        <Animated.Text
          style={[
            searchStyles.label,
            {
              top: labelTop,
              fontSize: labelSize,
              color: labelColor,
            },
          ]}
        >
          Search people
        </Animated.Text>
        {/* Text input */}
        <TextInput
          ref={inputRef}
          style={searchStyles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {/* Search icon */}
        <Ionicons
          name="search-outline"
          size={19}
          color={focused || value ? "#1D1D1D" : "#9CA3AF"}
          style={searchStyles.icon}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const searchStyles = StyleSheet.create({
  wrapper: {
    borderWidth: 1.3,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 15,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    height: 45,
    position: "relative",
  },
  label: {
    position: "absolute",
    left: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 3,
    fontFamily: "SF_Pro_Regular",
    zIndex: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    paddingVertical: 0,
    paddingRight: 30,
    height: "100%",
  },
  icon: {
    position: "absolute",
    right: 14,
  },
});

// ─── User Row ─────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: AddPeopleUser;
  onPress: () => void;
  isChannelMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function UserRow({
  user,
  onPress,
  isChannelMode,
  isSelected,
  onToggleSelect,
}: UserRowProps) {
  const initials = getInitials(user.name, user.initials);
  const bgColor = avatarColor(user.name);

  return (
    <TouchableOpacity
      style={rowStyles.row}
      activeOpacity={0.65}
      onPress={isChannelMode ? onToggleSelect : onPress}
    >
      {/* Avatar */}
      <View
        style={[
          rowStyles.avatar,
          isChannelMode && isSelected && { backgroundColor: "#00DEAB" },
        ]}
      >
        <Text style={rowStyles.initials}>{initials}</Text>
      </View>

      {/* Name + email */}
      <View style={rowStyles.info}>
        <Text style={rowStyles.name} numberOfLines={1}>
          {user.name}
        </Text>
        {!!user.email && !isChannelMode && (
          <Text style={rowStyles.email} numberOfLines={1}>
            {user.email}
          </Text>
        )}
      </View>

      {isChannelMode && isSelected && (
        <Ionicons
          name="checkmark"
          size={20}
          color="#00DEAB"
          style={{ marginLeft: "auto" }}
        />
      )}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 6,
    gap: 14,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#00DEAB",
  },
  initials: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "SF_Pro_Regular",
    letterSpacing: 0.3,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  email: {
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
});

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptySearch() {
  return (
    <View style={emptyStyles.wrap}>
      <Ionicons name="search-outline" size={40} color="#D1D5DB" />
      <Text style={emptyStyles.text}>No users found</Text>
      <Text style={emptyStyles.sub}>Try a different name or email</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 24,
    gap: 8,
  },
  text: {
    fontSize: 15,
    fontFamily: "SF_Pro_Semibold",
    color: "#6B7280",
  },
  sub: {
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },
});

// ─── Main Modal Component ─────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function AddPeopleModal({
  visible,
  users,
  onClose,
  onSearch,
  onSelectUser,
  onInviteUsers,
  isChannelMode,
}: AddPeopleModalProps) {
  // Compensates KeyboardAvoidingView's padding for the home-indicator safe
  // area, otherwise that inset shows up as an empty gap above the keyboard.
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (visible) {
      setQuery("");
      setSelectedUserIds(new Set());
    }
  }, [visible]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardShown(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardShown(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const handleChangeText = (text: string) => {
    setQuery(text);
    onSearch?.(text);
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setQuery("");
    setSelectedUserIds(new Set());
    onClose();
  };

  const { panGesture, animatedStyle } = useSwipeToDismiss(visible, handleClose);

  const handleSelect = (user: AddPeopleUser) => {
    if (isChannelMode) {
      toggleSelect(user.id);
    } else {
      onSelectUser?.(user);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedUserIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedUserIds.size === filtered.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filtered.map((u) => u.id)));
    }
  };

  const handleInvite = () => {
    if (selectedUserIds.size === 0) return;
    const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));
    onInviteUsers?.(selectedUsers);
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Dimmed backdrop — tap to close */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={modalStyles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Bottom sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
        style={modalStyles.kavWrapper}
      >
        <Reanimated.View
          style={[
            modalStyles.sheet,
            {
              minHeight: SCREEN_HEIGHT * 0.5,
              maxHeight: SCREEN_HEIGHT * 0.88,
              paddingBottom: insets.bottom,
            },
            animatedStyle,
          ]}
        >
          {/* Drag handle + close button + title are the swipe-down-to-
              dismiss zone — the search input and FlatList below are left
              out so dragging doesn't fight typing or the list's scroll. */}
          <GestureDetector gesture={panGesture}>
            <View>
              <SheetDragHandle />
              <TouchableOpacity
                style={modalStyles.closeBtn}
                onPress={handleClose}
                activeOpacity={0.8}
                hitSlop={8}
              >
                <Ionicons name="close" size={17} color="#fff" />
              </TouchableOpacity>

              <Text style={modalStyles.title}>Add People</Text>
            </View>
          </GestureDetector>

          {/* ── Floating label search ── */}
          <FloatingSearchInput value={query} onChangeText={handleChangeText} />

          {/* ── Channel Mode: Select All ── */}
          {isChannelMode && (
            <View style={modalStyles.channelControls}>
              <TouchableOpacity
                style={modalStyles.selectAllRow}
                onPress={handleSelectAll}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    modalStyles.checkbox,
                    selectedUserIds.size === filtered.length &&
                      filtered.length > 0 &&
                      modalStyles.checkboxActive,
                  ]}
                >
                  {selectedUserIds.size === filtered.length &&
                    filtered.length > 0 && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                </View>
                <Text style={modalStyles.selectAllText}>Select All</Text>
              </TouchableOpacity>

              <View style={modalStyles.divider} />
            </View>
          )}

          {/* ── Results / empty states ── */}

          {filtered.length === 0 ? (
            <EmptySearch />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <UserRow
                  user={item}
                  onPress={() => handleSelect(item)}
                  isChannelMode={isChannelMode}
                  isSelected={selectedUserIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                />
              )}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={
                keyboardShown ? { maxHeight: SCREEN_HEIGHT * 0.4 } : undefined
              }
              contentContainerStyle={{ paddingBottom: 32 }}
            />
          )}

          {/* ── Channel Mode: Invite (bottom, primary action) ── */}
          {isChannelMode && (
            <TouchableOpacity
              style={[
                modalStyles.inviteBtn,
                selectedUserIds.size === 0 && modalStyles.inviteBtnDisabled,
              ]}
              activeOpacity={0.8}
              disabled={selectedUserIds.size === 0}
              onPress={handleInvite}
            >
              <Text style={modalStyles.inviteBtnText}>Invite</Text>
            </TouchableOpacity>
          )}
        </Reanimated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Modal Styles ─────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  kavWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 32,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  closeBtn: {
    position: "absolute",
    top: 18,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1D1D1D",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  title: {
    fontSize: 26,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    marginHorizontal: 20,
    marginBottom: 22,
  },
  channelControls: {
    marginHorizontal: 20,
    marginBottom: 10,
  },
  inviteBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  inviteBtnDisabled: {
    backgroundColor: "#A7E8D9",
  },
  inviteBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "SF_Pro_Medium",
  },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: "#00DEAB",
    borderColor: "#00DEAB",
  },
  selectAllText: {
    fontSize: 15,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: 8,
  },
});
