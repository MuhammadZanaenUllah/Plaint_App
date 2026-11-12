import React from "react";
import StatCard from "@/components/StatCard";
import {
  ScrollView,
  StyleProp,
  ViewStyle,
} from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

export type TaskStatItem = {
  id: string;
  label: string;
  count: string;
  iconName: React.ReactNode;
};

type Props = {
  items: TaskStatItem[];
  selectedTab: string;
  compact: boolean;
  scrollRef: React.Ref<ScrollView>;
  scrollStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onPress: (tabId: string) => void;
  onCardLayout: (tabId: string, x: number, width: number) => void;
};

export default function TaskStatsBar({
  items,
  selectedTab,
  compact,
  scrollRef,
  scrollStyle,
  contentContainerStyle,
  onPress,
  onCardLayout,
}: Props) {
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={scrollStyle}
      contentContainerStyle={contentContainerStyle}
    >
      {items.map((item) => (
        <Animated.View
          key={item.id}
          layout={LinearTransition.duration(160)}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            onCardLayout(item.id, x, width);
          }}
        >
          <StatCard
            label={item.label}
            count={item.count}
            iconName={item.iconName}
            active={selectedTab === item.id}
            onPress={() => onPress(item.id)}
            compact={compact}
          />
        </Animated.View>
      ))}
    </ScrollView>
  );
}
