import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export interface LeaveItem {
    id: string;
    leaveType: string;
    allowedLeaves: string;
    remainingLeaves: string;
    startDate: string;
    endDate: string;
    totalLeaves: number;
    status: "Approved" | "Absent" | "Pending" | "Disapproved";
    actionTakenBy: string;
    reason?: string;
}

interface LeaveDetailModalProps {
    visible: boolean;
    onClose: () => void;
    leave: LeaveItem | null;
}

export default function LeaveDetailModal({
    visible,
    onClose,
    leave,
}: LeaveDetailModalProps) {
    if (!leave) return null;

    // Helper to get status colors
    const getStatusStyles = (status: string) => {
        switch (status) {
            case "Approved":
                return {
                    bg: "#E6FBF3",
                    text: "#15803D", // Darker green text matching mockup
                    border: "#B3F5DF",
                };
            case "Absent":
            case "Disapproved":
                return {
                    bg: "#FFF5F5",
                    text: "#EF4444",
                    border: "#FFE4E6",
                };
            case "Pending":
            default:
                return {
                    bg: "#FEF3C7",
                    text: "#D97706",
                    border: "#FDE68A",
                };
        }
    };

    const statusStyle = getStatusStyles(leave.status);

    const rows = [
        { label: "Leave Type:", value: leave.leaveType },
        { label: "Allowed Leaves:", value: leave.allowedLeaves },
        { label: "Remaining Leaves:", value: leave.remainingLeaves },
        { label: "From:", value: leave.startDate },
        { label: "To:", value: leave.endDate },
        { label: "Total Days:", value: leave.totalLeaves.toString(), color: "#343A40" , },
        {
            label: "Status:",
            value: leave.status,
            isStatus: true,
        },
        { label: "Action Taken By:", value: leave.actionTakenBy, color: "#74788D" },
    ];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={() => {}}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Leave Details</Text>
                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={onClose}
                            activeOpacity={0.7}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={24} color="#1D1D1D" />
                        </TouchableOpacity>
                    </View>

                    {/* Table-like Rows */}
                    {rows.map((row, index) => (
                        <View key={index} style={styles.row}>
                            <View style={styles.labelCol}>
                                <Text style={styles.labelText}>{row.label}</Text>
                            </View>
                            <View style={styles.valueCol}>
                                {row.isStatus ? (
                                    <View
                                        style={[
                                            styles.statusBadge,
                                            {
                                                backgroundColor: statusStyle.bg,
                                                borderColor: statusStyle.border,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.statusText,
                                                { color: statusStyle.text },
                                            ]}
                                        >
                                            {row.value}
                                        </Text>
                                    </View>
                                ) : (
                                    <Text
                                        style={[
                                            styles.valueText,
                                            row.color ? { color: row.color } : null,
                                            row.label === "Total Days:" ? styles.boldValue : null,
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {row.value}
                                    </Text>
                                )}
                            </View>
                        </View>
                    ))}

                    {/* Reason Section */}
                    <View style={styles.reasonSection}>
                        <Text style={styles.reasonTitle}>Reason:</Text>
                        <Text style={styles.reasonText}>
                            {leave.reason || "No reason provided."}
                        </Text>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        paddingHorizontal: 20,
    },
    sheet: {
        backgroundColor: "#fff",
        borderRadius: 16,
        width: "100%",
        maxWidth: 400,
        padding: 24,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 14,
    },
    title: {
        fontSize: rf(18),
        fontFamily: "SF_Pro_Semibold",
        color: "#1D1D1D",
    },
    closeBtn: {
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
    },
    labelCol: {
        width: 140,
    },
    labelText: {
        fontSize: rf(14),
        fontFamily: "SF_Pro_Medium",
        color: "#495057",
    },
    valueCol: {
        flex: 1,
    },
    valueText: {
        fontSize: rf(14),
        fontFamily: "SF_Pro_Regular",
        color: "#212529",
    },
    statusBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
    },
    statusText: {
        fontSize: rf(12),
        fontFamily: "SF_Pro_Semibold",
    },
    reasonSection: {
        marginTop: 16,
    },
    reasonTitle: {
        fontSize: rf(14),
        fontFamily: "SF_Pro_Semibold",
        color: "#495057",
        marginBottom: 6,
    },
    reasonText: {
        fontSize: rf(14),
        fontFamily: "SF_Pro_Regular",
        color: "#666666",
        lineHeight: 20,
    },
  boldValue: {
//   fontWeight: "500",
fontFamily:"SF_Pro_Semibold"
},
});
