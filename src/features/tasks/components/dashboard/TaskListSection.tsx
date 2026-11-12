import React from "react";
import TaskTableSkeleton from "@/components/TaskTableSkeleton";
import { StyleProp, View, ViewStyle } from "react-native";

type Props = {
  loading: boolean;
  hasTasks: boolean;
  sectionTitle: string;
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function TaskListSection({
  loading,
  hasTasks,
  sectionTitle,
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

  return <View style={containerStyle}>{children}</View>;
}
