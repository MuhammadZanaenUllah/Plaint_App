import { Ionicons } from "@expo/vector-icons";
import type { StyleProp, ViewStyle } from "react-native";
import { TouchableOpacity } from "react-native";

type Props = {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
};

/** Shared modal close affordance, matching the Create Task modal header. */
export default function ModalCloseButton({
  onPress,
  disabled = false,
  style,
  hitSlop = 8,
}: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={[
        {
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: "transparent",
          alignItems: "center",
          justifyContent: "center",
        },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Ionicons name="close" size={22} color="#1D1D1D" />
    </TouchableOpacity>
  );
}
