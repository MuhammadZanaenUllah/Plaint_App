import React from "react";
import TaskTableSkeleton from "@/components/TaskTableSkeleton";
import {
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from "react-native";

type Props = {
  loading: boolean;
  error: string | null;
  hasTasks: boolean;
  stale?: boolean;
  offline?: boolean;
  sectionTitle: string;
  onRetry: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function TaskListSection({
  loading,
  error,
  hasTasks,
  stale = false,
  offline = false,
  sectionTitle,
  onRetry,
  containerStyle,
  children,
}: Props) {
  if (loading && !hasTasks) {
    return (
      <View style={[containerStyle, { flex: 1 }]}>
        <TaskTableSkeleton sectionTitle={sectionTitle} />
      </View>
    );
  }

  if (error && !hasTasks) {
    return (
      <View
        style={[
          containerStyle,
          {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          },
        ]}
        >
          <Text style={{ textAlign: "center" }}>
            {offline
              ? "You appear to be offline. Check your connection and retry."
              : error}
          </Text>
          <Pressable onPress={onRetry} accessibilityRole="button">
            <Text style={{ marginTop: 12, color: "#2563EB" }}>Retry</Text>
          </Pressable>
        </View>
    );
  }

  return (
    <View style={containerStyle}>
      {offline ? (
        <Text style={{ marginBottom: 4, color: "#B45309" }}>
          You appear to be offline. Showing cached tasks; pull to retry.
        </Text>
      ) : null}
      {stale ? (
        <Text style={{ marginBottom: 4, color: "#6B7280" }}>
          Showing partial or cached task data.
        </Text>
      ) : null}
      {error ? (
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "#B91C1C", flex: 1 }}>{error}</Text>
          <Pressable onPress={onRetry} accessibilityRole="button">
            <Text style={{ marginLeft: 12, color: "#2563EB" }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {children}
    </View>
  );
}
