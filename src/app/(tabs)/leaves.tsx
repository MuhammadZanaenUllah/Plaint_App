import { rf } from "@/utils/responsive";
import DynamicTable, { Column } from "@/components/DynamicTable";
import FilterModal from "@/components/FilterModal";
import StatCard from "@/components/StatCard";
import LeaveDetailModal from "@/components/LeaveDetailModal";
import { Fontisto, Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface LeaveItem {
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

const LEAVES_DATA: LeaveItem[] = [
    {
        id: "1",
        leaveType: "Annual",
        allowedLeaves: "15",
        remainingLeaves: "10",
        startDate: "3, July",
        endDate: "3, July",
        totalLeaves: 0.5,
        status: "Approved",
        actionTakenBy: "Muhammad Zanaen UII...",
        reason: "Half-day leave today due to an urgent personal piece of work.",
    },
    {
        id: "2",
        leaveType: "Annual",
        allowedLeaves: "15",
        remainingLeaves: "10.5",
        startDate: "11, May",
        endDate: "11, May",
        totalLeaves: 0.5,
        status: "Approved",
        actionTakenBy: "Muhammad Zanaen UII...",
        reason: "Personal work.",
    },
    {
        id: "3",
        leaveType: "Absent",
        allowedLeaves: "N/A",
        remainingLeaves: "N/A",
        startDate: "24, March",
        endDate: "24, March",
        totalLeaves: 1,
        status: "Absent",
        actionTakenBy: "System",
        reason: "Absent due to medical emergency.",
    },
    {
        id: "4",
        leaveType: "Annual",
        allowedLeaves: "15",
        remainingLeaves: "11",
        startDate: "19, March",
        endDate: "19, March",
        totalLeaves: 1,
        status: "Approved",
        actionTakenBy: "-",
        reason: "Family function.",
    },
];

export default function Dashboard() {
   const [searchFilterVisible, setSearchFilterVisible] = useState(false);
   const [leaveFilterVisible, setLeaveFilterVisible] = useState(false);
    const [reason, setReason] = useState("");
    const [createVisible, setCreateVisible] = useState(false);
    const [detailVisible, setDetailVisible] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState<LeaveItem | null>(null);
    const [leaves, setLeaves] = useState<LeaveItem[]>(LEAVES_DATA);

    const handleViewDetails = (item: LeaveItem) => {
        setSelectedLeave(item);
        setDetailVisible(true);
    };

    const statuses = [
        "All",
        "Pending",
        "Approved",
        "Disapproved",
        "Late-In",
        "Absent",
        "OT Grant",
    ];

    const statusColors = {
        All: "#DFA70D",
        Pending: "#607EF9",
        Approved: "#0DDFAB",
        Disapproved: "#FF0000",
        "Late-In": "#1D1D1D",
        Absent: "#FF0000",
        "OT Grant": "#1CB333",
    };

    const columns = useMemo<Column<LeaveItem>[]>(
        () => [
            {
                key: "leaveType",
                title: "Leave Type",
                width: 110,
                render: (item) => <Text style={styles.cellText}>{item.leaveType}</Text>,
            },
            {
                key: "allowedLeaves",
                title: "Allowed Leaves",
                width: 110,
                render: (item) => <Text style={styles.cellText}>{item.allowedLeaves}</Text>,
            },
            {
                key: "remainingLeaves",
                title: "Remaining Leaves",
                width: 130,
                render: (item) => <Text style={styles.cellText}>{item.remainingLeaves}</Text>,
            },
            {
                key: "startDate",
                title: "Start Date",
                width: 120,
                render: (item) => (
                    <View style={styles.dateCell}>
                        <Ionicons
                            name="calendar-outline"
                            size={15}
                            color="#0DDFAB"
                            style={{ marginRight: 4 }}
                        />
                        <Text style={styles.cellText}>{item.startDate}</Text>
                    </View>
                ),
            },
            {
                key: "endDate",
                title: "End Date",
                width: 120,
                render: (item) => (
                    <View style={styles.dateCell}>
                        <Ionicons
                            name="calendar-outline"
                            size={15}
                            color="#0DDFAB"
                            style={{ marginRight: 4 }}
                        />
                        <Text style={styles.cellText}>{item.endDate}</Text>
                    </View>
                ),
            },
            {
                key: "totalLeaves",
                title: "Total Leaves",
                width: 100,
                render: (item) => <Text style={styles.cellText}>{item.totalLeaves}</Text>,
            },
            {
                key: "status",
                title: "Status",
                width: 120,
                render: (item) => {
                    let bg = "#FEF3C7";
                    let text = "#D97706";
                    let border = "#FDE68A";
                    if (item.status === "Approved") {
                        bg = "#E6FBF3";
                        text = "#0DDFAB";
                        border = "#B3F5DF";
                    } else if (item.status === "Absent" || item.status === "Disapproved") {
                        bg = "#FFF5F5";
                        text = "#EF4444";
                        border = "#FFE4E6";
                    }
                    return (
                        <View style={[styles.statusBadge, { backgroundColor: bg, borderColor: border }]}>
                            <Text style={[styles.statusBadgeText, { color: text }]}>{item.status}</Text>
                        </View>
                    );
                },
            },
            {
                key: "actionTakenBy",
                title: "Action Taken By",
                width: 160,
                render: (item) => <Text style={styles.cellText} numberOfLines={1}>{item.actionTakenBy}</Text>,
            },
            {
                key: "action",
                title: "Action",
                width: 80,
                render: (item) => (
                    <TouchableOpacity
                        style={styles.actionCell}
                        activeOpacity={0.7}
                        onPress={() => handleViewDetails(item)}
                    >
                        <Ionicons name="eye-outline" size={18} color="#4B5563" />
                    </TouchableOpacity>
                ),
            },
        ],
        []
    );

    return (    
            <View style={styles.root}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* LEAVE BALANCE Row */}
                    <View style={styles.sectionRow}>
                        <View style={styles.sectionLabelContainer}>
                            <Text style={styles.sectionLabel}>LEAVE BALANCE</Text>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.cardsScroll}
                            contentContainerStyle={styles.cardsContent}
                        >
                            <StatCard label="ANNUAL" count="10 days" style={styles.leaveCard} cardContentStyle={styles.alignment} />
                            <StatCard label="PATERNITY" count="3 days" style={styles.leaveCard} cardContentStyle={styles.alignment} />
                            <StatCard label="MARRIAGE LEAVE" count="15 days" style={styles.leaveCard} cardContentStyle={styles.alignment} />
                            <StatCard label="UMRAH" count="15 days" style={styles.leaveCard} cardContentStyle={styles.alignment} />
                            <StatCard label="HAJJ" count="38 days" style={styles.leaveCard} cardContentStyle={styles.alignment} />
                            <StatCard label="BEREAVEMENT" count="5 days" style={styles.leaveCard} cardContentStyle={styles.alignment} />
                        </ScrollView>
                    </View>

                    {/* TOTAL ABSENTS Row */}
                    <View style={styles.sectionRow}>
                        <View style={styles.sectionLabelContainer}>
                            <View style={styles.absentsLabelWrap}>
                                <Text style={styles.sectionLabel}>TOTAL ABSENTS</Text>
                                <Ionicons
                                    name="information-circle"
                                    size={15}
                                    color="#1D1D1D"
                                    style={styles.infoIcon}
                                />
                            </View>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.cardsScroll}
                            contentContainerStyle={styles.cardsContent}
                        >
                            <StatCard
                                label="ABSENTS"
                                count="1 days"
                                style={styles.absentCard}
                                cardContentStyle={styles.alignment}
                                labelStyle={styles.absentText}
                                countStyle={styles.absentText}
                            />
                        </ScrollView>
                    </View>

                    {/* Leaves Table */}
                    <View style={styles.tableContainer}>
                        <DynamicTable<LeaveItem>
                            columns={columns}
                            data={leaves}
                            keyExtractor={(item) => item.id}
                            emptyText="No leaves found."
                            collapsible={false}
                        />
                    </View>
                </ScrollView>

                <FilterModal
                    visible={searchFilterVisible}
                    onClose={() => setSearchFilterVisible(false)}
                    statuses={statuses}
                    statusColors={statusColors}
                    showPriority={false}
                     showLeaveMode={false}
                     showLeaveType={false}
                      showReasonInput={false}
                />

                {/* FAB */}
                <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => setLeaveFilterVisible(true)}>
                    <Fontisto name="plus-a" size={24} color="black" />
                </TouchableOpacity>

                {/* <CreateTaskModal visible={createVisible} onClose={() => setCreateVisible(false)} /> */}
                <FilterModal
  visible={leaveFilterVisible}
  onClose={() => setLeaveFilterVisible(false)}

  // Hide
  showStatus={false}
  showPriority={false}

  // Show
  showLeaveMode={true}
  leaveModes={["Full Day", "Half-Day"]}
  leaveModeColors={{
    "Full Day": "#00DEAB",
    "Half-Day": "#607EF9",
  }}

  showLeaveType={true}
  leaveTypes={["Annual", "Paternity", "Marriage Leave","Umrah","Hajj","Bereavement"]}
  leaveTypeColors={{
    Annual: "#00DEAB",
    Paternity: "#F59E0B",
    "Marriage Leave": "#EF4444",
    Umrah: "#EF4444",
    Hajj: "#EF4444",
    Bereavement: "#EF4444",
  }}

  showReasonInput={true}
  reasonValue={reason}
  onChangeReason={setReason}
/>

                <LeaveDetailModal
                    visible={detailVisible}
                    onClose={() => setDetailVisible(false)}
                    leave={selectedLeave}
                />
            </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "#fff",
        position: "relative",
    },
    // safe: {
    //     flex: 1,
    // },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 60,
    },
    sectionRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    sectionLabelContainer: {
        width: 110,
        justifyContent: "center",
    },
    sectionLabel: {
        fontSize: rf(10),
        fontFamily: "SF_Pro_Medium",
        color: "#737373",
        // fontWeight: "700",
    },
    absentsLabelWrap: {
        flexDirection: "row",
        alignItems: "center",
    },
    infoIcon: {
        marginLeft: 4,
    },
    cardsScroll: {
        flex: 1,
        maxHeight: 50,
    },
    cardsContent: {
        // paddingBottom: 6,
        // paddingHorizontal: 4,
        gap: 8,
    },
    absentCard: {
        backgroundColor: "#FFF5F5",
        borderColor: "#FFE4E6",
        borderWidth: 1,
        height: 40,
        borderRadius: 2,
    },
    leaveCard: {
        height: 40,
        borderRadius: 2,
    },
    alignment: {
        alignItems: "center",
        justifyContent: "center",
    },
    absentText: {
        color: "#FF5A5A",
    },
    tableContainer: {
        marginTop: 20,
    },
    cellText: {
        fontSize: rf(12),
        color: "#1D1D1D",
        flexShrink: 1,
        fontFamily: "SF_Pro_Medium",
    },
    dateCell: {
        flexDirection: "row",
        alignItems: "center",
    },
    statusBadge: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        alignSelf: "flex-start",
    },
    statusBadgeText: {
        fontSize: rf(11),
        fontWeight: "600",
        fontFamily: "SF_Pro_Medium",
    },
    actionCell: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
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
});