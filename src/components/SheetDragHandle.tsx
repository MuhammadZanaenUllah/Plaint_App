import { StyleSheet, View } from "react-native";

/** Visual grip pill for a swipeable bottom sheet's drag zone. */
export default function SheetDragHandle() {
  return (
    <View style={styles.wrap}>
      <View style={styles.handle} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
});
