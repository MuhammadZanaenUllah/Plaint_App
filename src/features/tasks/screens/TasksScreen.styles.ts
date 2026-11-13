import { StyleSheet } from "react-native";

export default StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", position: "relative" },
  safe: { flex: 1 },
  statsScroll: { flexGrow: 0 },
  statsContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    alignItems: "center",
  },
  tableShell: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: 0,
  },
});