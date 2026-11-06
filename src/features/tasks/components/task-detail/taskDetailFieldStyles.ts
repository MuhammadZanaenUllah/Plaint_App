// Styles for the extracted task-detail rows (AUD-081 phase 3).
// Values are copied verbatim from TaskDetailModal.

import { rf } from "@/utils/responsive";
import { StyleSheet } from "react-native";

export const taskDetailFieldStyles = StyleSheet.create({
  editableTaskTitle: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 10,
    paddingVertical: 3,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabelWrap: { flexDirection: "row", alignItems: "center", flex: 1.2 },
  infoLabel: {
    fontSize: rf(11),
    color: "#6B7280",
    fontFamily: "SF_Pro_Semibold",
  },
  infoValueWrap: { flex: 1.5, flexShrink: 1 },
  infoValue: {
    fontSize: rf(12),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    flexShrink: 1,
  },
  assignedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    flexShrink: 1,
    justifyContent: "flex-start",
  },
  taskPriorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  taskPriorityBadgeCritical: {
    backgroundColor: "#FEE7E7",
  },
  taskPriorityBadgeNormal: {
    backgroundColor: "#E6FBF5",
  },
  taskPriorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  taskPriorityBadgeText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: rf(11), fontFamily: "SF_Pro_Medium" },
  depPill: {
    backgroundColor: "#F0FFF8",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  depPillText: {
    fontSize: rf(11),
    color: "#00DEAB",
    fontFamily: "SF_Pro_Regular",
  },
  addDependencyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 4,
  },
  addDependencyText: {
    fontSize: rf(11),
    color: "#00DEAB",
    fontFamily: "SF_Pro_Medium",
  },
  section: { marginTop: 16 },
  descHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
    marginBottom: 8,
  },
  descBadgeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#1D1D1D",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  descBadgeChipText: {
    fontSize: rf(10),
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Medium",
  },
  dependencyTableWrap: {
    marginTop: 18,
  },
  bottomAttachmentSection: {
    marginTop: 14,
    marginBottom: 8,
  },
  bottomAttachmentText: {
    fontSize: rf(12),
    color: "#8E8E93",
    fontFamily: "SF_Pro_Medium",
  },
  attachTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1D1D1D",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
  },
  attachTagText: {
    fontSize: rf(11),
    color: "#00DEAB",
    fontFamily: "SF_Pro_Regular",
  },
});
