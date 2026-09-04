import type { MappedTaskRow } from "@/utils/statusMapper";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

type Props = {
  visible: boolean;
  onClose: () => void;
  /** All selectable tasks (parent already filters to Pending/In-Progress). */
  availableTasks: MappedTaskRow[];
  /** Currently selected dependency task ids. */
  selectedIds: number[];
  onToggle: (taskId: number) => void;
};

const PAGE_SIZE = 20;
/** Simulated "network" delay for appending the next page (ms). */
const PAGE_LOAD_DELAY = 300;

export default function DependencyModal({
  visible,
  onClose,
  availableTasks,
  selectedIds,
  onToggle,
}: Props) {
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  // Number of task items currently rendered (progressive pagination).
  const [renderedCount, setRenderedCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter the full list by the current search query.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableTasks;
    return availableTasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [availableTasks, search]);

  // Reset pagination whenever the modal opens or the search changes.
  useEffect(() => {
    setRenderedCount(PAGE_SIZE);
  }, [visible, search]);

  // Clean up any pending page timer on unmount.
  useEffect(() => {
    return () => {
      if (pageTimer.current) clearTimeout(pageTimer.current);
    };
  }, []);

  const hasMore = renderedCount < filtered.length;
  const displayed = filtered.slice(0, renderedCount);

  const loadMore = useCallback(() => {
    if (loadingMore || renderedCount < PAGE_SIZE) return;
    if (!hasMore) return;
    setLoadingMore(true);
    // Small delay simulates fetching the next page from the server and lets
    // the loader animate, while appending from the already-in-memory list.
    pageTimer.current = setTimeout(() => {
      setRenderedCount((prev) => prev + PAGE_SIZE);
      setLoadingMore(false);
    }, PAGE_LOAD_DELAY);
  }, [loadingMore, renderedCount, hasMore]);

  const reset = () => {
    setSearch("");
    setFocused(false);
    setRenderedCount(PAGE_SIZE);
    setLoadingMore(false);
    if (pageTimer.current) clearTimeout(pageTimer.current);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.overlay} onPress={handleClose}>
          <View style={styles.backdropDim} />

          <Pressable style={styles.card} onPress={() => {}}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Select Dependencies</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={8}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={18} color="#1D1D1D" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View
              style={[styles.searchWrap, focused && styles.searchWrapActive]}
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={focused || search.length > 0 ? "#1D1D1D" : "#AAAAAA"}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Search tasks..."
                placeholderTextColor="#AAAAAA"
                returnKeyType="search"
              />
            </View>

            {/* List */}
            {displayed.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No tasks found</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onScroll={({ nativeEvent }) => {
                  const { layoutMeasurement, contentOffset, contentSize } =
                    nativeEvent;
                  // Trigger when within ~40px of the bottom.
                  if (
                    layoutMeasurement.height + contentOffset.y >=
                    contentSize.height - 40
                  ) {
                    loadMore();
                  }
                }}
                scrollEventThrottle={16}
              >
                {displayed.map((task, index) => {
                  const taskId = Number(task.id);
                  const isSelected = selectedIds.includes(taskId);
                  const initials =
                    task.title
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0] ?? "")
                      .join("")
                      .toUpperCase() || "SB";
                  const isLast = index === displayed.length - 1;

                  return (
                    <TouchableOpacity
                      key={task.id}
                      style={[
                        styles.row,
                        isLast && { borderBottomWidth: 0 },
                        isSelected && styles.rowSelected,
                      ]}
                      onPress={() => onToggle(taskId)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials}</Text>
                      </View>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {task.title}
                      </Text>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#0DDFAB"
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {/* Bottom loader while the next page "loads" */}
                {loadingMore && (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator color="#0DDFAB" size="small" />
                  </View>
                )}
                {!loadingMore && !hasMore && displayed.length > 0 && (
                  <View style={styles.endWrap}>
                    <Text style={styles.endText}>End of tasks</Text>
                  </View>
                )}
              </ScrollView>
            )}

            {/* Done */}
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={handleClose}
              activeOpacity={0.85}
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  backdropDim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    // Smaller modal: cap height so it stays compact even with many tasks.
    maxHeight: "55%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 12,
  },
  title: {
    fontSize: rf(18),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    flex: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 10,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  searchWrapActive: {
    borderColor: "#1D1D1D",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: rf(14),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
    height: "100%",
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#fff",
    gap: 12,
  },
  rowSelected: {
    backgroundColor: "#F9FAF9",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#00DEAB",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
  },
  rowTitle: {
    flex: 1,
    fontSize: rf(14),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  empty: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: rf(13),
    color: "#AAAAAA",
    fontFamily: "SF_Pro_Regular",
  },
  loaderWrap: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  endWrap: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  endText: {
    fontSize: rf(12),
    color: "#AAAAAA",
    fontFamily: "SF_Pro_Regular",
  },
  doneBtn: {
    backgroundColor: "#0DDFAB",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  doneText: {
    color: "#fff",
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
  },
});
