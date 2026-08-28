import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
    Animated,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskDelayProps = {
    visible: boolean;
    taskTitle: string;
    assignedTo: string;
    onClose: () => void;
    onExtend: (effort: string, unit: string) => void;
};

const UNITS = ["Mins", "Hours", "Days"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaskDelay({
    visible,
    taskTitle,
    assignedTo,
    onClose,
    onExtend,
}: TaskDelayProps) {
    const [effort, setEffort] = useState("");
    const [unit, setUnit] = useState("Mins");
    const [unitOpen, setUnitOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    // Floating label animation
    const labelAnim = useRef(new Animated.Value(0)).current;

    const animateLabel = (toTop: boolean) => {
        Animated.timing(labelAnim, {
            toValue: toTop ? 1 : 0,
            duration: 180,
            useNativeDriver: false,
        }).start();
    };

    const labelTop = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [14, -9] });
    const labelSize = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 11] });
    const labelColor = labelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["#9CA3AF", "#1D1D1D"],
    });

    const handleFocus = () => {
        setIsFocused(true);
        animateLabel(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
        if (!effort) animateLabel(false);
    };

    const handleExtend = () => {
        if (!effort.trim()) return;
        onExtend(effort.trim(), unit);
        setEffort("");
        setUnit("Mins");
        animateLabel(false);
    };

    const handleClose = () => {
        setEffort("");
        setUnit("Mins");
        animateLabel(false);
        setUnitOpen(false);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            {/* Backdrop */}
            <Pressable style={styles.backdrop} onPress={handleClose}>
                <Pressable style={styles.card} onPress={() => setUnitOpen(false)}>

                    {/* ── Header ─────────────────────────────────────────── */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Task Delayed</Text>
                        <TouchableOpacity
                            onPress={handleClose}
                            hitSlop={10}
                            activeOpacity={0.5}
                            style={styles.closeBtn}
                        >
                            <Ionicons name="close" size={18} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    {/* ── Body Text ──────────────────────────────────────── */}
                    <Text style={styles.body}>
                        {"You assigned "}
                        <Text style={styles.taskLink}>{taskTitle}</Text>
                        {" to "}
                        <Text style={styles.bold}>{assignedTo}</Text>
                        {" and it is now delayed. Do you want to increase the effort? If yes, please input the effort below, otherwise close."}
                    </Text>

                    {/* ── Effort Input ───────────────────────────────────── */}
                    <View style={styles.inputWrapper}>
                        {/* Floating Label */}
                        <Animated.Text
                            style={[
                                styles.floatingLabel,
                                {
                                    top: labelTop,
                                    fontSize: labelSize,
                                    color: labelColor,
                                    backgroundColor: "#fff",
                                },
                            ]}
                        >
                            Effort *
                        </Animated.Text>

                        <View
                            style={[
                                styles.inputInner,
                                isFocused && styles.inputInnerFocused,
                            ]}
                        >
                            <TextInput
                                style={styles.textInput}
                                value={effort}
                                onChangeText={setEffort}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                keyboardType="numeric"
                                placeholder=""
                                returnKeyType="done"
                            />

                            {/* Divider */}
                            <View style={styles.unitDivider} />

                            {/* Unit Picker */}
                            <TouchableOpacity
                                style={styles.unitBtn}
                                activeOpacity={0.7}
                                onPress={() => setUnitOpen((o) => !o)}
                            >
                                <Text style={styles.unitText}>{unit}</Text>
                                <Ionicons
                                    name={unitOpen ? "chevron-up" : "chevron-down"}
                                    size={13}
                                    color="#4B5563"
                                    style={{ marginLeft: 3 }}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Dropdown */}
                        {unitOpen && (
                            <View style={styles.dropdown}>
                                {UNITS.map((u) => (
                                    <TouchableOpacity
                                        key={u}
                                        style={[
                                            styles.dropdownItem,
                                            u === unit && styles.dropdownItemActive,
                                        ]}
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            setUnit(u);
                                            setUnitOpen(false);
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.dropdownItemText,
                                                u === unit && styles.dropdownItemTextActive,
                                            ]}
                                        >
                                            {u}
                                        </Text>
                                        {u === unit && (
                                            <Ionicons name="checkmark" size={14} color="#00DEAB" />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* ── Actions ────────────────────────────────────────── */}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.cancelBtn}
                            activeOpacity={0.6}
                            onPress={handleClose}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.extendBtn,
                                !effort.trim() && styles.extendBtnDisabled,
                            ]}
                            activeOpacity={0.75}
                            onPress={handleExtend}
                            disabled={!effort.trim()}
                        >
                            <Text style={styles.extendText}>Extend Task</Text>
                        </TouchableOpacity>
                    </View>

                </Pressable>
            </Pressable>
        </Modal>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.45)",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 20,
    },
    card: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: "#fff",
        borderRadius: 14,
        paddingHorizontal: 22,
        paddingTop: 20,
        paddingBottom: 22,
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.15,
                shadowRadius: 20,
            },
            android: { elevation: 12 },
        }),
    },

    // Header
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
    },
    title: {
        fontSize: rf(17),
        fontWeight: "700",
        color: "#111827",
        letterSpacing: -0.2,
    },
    closeBtn: {
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        backgroundColor: "#F3F4F6",
    },

    // Body
    body: {
        fontSize: rf(13.5),
        lineHeight: 21,
        color: "#4B5563",
        marginBottom: 22,
    },
    taskLink: {
        color: "#00DEAB",
        textDecorationLine: "underline",
        fontWeight: "500",
    },
    bold: {
        fontWeight: "700",
        color: "#111827",
    },

    // Input
    inputWrapper: {
        position: "relative",
        marginBottom: 24,
    },
    floatingLabel: {
        position: "absolute",
        left: 12,
        zIndex: 10,
        paddingHorizontal: 3,
        fontWeight: "500",
    },
    inputInner: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1.5,
        borderColor: "#D1D5DB",
        borderRadius: 8,
        paddingLeft: 12,
        paddingRight: 0,
        height: 50,
    },
    inputInnerFocused: {
            borderColor: "#1D1D1D",
    },
    textInput: {
        flex: 1,
        fontSize: rf(14),
        color: "#111827",
        paddingVertical: 0,
        height: "100%",
    },
    unitDivider: {
        width: 1,
        height: 28,
        backgroundColor: "#E5E7EB",
        marginHorizontal: 4,
    },
    unitBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        height: "100%",
    },
    unitText: {
        fontSize: rf(13.5),
        color: "#374151",
        fontWeight: "500",
    },

    // Dropdown
    dropdown: {
        position: "absolute",
        top: 54,
        right: 0,
        backgroundColor: "#fff",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        zIndex: 100,
        minWidth: 110,
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
            },
            android: { elevation: 8 },
        }),
    },
    dropdownItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 11,
    },
    dropdownItemActive: {
        backgroundColor: "#F0FFF8",
    },
    dropdownItemText: {
        fontSize: rf(13.5),
        color: "#374151",
    },
    dropdownItemTextActive: {
        color: "#00DEAB",
        fontWeight: "600",
    },

    // Actions
    actions: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 10,
    },
    cancelBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: "#D1D5DB",
        backgroundColor: "#fff",
    },
    cancelText: {
        fontSize: rf(13.5),
        fontWeight: "600",
        color: "#6B7280",
    },
    extendBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: "#00DEAB",
    },
    extendBtnDisabled: {
        backgroundColor: "#A7F3E0",
    },
    extendText: {
        fontSize: rf(13.5),
        fontWeight: "700",
        color: "#fff",
    },
});
